import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { onSignedOutElsewhere } from '../lib/auth-signal'
import { compareTabPath } from '../lib/ide/tabs'
import { useIdeStore } from '../stores/ide-store'

/**
 * Compare keeps the server copy it fetched for the life of its tab (see
 * CompareView), and each copy can be a whole file. This is what lets go of
 * them: one when its tab closes, all of them when the workspace unmounts or
 * another tab signs out.
 */
export function useCompareCache(workflowId: string): void {
  const queryClient = useQueryClient()
  useEffect(() => {
    let open = new Set(useIdeStore.getState().openPaths)
    const unsubscribe = useIdeStore.subscribe((state) => {
      const next = new Set(state.openPaths)
      for (const tab of open) {
        const path = compareTabPath(tab)
        if (path !== null && !next.has(tab)) {
          queryClient.removeQueries({ queryKey: ['ide-compare', workflowId, path], exact: true })
        }
      }
      open = next
    })
    const forgetAll = () => queryClient.removeQueries({ queryKey: ['ide-compare'] })
    const stopSignOut = onSignedOutElsewhere(forgetAll)
    return () => {
      unsubscribe()
      stopSignOut()
      queryClient.removeQueries({ queryKey: ['ide-compare', workflowId] })
    }
  }, [queryClient, workflowId])
}
