import { useQuery } from '@tanstack/react-query'
import { queries } from '../../lib/queries'
import { useConnectionsStore } from '../../stores/connections-store'

/**
 * The names of the accounts a workflow's deployments went out on: the
 * project's own, the org's, and ones it was deployed with that the project
 * has since dropped.
 */
export function useDeploymentAccounts(workflowId: string, ready: boolean): Map<string, string> {
  const orgConnections = useConnectionsStore((s) => s.connections)
  const { data } = useQuery({ ...queries.connections.forDeploy(workflowId), enabled: ready })
  return new Map([
    ...orgConnections.map((c) => [c.id, c.name] as const),
    ...(data?.deployedWith ?? []).map((c) => [c.id, c.name] as const),
    ...(data?.connections ?? []).map((c) => [c.id, c.name] as const),
  ])
}
