import { useMutation, useQueryClient } from '@tanstack/react-query'
import { defineToast } from '../../lib/action-toast'
import { api } from '../../lib/api-client'

/**
 * Locks or unlocks the deployed version: while it's locked, no other version
 * can be deployed over it. The same lock the Versions list always had.
 */
export function useLockDeployed(workflowId: string, versionId: string | undefined) {
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
    // The lock shows on the versions list and on the deployment row (its version's lock).
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: ['versions', workflowId] }),
        queryClient.invalidateQueries({ queryKey: ['deployments', workflowId] }),
      ]),
  })
}
