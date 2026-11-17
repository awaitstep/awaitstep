import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useApi } from '../contexts/api-client-context'

/**
 * Asks one of the workflow's running deploys to stop. A refusal (it is already
 * uploading, or done) is toasted with the server's reason; the deploy goes on.
 */
export function useCancelDeploy(workflowId: string) {
  const api = useApi()
  const queryClient = useQueryClient()
  return useMutation({
    meta: { toast: { success: null, error: 'Couldn’t cancel the deploy' } },
    mutationFn: (deploymentId: string) => api.cancelDeployment(workflowId, deploymentId),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ['deployments', workflowId] })
    },
  })
}
