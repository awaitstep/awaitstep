import { useScope } from '../../data/dashboard/workspaces'
import type { OrgScope } from '../../types/dashboard/scope'

/**
 * The org an org-settings page is in. The shell resolved it before the page
 * rendered, so this reads the cached scope; null only before it arrives.
 */
export function useOrgScope(org: string): OrgScope | null {
  const scope = useScope({ org }).data
  return scope?.found ? scope.org : null
}
