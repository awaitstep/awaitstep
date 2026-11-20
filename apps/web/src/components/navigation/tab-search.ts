import type { DashboardSearch } from './dashboard-providers'

/**
 * The search after switching to `tab` on a page with tabs in `?tab=`: only
 * the tab carries over, so a dialog param (`new=key`) stays behind with its
 * tab. `first` is the tab the bare URL opens, so it leaves `tab` out.
 */
export function searchForTab(tab: string, first: string): DashboardSearch {
  return { tab: tab === first ? undefined : tab }
}
