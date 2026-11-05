export interface TabState {
  openPaths: string[]
  activePath: string | null
}

export const EMPTY_TABS: TabState = { openPaths: [], activePath: null }

/** Activates `path`, appending a tab for it when none is open yet. */
export function openTab(state: TabState, path: string): TabState {
  const openPaths = state.openPaths.includes(path) ? state.openPaths : [...state.openPaths, path]
  return { openPaths, activePath: path }
}

/**
 * Closes `path`. When it was active, focus moves to the tab that slid into
 * its slot (the right neighbour), else the left neighbour, else nothing.
 */
export function closeTab(state: TabState, path: string): TabState {
  const index = state.openPaths.indexOf(path)
  if (index === -1) return state
  const openPaths = state.openPaths.filter((p) => p !== path)
  if (state.activePath !== path) return { openPaths, activePath: state.activePath }
  return { openPaths, activePath: openPaths[index] ?? openPaths[index - 1] ?? null }
}

/** Closes several tabs, applying the single-tab neighbour rule to each in turn. */
export function closeTabs(state: TabState, paths: readonly string[]): TabState {
  return paths.reduce((next, path) => closeTab(next, path), state)
}

export function closeAllTabs(): TabState {
  return EMPTY_TABS
}

/** Moves activation one tab right (+1) or left (−1), wrapping around. */
export function cycleTab(state: TabState, direction: 1 | -1): TabState {
  const count = state.openPaths.length
  if (count < 2 || state.activePath === null) return state
  const index = state.openPaths.indexOf(state.activePath)
  if (index === -1) return state
  return { ...state, activePath: state.openPaths[(index + direction + count) % count] }
}

/**
 * Drops tabs whose files no longer exist (a new source version, a deleted
 * file), applying the same neighbour rule as closing them one by one.
 */
export function pruneTabs(state: TabState, existing: ReadonlySet<string>): TabState {
  return closeTabs(
    state,
    state.openPaths.filter((path) => !existing.has(path)),
  )
}
