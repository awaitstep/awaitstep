import { useScope } from '../../data/dashboard/workspaces'
import type { ProjectSlugs } from '../../lib/dashboard-paths'
import type { OrgScope, ProjectScope } from '../../types/dashboard/scope'

/**
 * The org and project a project-settings page is in. The shell resolved them
 * before the page rendered, so this reads the cached scope; null only for the
 * moment before it arrives.
 */
export function useProjectScope(
  slugs: ProjectSlugs,
): { org: OrgScope; project: ProjectScope } | null {
  const scope = useScope(slugs).data
  if (!scope?.found || !scope.project) return null
  return { org: scope.org, project: scope.project }
}
