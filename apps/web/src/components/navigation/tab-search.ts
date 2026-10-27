import { DASHBOARD_SEARCH_KEYS, type DashboardSearch } from './dashboard-providers'

/**
 * The search after switching to `tab` on a page with tabs in `?tab=`: the
 * params every page keeps (`DASHBOARD_SEARCH_KEYS`) and the tab carry over,
 * so a dialog param (`new=key`) stays behind with its tab. `first` is the
 * tab the bare URL opens, so it leaves `tab` out.
 */
export function searchForTab(prev: DashboardSearch, tab: string, first: string): DashboardSearch {
  const kept = Object.fromEntries(DASHBOARD_SEARCH_KEYS.map((key) => [key, prev[key]]))
  return { ...kept, tab: tab === first ? undefined : tab }
}
