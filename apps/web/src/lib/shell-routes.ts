/**
 * Routes that render without the app shell (no sidebar, no content container).
 * Both the authed layout and the workflow layout consult this single list so
 * the two escape hatches can never drift apart.
 */
export const CHROMELESS_ROUTE_IDS: readonly string[] = [
  '/_authed/workflows/$workflowId/canvas',
  '/_authed/workflows/$workflowId/deploy',
]

export function isChromelessRoute(matches: ReadonlyArray<{ routeId: string }>): boolean {
  return matches.some((m) => CHROMELESS_ROUTE_IDS.includes(m.routeId))
}
