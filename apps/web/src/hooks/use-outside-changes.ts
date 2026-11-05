import { useEffect, useRef } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api-client'
import { planRefresh } from '../lib/ide/outside-changes'

/** How often the open workspace asks whether anyone else changed a file. */
export const OUTSIDE_CHECK_MS = 20_000

interface OutsideChangesInput {
  workflowId: string
  /** False for an older version and before the source has loaded. */
  enabled: boolean
  /** The loaded files (virtual seeds included). */
  baseline: ReadonlyMap<string, { hash?: string | undefined }>
}

/**
 * Notices files that changed on the server while the workspace is open (a
 * teammate, or an agent using the files API). Every 20 seconds, and at once
 * when the window is focused again, it reads the project listing, which is
 * hashes only. When a hash differs, or a file appeared or vanished, it
 * refetches the source; what that means for each file is derived from the
 * loaded files and the drafts, so nothing is stored here. A discrepancy
 * counts as handled only once that refetch succeeded, so a network blip is
 * retried by the next check instead of hiding the change for good.
 *
 * A polling query rather than an effect: TanStack pauses the interval while
 * the page is hidden, so a background tab makes no requests. The one effect
 * is the focus subscription: TanStack's own focus detection listens to
 * `visibilitychange` only, which does not fire when switching back from
 * another app to a window that stayed visible.
 */
export function useOutsideChanges({ workflowId, enabled, baseline }: OutsideChangesInput) {
  const queryClient = useQueryClient()
  // The check runs long after the render that started it.
  const baselineRef = useRef(baseline)
  baselineRef.current = baseline
  const handled = useRef<string | null>(null)

  useEffect(() => {
    if (!enabled) return
    function check() {
      if (document.visibilityState === 'hidden') return
      // Not cancelling a check already running: focus and visibilitychange
      // usually arrive together and should make one request.
      void queryClient
        .refetchQueries({ queryKey: ['ide-project-listing', workflowId] }, { cancelRefetch: false })
        .catch(() => undefined)
    }
    window.addEventListener('focus', check)
    document.addEventListener('visibilitychange', check)
    return () => {
      window.removeEventListener('focus', check)
      document.removeEventListener('visibilitychange', check)
    }
  }, [enabled, queryClient, workflowId])

  return useQuery({
    queryKey: ['ide-project-listing', workflowId],
    queryFn: async () => {
      const listing = await api.getProjectFiles(workflowId)
      const plan = planRefresh(baselineRef.current, listing, handled.current)
      if (plan.refetch) {
        // `invalidateQueries` would swallow a failed refetch; this throws, so
        // the signature below is not recorded and the next check tries again.
        await queryClient.refetchQueries(
          { queryKey: ['workflow-source', workflowId] },
          { throwOnError: true },
        )
      }
      handled.current = plan.signature
      return listing
    },
    enabled,
    staleTime: 0,
    gcTime: 0,
    retry: false,
    refetchInterval: OUTSIDE_CHECK_MS,
    refetchIntervalInBackground: false,
    // Focus is handled above, once per refocus.
    refetchOnWindowFocus: false,
  })
}
