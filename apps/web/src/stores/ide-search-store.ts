import { create } from 'zustand'
import type { ResultLocation } from '../lib/ide/search-results'
import type { SearchOptions, SearchOutcome } from '../lib/ide/search'

export type SearchStatus = 'idle' | 'searching' | 'done'

interface IdeSearchState extends SearchOptions {
  includeGenerated: boolean
  /** The Search box should take focus (and select its text) once it is on screen. */
  focusRequested: boolean
  status: SearchStatus
  /** The newest answer; null until the first search finishes or after the query is cleared. */
  outcome: SearchOutcome | null
  /** The hit last opened or stepped to, so F4 continues from it. */
  current: ResultLocation | null
  /** Bumped by Retry: a search that timed out runs again only when this moves. */
  retryCount: number

  setQuery: (query: string) => void
  toggle: (option: 'caseSensitive' | 'wholeWord' | 'regex' | 'includeGenerated') => void
  /** Starts a search from outside the box: a seed from the editor, or a rename follow-up. */
  searchFor: (options: Partial<SearchOptions> & { includeGenerated?: boolean }) => void
  requestFocus: () => void
  consumeFocus: () => void
  setSearching: () => void
  setOutcome: (outcome: SearchOutcome | null) => void
  setCurrent: (current: ResultLocation | null) => void
  retry: () => void
  reset: () => void
}

const initial = {
  query: '',
  caseSensitive: false,
  wholeWord: false,
  regex: false,
  includeGenerated: false,
  focusRequested: false,
  status: 'idle' as SearchStatus,
  outcome: null as SearchOutcome | null,
  current: null as ResultLocation | null,
  retryCount: 0,
}

/**
 * The Search view's inputs and its latest answer. A store rather than panel
 * state because things outside the panel drive it — ⇧⌘F with a selection, a
 * rename's "Show", F4 from the editor — and because the panel unmounts when
 * the side bar is hidden while the query should survive.
 */
export const useIdeSearchStore = create<IdeSearchState>()((set, get) => ({
  ...initial,
  setQuery: (query) => set({ query, current: null }),
  toggle: (option) => set({ [option]: !get()[option], current: null }),
  searchFor: (options) =>
    set({
      // An option the caller leaves out keeps the user's own setting.
      ...options,
      focusRequested: true,
      current: null,
    }),
  requestFocus: () => set({ focusRequested: true }),
  consumeFocus: () => set({ focusRequested: false }),
  setSearching: () => set({ status: 'searching' }),
  setOutcome: (outcome) => set({ outcome, status: 'done' }),
  setCurrent: (current) => set({ current }),
  retry: () => set({ retryCount: get().retryCount + 1 }),
  reset: () => set(initial),
}))
