import { useQuery } from '@tanstack/react-query'
import { useQueries } from '../../contexts/api-client-context'

/**
 * The names of the accounts a workflow's deployments went out on: the
 * project's own, the org's, and ones it was deployed with that the project
 * has since dropped.
 */
export function useDeploymentAccounts(workflowId: string, ready: boolean): Map<string, string> {
  const queries = useQueries()
  const { data } = useQuery({ ...queries.connections.forDeploy(workflowId), enabled: ready })
  return new Map([
    ...(data?.deployedWith ?? []).map((c) => [c.id, c.name] as const),
    ...(data?.connections ?? []).map((c) => [c.id, c.name] as const),
  ])
}
