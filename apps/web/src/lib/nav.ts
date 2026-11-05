export interface NavItem {
  to: string
  label: string
}

// Connections, the last old page here, moved to Org Settings in B9.
export const NAV_ITEMS: readonly NavItem[] = []

// `/api-playground` and `/account` moved into the new dashboard's own shell
// (`/_authed/_orgless/…`), so the old sidebar no longer owns or highlights them.
const EXACT_ROUTE_IDS: Record<string, string> = {
  '/dashboard': '/_authed/dashboard',
  '/settings': '/_authed/settings',
}

// Prefix matches so detail pages keep their section active.
const PREFIX_ROUTE_IDS: Record<string, string> = {
  '/workflows': '/_authed/workflows',
  '/runs': '/_authed/runs',
}

export function isNavItemActive(routeIds: readonly string[], to: string): boolean {
  const exact = EXACT_ROUTE_IDS[to]
  if (exact) return routeIds.includes(exact)
  const prefix = PREFIX_ROUTE_IDS[to]
  if (prefix) return routeIds.some((id) => id.startsWith(prefix))
  return false
}
