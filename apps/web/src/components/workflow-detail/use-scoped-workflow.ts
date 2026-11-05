import { useQuery } from '@tanstack/react-query'
import { useQueries } from '../../contexts/api-client-context'
import { useItemScopeReady } from '../../lib/workflows/route-scope'

/**
 * A workflow opened at its workspace URL, read through that URL's project.
 * The key is the one the editor and the old pages use, so a rename anywhere
 * shows everywhere.
 */
export function useScopedWorkflow(workflowId: string, enabled = true) {
  const queries = useQueries()
  const ready = useItemScopeReady()
  return useQuery({ ...queries.workflows.detail(workflowId), enabled: enabled && ready })
}
