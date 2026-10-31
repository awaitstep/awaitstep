import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { dashboardApi } from '../../lib/dashboard-api'
import { mockServer } from '../../mocks/dashboard/server'
import type { OrgNode } from '../../types/dashboard/resources'
import { toOrgNode } from './api/nodes'
import { dashKeys, invalidateAll } from './keys'
import { useMockContext } from './scenario-context'
import { useDashKey, useDataSource } from './source'

/**
 * Resources → Nodes: what the org built, then the marketplace, installed or
 * not. On the API the marketplace only (D-B9-10); a registry the instance
 * can't reach is a `503` the tab shows as an error.
 */
export function useOrgNodes(org: string) {
  const source = useDataSource()
  const ctx = useMockContext()
  const key = useDashKey()
  return useQuery({
    queryKey: key(dashKeys.orgNodes(org)),
    queryFn: (): Promise<OrgNode[]> =>
      source === 'api'
        ? dashboardApi.listMarketplace(org).then((res) => res.nodes.map(toOrgNode))
        : mockServer.resources.listOrgNodes(ctx, org),
  })
}

type NodeChange = 'installNode' | 'uninstallNode' | 'updateNode'

const API_CHANGE = {
  installNode: 'install',
  uninstallNode: 'uninstall',
  updateNode: 'update',
} as const

function useNodeChange(org: string, change: NodeChange) {
  const source = useDataSource()
  const ctx = useMockContext()
  const client = useQueryClient()
  return useMutation({
    mutationFn: async (nodeId: string) => {
      if (source !== 'api') return mockServer.resources[change](ctx, org, nodeId)
      await dashboardApi.changeNode(org, API_CHANGE[change], nodeId)
    },
    // The canvas palette reads its definitions each time the editor opens: nothing to refresh here.
    onSuccess: () => invalidateAll(client, [dashKeys.orgNodes(org)]),
  })
}

export function useInstallNode(org: string) {
  return useNodeChange(org, 'installNode')
}

export function useUninstallNode(org: string) {
  return useNodeChange(org, 'uninstallNode')
}

export function useUpdateNode(org: string) {
  return useNodeChange(org, 'updateNode')
}
