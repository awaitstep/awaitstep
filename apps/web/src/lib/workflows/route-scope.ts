import type { WorkspaceSlugs } from '../dashboard-paths'
import { useOrgStore } from '../../stores/org-store'
import type { ScopeLookup } from '../../types/dashboard/scope'

export function routeScopeKey(slugs: WorkspaceSlugs): string {
  return [slugs.org, slugs.project, slugs.workspace].map(encodeURIComponent).join('/')
}

// Bumped by every enter and leave, so a lookup that resolves after a newer
// one started (or after the editor was left) is dropped instead of applied.
let latest = 0

interface EnterOptions {
  lookup: (slugs: WorkspaceSlugs) => Promise<ScopeLookup>
  /** The navigation's own signal: a cancelled navigation applies nothing. */
  signal?: AbortSignal
}

/**
 * Points the API client at the org and project an editor URL names, and
 * makes them the switcher's active ones too, so the old pages the editor
 * still links to agree with it. Until the lookup answers, no other
 * workspace's scope stands in; a scope the viewer can't open sets nothing,
 * and the dashboard shell shows its not-found page.
 */
export async function enterRouteScope(
  slugs: WorkspaceSlugs,
  { lookup, signal }: EnterOptions,
): Promise<void> {
  const key = routeScopeKey(slugs)
  const store = useOrgStore.getState()
  if (store.routeScope?.key === key) return
  store.setRouteScope(null)
  const ticket = ++latest

  const scope = await lookup(slugs)
  if (ticket !== latest || signal?.aborted) return
  if (!scope.found || !scope.project || !scope.workspace) return

  const organizationId = scope.org.org.id
  const projectId = scope.project.project.id
  const next = useOrgStore.getState()
  next.setRouteScope({ key, organizationId, projectId })
  // Switching org forgets the active project, so it goes first.
  if (next.activeOrganizationId !== organizationId) next.setActiveOrganization(organizationId)
  next.setActiveProject(projectId)
}

/** Back to the switcher's project: the editor is no longer open. */
export function leaveRouteScope(): void {
  latest++
  useOrgStore.getState().setRouteScope(null)
}
