import { create } from 'zustand'
import type { GeneratedFile } from '@awaitstep/codegen'
import { liveDrafts, type Draft, type Drafts } from '../lib/ide/drafts'
import {
  closeAllTabs,
  closeTab,
  cycleTab,
  openTab,
  pruneTabs,
  type TabState,
} from '../lib/ide/tabs'

export type IdeDialog =
  'palette' | 'quickOpen' | 'newFile' | 'renameFile' | 'deleteFile' | 'convertHandlers'

export interface RevealTarget {
  path: string
  line: number
  column: number
}

export interface IdeSessionState extends TabState {
  /** A location the editor should scroll to once its model is active. */
  reveal: RevealTarget | null
  /** At most one modal at a time, so shortcuts can never stack dialogs. */
  dialog: IdeDialog | null
  /** The file a rename/delete dialog is about. */
  dialogTarget: string | null
  /** Unsaved editor text per path; compared against the loaded baseline. */
  drafts: Drafts

  openFile: (path: string) => void
  revealLocation: (target: RevealTarget) => void
  clearReveal: () => void
  closeFile: (path: string) => void
  closeAllFiles: () => void
  cycleFile: (direction: 1 | -1) => void
  pruneFiles: (existing: Iterable<string>) => void
  /**
   * Records unsaved text. `baseHash` is the server hash the edit started
   * from and is kept across later keystrokes, so a save is conditional on
   * what the user actually read.
   */
  setDraft: (path: string, source: string, baseHash: string | null) => void
  /** After a successful save: the draft now builds on the hash the server returned. */
  rebaseDraft: (path: string, hash: string) => void
  clearDraft: (path: string) => void
  clearDrafts: () => void
  /** Carries a draft (and its tab) along with a renamed file. */
  moveFile: (from: string, to: string) => void
  /** Drops drafts that no longer differ from the baseline (saved or reverted). */
  reconcileDrafts: (files: ReadonlyMap<string, GeneratedFile>) => void
  showDialog: (dialog: IdeDialog, target?: string) => void
  closeDialog: () => void
  /** Back to a blank workspace; layout preferences live in the layout store. */
  resetSession: () => void
}

const initialSession = {
  openPaths: [] as string[],
  activePath: null as string | null,
  reveal: null as RevealTarget | null,
  dialog: null as IdeDialog | null,
  dialogTarget: null as string | null,
  drafts: {} as Drafts,
}

function without(drafts: Drafts, path: string): Drafts {
  if (!(path in drafts)) return drafts
  const next = { ...drafts }
  delete next[path]
  return next
}

/** Per-workflow workspace state: open tabs, drafts, pending reveal, the open dialog. */
export const useIdeStore = create<IdeSessionState>()((set, get) => ({
  ...initialSession,

  openFile: (path) => set(openTab(get(), path)),
  revealLocation: (target) => set({ ...openTab(get(), target.path), reveal: target }),
  clearReveal: () => set({ reveal: null }),
  closeFile: (path) => set(closeTab(get(), path)),
  closeAllFiles: () => set(closeAllTabs()),
  cycleFile: (direction) => set(cycleTab(get(), direction)),
  pruneFiles: (existing) => set(pruneTabs(get(), new Set(existing))),
  setDraft: (path, source, baseHash) => {
    const existing = get().drafts[path]
    const draft: Draft = { source, baseHash: existing ? existing.baseHash : baseHash }
    set({ drafts: { ...get().drafts, [path]: draft } })
  },
  rebaseDraft: (path, hash) => {
    const existing = get().drafts[path]
    if (!existing) return
    set({ drafts: { ...get().drafts, [path]: { ...existing, baseHash: hash } } })
  },
  clearDraft: (path) => set({ drafts: without(get().drafts, path) }),
  clearDrafts: () => set({ drafts: {} }),
  moveFile: (from, to) => {
    const state = get()
    const draft = state.drafts[from]
    const drafts = draft ? { ...without(state.drafts, from), [to]: draft } : state.drafts
    const wasOpen = state.openPaths.includes(from)
    const tabs = wasOpen ? openTab(closeTab(state, from), to) : state
    set({ ...tabs, drafts })
  },
  reconcileDrafts: (files) => {
    const current = get().drafts
    const next = liveDrafts(files, current)
    if (next !== current) set({ drafts: next })
  },
  showDialog: (dialog, target) => set({ dialog, dialogTarget: target ?? null }),
  closeDialog: () => set({ dialog: null, dialogTarget: null }),
  resetSession: () => set(initialSession),
}))
