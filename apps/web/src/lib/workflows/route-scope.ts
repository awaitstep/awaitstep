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
  const workspaceId = scope.workspace.workspace.id
  const next = useOrgStore.getState()
  next.setRouteScope({ key, organizationId, projectId, workspaceId })
  // Switching org forgets the active project, so it goes first.
  if (next.activeOrganizationId !== organizationId) next.setActiveOrganization(organizationId)
  next.setActiveProject(projectId)
}

/**
 * Whether API calls follow this workspace's project yet. A workflow's pages
 * read nothing before then, so none loads through the switcher's project.
 */
export function useRouteScopeReady(slugs: WorkspaceSlugs): boolean {
  const key = routeScopeKey(slugs)
  return useOrgStore((s) => s.appReady && s.routeScope?.key === key)
}

/**
 * Whether a workflow lives in a different workspace than the URL names. The
 * API answers for any workflow in the project the caller can open, so a link
 * naming the wrong workspace would otherwise frame it, and act on it, there.
 * Shared items link through their own workspace, so no real link does this.
 */
export function useInOtherWorkspace(workflow: { workspaceId?: string } | undefined): boolean {
  const workspaceId = useOrgStore((s) => s.routeScope?.workspaceId)
  return !!workflow?.workspaceId && !!workspaceId && workflow.workspaceId !== workspaceId
}

/** Back to the switcher's project: the editor is no longer open. */
export function leaveRouteScope(): void {
  latest++
  useOrgStore.getState().setRouteScope(null)
}
