import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { mockServer } from '../../mocks/dashboard/server'
import { dashKeys, invalidateAll, withMockContext } from './keys'
import { useMockContext } from './scenario-context'

/** Resources → Nodes: what the org built, then the marketplace, installed or not. */
export function useOrgNodes(org: string) {
  const ctx = useMockContext()
  return useQuery({
    queryKey: withMockContext(dashKeys.orgNodes(org), ctx),
    queryFn: () => mockServer.resources.listOrgNodes(ctx, org),
  })
}

type NodeChange = 'installNode' | 'uninstallNode' | 'updateNode'

function useNodeChange(org: string, change: NodeChange) {
  const ctx = useMockContext()
  const client = useQueryClient()
  return useMutation({
    mutationFn: (nodeId: string) => mockServer.resources[change](ctx, org, nodeId),
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
