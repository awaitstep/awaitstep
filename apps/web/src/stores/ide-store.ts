import { create } from 'zustand'
import {
  closeAllTabs,
  closeTab,
  cycleTab,
  openTab,
  pruneTabs,
  type TabState,
} from '../lib/ide/tabs'

export type IdeDialog = 'palette' | 'quickOpen'

export interface RevealTarget {
  path: string
  line: number
  column: number
}

interface IdeSessionState extends TabState {
  /** A location the editor should scroll to once its model is active. */
  reveal: RevealTarget | null
  /** At most one modal at a time, so shortcuts can never stack dialogs. */
  dialog: IdeDialog | null

  openFile: (path: string) => void
  revealLocation: (target: RevealTarget) => void
  clearReveal: () => void
  closeFile: (path: string) => void
  closeAllFiles: () => void
  cycleFile: (direction: 1 | -1) => void
  pruneFiles: (existing: Iterable<string>) => void
  showDialog: (dialog: IdeDialog) => void
  closeDialog: () => void
  /** Back to a blank workspace; layout preferences live in the layout store. */
  resetSession: () => void
}

const initialSession = {
  openPaths: [] as string[],
  activePath: null as string | null,
  reveal: null as RevealTarget | null,
  dialog: null as IdeDialog | null,
}

/** Per-workflow workspace state: open tabs, pending reveal, the open dialog. */
export const useIdeStore = create<IdeSessionState>()((set, get) => ({
  ...initialSession,

  openFile: (path) => set(openTab(get(), path)),
  revealLocation: (target) => set({ ...openTab(get(), target.path), reveal: target }),
  clearReveal: () => set({ reveal: null }),
  closeFile: (path) => set(closeTab(get(), path)),
  closeAllFiles: () => set(closeAllTabs()),
  cycleFile: (direction) => set(cycleTab(get(), direction)),
  pruneFiles: (existing) => set(pruneTabs(get(), new Set(existing))),
  showDialog: (dialog) => set({ dialog }),
  closeDialog: () => set({ dialog: null }),
  resetSession: () => set(initialSession),
}))
