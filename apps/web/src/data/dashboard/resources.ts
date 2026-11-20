import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { ActionToast } from '../../lib/action-toast'
import { dashboardApi } from '../../lib/dashboard-api'
import type { OrgNode } from '../../types/dashboard/resources'
import { toOrgNode } from './api/nodes'
import { dashKeys, invalidateAll } from './keys'

/**
 * Resources → Nodes: what the org built, then the marketplace, installed or
 * not. On the API the marketplace only (D-B9-10); a registry the instance
 * can't reach is a `503` the tab shows as an error.
 */
export function useOrgNodes(org: string, { enabled = true }: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: dashKeys.orgNodes(org),
    queryFn: (): Promise<OrgNode[]> =>
      dashboardApi.listMarketplace(org).then((res) => res.nodes.map(toOrgNode)),
    enabled,
  })
}

/** Resources' two tab pills, without opening either tab. */
export function useResourceCounts(org: string) {
  return useQuery({
    queryKey: dashKeys.resourceCounts(org),
    queryFn: async (): Promise<{ installedNodes: number; variables: number }> => {
      return dashboardApi.getResourceCounts(org)
    },
  })
}

type NodeChange = 'installNode' | 'uninstallNode' | 'updateNode'

const API_CHANGE = {
  installNode: 'install',
  uninstallNode: 'uninstall',
  updateNode: 'update',
} as const

/**
 * The general line, plus the registry's reason when the registry was at
 * fault (the API answers 502 with a sentence meant for the person, never
 * the raw checksums). Any other server error, and a 502 with no reason in
 * its body, keeps to the general line.
 */
function withRegistryReason(general: string) {
  return (_variables: unknown, error: unknown): string => {
    const failure = error as { status?: unknown; hasReason?: unknown } | null
    // A proxy's own 502 (the API down) has no reason of its own to add.
    return failure?.status === 502 &&
      failure.hasReason !== false &&
      error instanceof Error &&
      error.message.trim()
      ? `${general}. ${error.message}`
      : general
  }
}

const NODE_TOAST: Record<NodeChange, ActionToast> = {
  installNode: {
    success: 'Node installed',
    error: withRegistryReason('Couldn’t install the node'),
  },
  uninstallNode: { success: 'Node uninstalled', error: 'Couldn’t uninstall the node' },
  updateNode: { success: 'Node updated', error: withRegistryReason('Couldn’t update the node') },
}

function useNodeChange(org: string, change: NodeChange) {
  const client = useQueryClient()
  return useMutation({
    meta: { toast: NODE_TOAST[change] },
    mutationFn: async (nodeId: string) => {
      await dashboardApi.changeNode(org, API_CHANGE[change], nodeId)
    },
    // The canvas palette reads its definitions each time the editor opens: nothing to refresh here.
    onSuccess: () => invalidateAll(client, [dashKeys.orgNodes(org), dashKeys.resourceCounts(org)]),
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
