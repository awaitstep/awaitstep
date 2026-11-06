import { useEffect, useRef } from 'react'
import { useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query'
import type { VersionRef } from '../lib/api-client'
import { planRefresh } from '../lib/ide/outside-changes'
import { useApi } from '../contexts/api-client-context'

/** How often the open workspace asks whether anyone else changed a file. */
export const OUTSIDE_CHECK_MS = 20_000

interface OutsideChangesInput {
  workflowId: string
  /** The `?version=` the workspace shows, so the check compares the version it loaded. */
  versionParam: string | undefined
  /** False for an older version and before the source has loaded. */
  enabled: boolean
  /** The stored project files as loaded — not seeds, not step sources, which the listing never has. */
  stored: ReadonlyMap<string, { hash?: string | undefined }>
}

interface SourceVersion {
  versionId?: string | null
}
interface FullVersion {
  version?: { id: string } | null
  graphHash?: string | null
}

function sourceMovedPastGraph(queryClient: QueryClient, workflowId: string): boolean {
  const sources = queryClient.getQueriesData<SourceVersion>({
    queryKey: ['workflow-source', workflowId],
  })
  const fulls = queryClient.getQueriesData<FullVersion>({ queryKey: ['workflow-full', workflowId] })
  return sources.some(([, source]) =>
    fulls.some(([, full]) => !!source?.versionId && source.versionId !== full?.version?.id),
  )
}

/**
 * The listing names a version the loaded graph is not: a canvas save, a
 * step save from another tab, a revert — or the first version of a blank
 * workflow. Compared on both the id and the graph hash, since a save over an
 * undeployed version keeps its id.
 */
function graphMoved(
  queryClient: QueryClient,
  workflowId: string,
  versionParam: string | undefined,
  latest: VersionRef | null,
): boolean {
  const full = queryClient.getQueryData<FullVersion>(['workflow-full', workflowId, versionParam])
  if (!full) return false
  return (
    (full.version?.id ?? null) !== (latest?.id ?? null) ||
    (full.graphHash ?? null) !== (latest?.graphHash ?? null)
  )
}

/**
 * Notices what changed on the server while the workspace is open: files a
 * teammate or an agent wrote, and versions the canvas saved. Every 20
 * seconds, and at once when the window is focused again, it reads the
 * project listing — file hashes and the latest version's identity, no text.
 * When a hash differs, or a file appeared or vanished, it refetches the
 * source; when the version differs from the loaded one, it refetches the
 * workflow and then the source (the generated files follow the version).
 * What that means for each file is derived from the loaded files and the
 * drafts, so nothing is stored here. A file discrepancy counts as handled
 * only once that refetch succeeded, so a network blip is retried by the
 * next check instead of hiding the change for good.
 *
 * A polling query rather than an effect: TanStack pauses the interval while
 * the page is hidden, so a background tab makes no requests. The one effect
 * is the focus subscription: TanStack's own focus detection listens to
 * `visibilitychange` only, which does not fire when switching back from
 * another app to a window that stayed visible.
 */
export function useOutsideChanges({
  workflowId,
  versionParam,
  enabled,
  stored,
}: OutsideChangesInput) {
  const api = useApi()
  const queryClient = useQueryClient()
  // The check runs long after the render that started it.
  const storedRef = useRef(stored)
  storedRef.current = stored
  const handled = useRef<string | null>(null)
  // The listing version last refetched for, so a version the loaded one can
  // never agree with (an anomaly, not a save) is not refetched every 20 s.
  const handledVersion = useRef<string | null>(null)

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
      const listing = await api.getProjectListing(workflowId)
      const plan = planRefresh(storedRef.current, listing.files, handled.current)
      // `invalidateQueries` would swallow a failed refetch; these throw, so
      // the signatures below are not recorded and the next check tries again.
      const versionSignature = listing.version
        ? `${listing.version.id}:${listing.version.graphHash}`
        : null
      const moved =
        versionSignature !== handledVersion.current &&
        graphMoved(queryClient, workflowId, versionParam, listing.version)
      if (moved) {
        await queryClient.refetchQueries(
          { queryKey: ['workflow-full', workflowId] },
          { throwOnError: true },
        )
      }
      if (plan.refetch || moved) {
        await queryClient.refetchQueries(
          { queryKey: ['workflow-source', workflowId] },
          { throwOnError: true },
        )
        // Without a pinned version the source follows the current one, which
        // may be newer than the graph loaded: the steps, the version list
        // and the editor's types come from the full query, so it moves with
        // the source or the two would describe different versions.
        if (sourceMovedPastGraph(queryClient, workflowId)) {
          await queryClient.refetchQueries(
            { queryKey: ['workflow-full', workflowId] },
            { throwOnError: true },
          )
        }
      }
      handled.current = plan.signature
      handledVersion.current = versionSignature
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
