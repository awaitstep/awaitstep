export interface TabState {
  openPaths: string[]
  activePath: string | null
}

/**
 * Tab ids that are not files. Project paths never contain a colon (their
 * segments are letters, digits and a few separators), so these cannot
 * collide with a file's tab.
 */
export const REVIEW_TAB_ID = 'ide:review'
const COMPARE_PREFIX = 'ide:compare:'

export function compareTabId(path: string): string {
  return `${COMPARE_PREFIX}${path}`
}

/** The file a Compare tab is about, or null for any other tab id. */
export function compareTabPath(tabId: string): string | null {
  return tabId.startsWith(COMPARE_PREFIX) ? tabId.slice(COMPARE_PREFIX.length) : null
}

export type TabKind = 'file' | 'review' | 'compare'

export function tabKind(tabId: string): TabKind {
  if (tabId === REVIEW_TAB_ID) return 'review'
  return compareTabPath(tabId) !== null ? 'compare' : 'file'
}

/** The tab's id when it is a file, else null (the review and Compare tabs are not files). */
export function filePathOfTab(tabId: string | null): string | null {
  return tabId !== null && tabKind(tabId) === 'file' ? tabId : null
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

/**
 * The tab a navigation key lands on: arrows step (wrapping), Home and End
 * jump to the ends. Null for any other key, or when there is nothing to move to.
 */
export function nextTabIndex(key: string, current: number, count: number): number | null {
  if (count < 2 || current < 0) return null
  switch (key) {
    case 'ArrowRight':
      return (current + 1) % count
    case 'ArrowLeft':
      return (current - 1 + count) % count
    case 'Home':
      return 0
    case 'End':
      return count - 1
    default:
      return null
  }
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
 * file), applying the same neighbour rule as closing them one by one. The
 * review tab stays until it is closed; a Compare tab goes with its file or
 * once the file has no unsaved copy left to compare (`drafted`, when given).
 */
export function pruneTabs(
  state: TabState,
  existing: ReadonlySet<string>,
  drafted?: ReadonlySet<string>,
): TabState {
  return closeTabs(
    state,
    state.openPaths.filter((id) => {
      switch (tabKind(id)) {
        case 'review':
          return false
        case 'compare': {
          const path = compareTabPath(id)!
          return !existing.has(path) || (drafted !== undefined && !drafted.has(path))
        }
        default:
          return !existing.has(id)
      }
    }),
  )
}
