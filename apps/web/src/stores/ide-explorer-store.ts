import { create } from 'zustand'
import type { ExplorerSelection } from '../lib/ide/project'

export interface CreateRequest {
  /** A file in the target folder, or a folder born with its first file. */
  mode: 'file' | 'folder'
  /** Text the name row starts with, e.g. `handlers/queue/`. */
  initial?: string
}

interface IdeExplorerState {
  selected: ExplorerSelection | null
  /** The open inline name row, if any. */
  create: CreateRequest | null
  /** Project path the tree should move focus to as soon as its row exists. */
  focusPath: string | null
  select: (selection: ExplorerSelection | null) => void
  beginCreate: (request?: CreateRequest) => void
  endCreate: () => void
  requestFocus: (path: string | null) => void
  reset: () => void
}

/**
 * Explorer interaction state that other parts of the workspace drive: the
 * palette and ⌥⌘N open the name row, and a finished rename asks the tree to
 * focus the renamed row. Selection lives here because it decides where a new
 * file lands.
 */
export const useIdeExplorerStore = create<IdeExplorerState>((set) => ({
  selected: null,
  create: null,
  focusPath: null,
  select: (selected) => set({ selected }),
  beginCreate: (request = { mode: 'file' }) => set({ create: request }),
  endCreate: () => set({ create: null }),
  requestFocus: (focusPath) => set({ focusPath }),
  reset: () => set({ selected: null, create: null, focusPath: null }),
}))
