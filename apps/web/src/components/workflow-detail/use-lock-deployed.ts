import { useMutation, useQueryClient } from '@tanstack/react-query'
import { defineToast } from '../../lib/action-toast'
import { useApi } from '../../contexts/api-client-context'

/**
 * Locks or unlocks the newest live version: while it's locked, no other version
 * replaces it on the accounts it runs on. The same lock the Versions list always had.
 */
export function useLockDeployed(workflowId: string, versionId: string | undefined) {
  const api = useApi()
  const queryClient = useQueryClient()
  return useMutation({
    meta: {
      toast: defineToast<boolean>({
        success: (locked) => (locked ? 'Deployed version locked' : 'Deployed version unlocked'),
        error: (locked) => `Couldn’t ${locked ? 'lock' : 'unlock'} the deployed version`,
      }),
    },
    mutationFn: (locked: boolean) => {
      if (!versionId) throw new Error('Nothing is deployed yet')
      return api.lockVersion(workflowId, versionId, locked)
    },
    // The lock shows on the versions list, the deployment rows and what is live on each
    // account (the banner, the menu and every Deploy/Roll back read it from there).
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: ['versions', workflowId] }),
        queryClient.invalidateQueries({ queryKey: ['deployments', workflowId] }),
        queryClient.invalidateQueries({ queryKey: ['deploy-connections', workflowId] }),
        queryClient.invalidateQueries({ queryKey: ['dash', 'workflow-summary', workflowId] }),
      ]),
  })
}
