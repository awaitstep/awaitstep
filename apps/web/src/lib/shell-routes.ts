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
export const OWN_SHELL_ROUTE_PREFIXES: readonly string[] = ['/_authed/$org', '/_authed/choose-org']

function hasOwnShell(routeId: string): boolean {
  return OWN_SHELL_ROUTE_PREFIXES.some(
    (prefix) => routeId === prefix || routeId.startsWith(`${prefix}/`),
  )
}

export function isChromelessRoute(matches: ReadonlyArray<{ routeId: string }>): boolean {
  return matches.some((m) => CHROMELESS_ROUTE_IDS.includes(m.routeId) || hasOwnShell(m.routeId))
}
