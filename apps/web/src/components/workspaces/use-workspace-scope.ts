import { useScope } from '../../data/dashboard/workspaces'
import type { WorkspaceSlugs } from '../../lib/dashboard-paths'
import type { ProjectScope, WorkspaceScope } from '../../types/dashboard/scope'

/**
 * The project and workspace a workspace page is in. The shell has already
 * resolved them before the page renders (or shown Not found), so this reads
 * the cached scope; null only for the moment before it arrives.
 */
export function useWorkspaceScope(
  slugs: WorkspaceSlugs,
): { orgName: string; project: ProjectScope; workspace: WorkspaceScope } | null {
  const scope = useScope(slugs).data
  if (!scope?.found || !scope.project || !scope.workspace) return null
  return { orgName: scope.org.org.name, project: scope.project, workspace: scope.workspace }
}
