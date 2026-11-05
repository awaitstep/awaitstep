import { create } from 'zustand'
import type { GeneratedFile } from '@awaitstep/codegen'
import { guardClose, type CloseRequest } from '../lib/ide/close-guard'
import { liveDrafts, type Draft, type Drafts } from '../lib/ide/drafts'
import {
  REVIEW_TAB_ID,
  closeAllTabs,
  closeTab,
  closeTabs,
  compareTabId,
  cycleTab,
  openTab,
  pruneTabs,
  type TabState,
} from '../lib/ide/tabs'

export type IdeDialog = 'palette' | 'quickOpen' | 'renameFile' | 'deleteFile' | 'convertHandlers'

export interface RevealTarget {
  path: string
  line: number
  column: number
  /** Selects from `column` to here on the same line, for a search hit. */
  endColumn?: number
}

/** What a reload brought back, shown in the banner until it is used or dismissed. */
export interface RestoreNotice {
  /** The restored files, in the order they should open. */
  paths: string[]
  /** The subset whose server copy changed since the edit began. */
  changedOnServer: string[]
  /** The subset whose file was deleted on the server; the unsaved copy is kept. */
  deleted: string[]
}

/** The mounted editor, for things outside it that need to drive it. */
export interface EditorHandle {
  focus: () => void
  /** Runs a Monaco action by id, e.g. `editor.action.gotoLine`. */
  trigger: (actionId: string) => void
  /**
   * What Search should start from: the selected text, else the word at the
   * caret. Null when the editor does not have the keyboard, so a shortcut
   * pressed from the Search box never overwrites what was typed there;
   * `ignoreFocus` reads it anyway (the palette holds the keyboard).
   */
  searchSeed: (ignoreFocus?: boolean) => string | null
}

/** A save the server refused because the file changed: what it holds now. */
export interface SaveConflict {
  currentHash: string | null
}

export interface CursorPosition {
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
  /** A close waiting on Save / Don't save / Cancel; null when none is. */
  closeRequest: CloseRequest | null
  restoreNotice: RestoreNotice | null
  /** Where the caret is in the active editor; the status bar shows it. */
  cursor: CursorPosition
  /** The file the Unsaved changes tab shows; null means the first dirty file. */
  reviewPath: string | null
  /** The review tab shows changes inline instead of side by side. */
  reviewInline: boolean
  /** Files whose last save was refused because they changed on the server. */
  conflicts: Readonly<Record<string, SaveConflict>>
  /**
   * Files whose "changed on the server" banner was dismissed, with the
   * server hash they were dismissed at: a further change brings it back.
   */
  dismissedOutside: Readonly<Record<string, string | null>>
  /** Not reactive state: set when the editor mounts, read when something must drive it. */
  editorHandle: EditorHandle | null

  openFile: (path: string) => void
  revealLocation: (target: RevealTarget) => void
  clearReveal: () => void
  closeFile: (path: string) => void
  closeAllFiles: () => void
  /** Closes tabs without asking; callers have settled what happens to their drafts. */
  closeFiles: (paths: readonly string[]) => void
  /**
   * Closes tabs, or — when any has unsaved text — files a request for the
   * dialog to ask about. The tab strip, shortcuts and palette all come here.
   */
  requestClose: (paths: readonly string[]) => void
  cancelClose: () => void
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
  /** Replaces every draft at once (an Undo, a restore after reload). */
  replaceDrafts: (drafts: Drafts) => void
  /** Opens the Unsaved changes tab, on `path` when given. */
  openReview: (path?: string) => void
  setReviewPath: (path: string | null) => void
  setReviewInline: (inline: boolean) => void
  /** Opens (or focuses) the Compare tab for a file. */
  openCompare: (path: string) => void
  setConflict: (path: string, conflict: SaveConflict) => void
  clearConflict: (path: string) => void
  dismissOutside: (path: string, serverHash: string | null) => void
  setRestoreNotice: (notice: RestoreNotice | null) => void
  setCursor: (cursor: CursorPosition) => void
  setEditorHandle: (handle: EditorHandle | null) => void
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
  closeRequest: null as CloseRequest | null,
  restoreNotice: null as RestoreNotice | null,
  cursor: { line: 1, column: 1 } as CursorPosition,
  reviewPath: null as string | null,
  reviewInline: false,
  conflicts: {} as Readonly<Record<string, SaveConflict>>,
  dismissedOutside: {} as Readonly<Record<string, string | null>>,
  editorHandle: null as EditorHandle | null,
}

function without<T>(record: Readonly<Record<string, T>>, path: string): Record<string, T> {
  if (!(path in record)) return record
  const next = { ...record }
  delete next[path]
  return next
}

/** Per-file flags only mean something while the file still has an unsaved copy. */
function onlyDrafted<T>(
  record: Readonly<Record<string, T>>,
  drafts: Drafts,
): Readonly<Record<string, T>> {
  const stale = Object.keys(record).filter((path) => !(path in drafts))
  if (stale.length === 0) return record
  const next = { ...record }
  for (const path of stale) delete next[path]
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
  closeFiles: (paths) => set({ ...closeTabs(get(), paths), closeRequest: null }),
  requestClose: (paths) => {
    const dirty = new Set(Object.keys(get().drafts))
    const request = guardClose(paths, dirty)
    if (request) set({ closeRequest: request })
    else set(closeTabs(get(), paths))
  },
  cancelClose: () => set({ closeRequest: null }),
  cycleFile: (direction) => set(cycleTab(get(), direction)),
  pruneFiles: (existing) =>
    set(pruneTabs(get(), new Set(existing), new Set(Object.keys(get().drafts)))),
  setDraft: (path, source, baseHash) => {
    const existing = get().drafts[path]
    const draft: Draft = { source, baseHash: existing ? existing.baseHash : baseHash }
    set({ drafts: { ...get().drafts, [path]: draft } })
  },
  rebaseDraft: (path, hash) => {
    const existing = get().drafts[path]
    if (!existing) return
    const { conflicts, dismissedOutside } = get()
    set({
      drafts: { ...get().drafts, [path]: { ...existing, baseHash: hash } },
      conflicts: without(conflicts, path),
      dismissedOutside: without(dismissedOutside, path),
    })
  },
  clearDraft: (path) =>
    set({
      drafts: without(get().drafts, path),
      conflicts: without(get().conflicts, path),
      dismissedOutside: without(get().dismissedOutside, path),
    }),
  clearDrafts: () => set({ drafts: {}, conflicts: {}, dismissedOutside: {} }),
  replaceDrafts: (drafts) =>
    set({
      drafts,
      conflicts: onlyDrafted(get().conflicts, drafts),
      dismissedOutside: onlyDrafted(get().dismissedOutside, drafts),
    }),
  openReview: (path) => set({ ...openTab(get(), REVIEW_TAB_ID), reviewPath: path ?? null }),
  setReviewPath: (reviewPath) => set({ reviewPath }),
  setReviewInline: (reviewInline) => set({ reviewInline }),
  openCompare: (path) => set(openTab(get(), compareTabId(path))),
  setConflict: (path, conflict) => set({ conflicts: { ...get().conflicts, [path]: conflict } }),
  clearConflict: (path) => set({ conflicts: without(get().conflicts, path) }),
  dismissOutside: (path, serverHash) =>
    set({ dismissedOutside: { ...get().dismissedOutside, [path]: serverHash } }),
  setRestoreNotice: (restoreNotice) => set({ restoreNotice }),
  setCursor: (cursor) => {
    const current = get().cursor
    if (current.line !== cursor.line || current.column !== cursor.column) set({ cursor })
  },
  setEditorHandle: (editorHandle) => set({ editorHandle }),
  moveFile: (from, to) => {
    const state = get()
    const draft = state.drafts[from]
    const drafts = draft ? { ...without(state.drafts, from), [to]: draft } : state.drafts
    const wasOpen = state.openPaths.includes(from)
    const tabs = wasOpen ? openTab(closeTab(state, from), to) : state
    set({
      ...tabs,
      drafts,
      conflicts: without(state.conflicts, from),
      dismissedOutside: without(state.dismissedOutside, from),
    })
  },
  reconcileDrafts: (files) => {
    const current = get().drafts
    const next = liveDrafts(files, current)
    if (next === current) return
    set({
      drafts: next,
      conflicts: onlyDrafted(get().conflicts, next),
      dismissedOutside: onlyDrafted(get().dismissedOutside, next),
    })
  },
  showDialog: (dialog, target) => set({ dialog, dialogTarget: target ?? null }),
  closeDialog: () => set({ dialog: null, dialogTarget: null }),
  resetSession: () => set(initialSession),
}))
