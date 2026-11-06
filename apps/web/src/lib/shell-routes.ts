import { parseSurface } from './workflows/surfaces'

/**
 * Route subtrees that draw their own shell: the new dashboard (W1) brings its
 * rail and panel, so the old sidebar must not wrap it. `_orgless` is the new
 * dashboard's rail around top-level, org-less pages (your account, the API
 * Playground).
 */
export const OWN_SHELL_ROUTE_PREFIXES: readonly string[] = [
  '/_authed/$org',
  '/_authed/_orgless',
  '/_authed/dashboard',
]

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

/** Whether the page renders without the old sidebar: the new dashboard draws its own shell. */
export function isChromelessRoute(matches: ReadonlyArray<{ routeId: string }>): boolean {
  return drawsOwnShell(matches)
}

const EDITOR_ROUTE_ID = '/_authed/$org/$project/$workspace/workflows_/$id/'

/** Whether the page is a workflow's canvas (the editor with no `?view=`, or `?view=canvas`). */
export function isCanvasRoute(
  matches: ReadonlyArray<{ routeId: string; search?: unknown }>,
): boolean {
  return matches.some((m) => {
    if (m.routeId !== EDITOR_ROUTE_ID) return false
    const search = m.search as { view?: unknown } | undefined
    return parseSurface(search?.view) === 'canvas'
  })
}
