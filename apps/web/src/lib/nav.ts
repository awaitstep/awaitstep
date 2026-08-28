import type { NavigateOptions } from '@tanstack/react-router'

export interface NavItem {
  to: string
  label: string
}

export const NAV_ITEMS: readonly NavItem[] = [
  { to: '/dashboard', label: 'Dashboard' },
  { to: '/workflows', label: 'Workflows' },
  { to: '/runs', label: 'Runs' },
  { to: '/connections', label: 'Connections' },
  { to: '/env-vars', label: 'Env Vars' },
]

const EXACT_ROUTE_IDS: Record<string, string> = {
  '/dashboard': '/_authed/dashboard',
  '/connections': '/_authed/connections',
  '/env-vars': '/_authed/env-vars',
  '/api-playground': '/_authed/api-playground',
  '/settings': '/_authed/settings',
  '/account': '/_authed/account',
}

// Prefix matches so detail pages keep their section active. Workflow-scoped
// runs (/_authed/workflows/$workflowId/runs) activate Workflows, not Runs.
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

export const NEW_WORKFLOW_NAV: NavigateOptions = {
  to: '/workflows/$workflowId/canvas',
  params: { workflowId: 'new' },
  search: { template: true },
}

export const NEW_FUNCTION_NAV: NavigateOptions = {
  to: '/workflows/$workflowId/canvas',
  params: { workflowId: 'new' },
  // Functions skip the template picker — templates are workflow-shaped.
  search: { kind: 'script' },
}
