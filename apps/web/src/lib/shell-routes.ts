/**
 * Routes that render without the app shell (no sidebar, no content container).
 * Both the authed layout and the workflow layout consult this single list so
 * the two escape hatches can never drift apart.
 */
export const CHROMELESS_ROUTE_IDS: readonly string[] = [
  '/_authed/workflows/$workflowId/editor',
  '/_authed/workflows/$workflowId/deploy',
]

/**
 * Route subtrees that draw their own shell: the new dashboard (W1) brings its
 * rail and panel, so the old sidebar must not wrap it.
 */
export const OWN_SHELL_ROUTE_PREFIXES: readonly string[] = ['/_authed/$org', '/_authed/dashboard']

function hasOwnShell(routeId: string): boolean {
  return OWN_SHELL_ROUTE_PREFIXES.some(
    (prefix) => routeId === prefix || routeId.startsWith(`${prefix}/`),
  )
}

/** Whether the page is the new dashboard's, which handles having no organization itself. */
export function drawsOwnShell(matches: ReadonlyArray<{ routeId: string }>): boolean {
  return matches.some((m) => hasOwnShell(m.routeId))
}

/**
 * Whether an old page must send you to /dashboard: you're in no organization
 * by the layout's list and the org store (which hears of one just created
 * before the list refetches), and the page isn't the new dashboard's (D-DB-7).
 */
export function sendsToDashboard(
  loaderOrgs: number,
  storeOrgs: number,
  matches: ReadonlyArray<{ routeId: string }>,
): boolean {
  return loaderOrgs === 0 && storeOrgs === 0 && !drawsOwnShell(matches)
}

export function isChromelessRoute(matches: ReadonlyArray<{ routeId: string }>): boolean {
  return matches.some((m) => CHROMELESS_ROUTE_IDS.includes(m.routeId) || hasOwnShell(m.routeId))
}
