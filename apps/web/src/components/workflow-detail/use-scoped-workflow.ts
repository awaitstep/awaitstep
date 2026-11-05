import { useQuery } from '@tanstack/react-query'
import { api } from '../../lib/api-client'
import type { WorkspaceSlugs } from '../../lib/dashboard-paths'
import { useRouteScopeReady } from '../../lib/workflows/route-scope'

/**
 * A workflow opened at its workspace URL, read once API calls follow that
 * workspace's project. The key is the one the editor and the old pages use,
 * so a rename anywhere shows everywhere.
 */
export function useScopedWorkflow(slugs: WorkspaceSlugs, workflowId: string, enabled = true) {
  const ready = useRouteScopeReady(slugs)
  return useQuery({
    queryKey: ['workflow', workflowId],
    queryFn: () => api.getWorkflow(workflowId),
    enabled: enabled && ready,
  })
}
