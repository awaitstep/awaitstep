import { useCallback, useMemo } from 'react'
import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import { flatPages } from '../../lib/queries'
import { useQueries } from '../../contexts/api-client-context'

/**
 * What a workflow's Overview shows and its actions need: the workflow, its
 * versions, what is live on each account, and what they add up to. `ready` holds every
 * read until the page knows the URL's project.
 */
export function useWorkflowOverview(workflowId: string, ready: boolean) {
  const queries = useQueries()
  const workflowQuery = useQuery({ ...queries.workflows.detail(workflowId), enabled: ready })
  const workflow = workflowQuery.data

  const versionsQuery = useInfiniteQuery({
    ...queries.versions.byWorkflow(workflowId),
    enabled: ready,
  })
  const versions = flatPages(versionsQuery.data)

  // What is live on each account, newest first: that account's newest successful deploy.
  const targetsQuery = useQuery({ ...queries.connections.forDeploy(workflowId), enabled: ready })
  const live = useMemo(() => targetsQuery.data?.deployedWith ?? [], [targetsQuery.data])
  const newest = live[0]
  // The newest live entry carries its version's number and lock, so it is known
  // even when it is older than the versions loaded so far.
  const deployedVersion = useMemo(
    () =>
      newest?.versionId && newest.version !== null
        ? { id: newest.versionId, version: newest.version, locked: newest.versionLocked ? 1 : 0 }
        : undefined,
    [newest],
  )
  const hasActiveDeployment = live.length > 0
  // The accounts Deploy offers now: one it is live on but missing from these can't be deployed to again.
  const offeredIds = useMemo(
    () => new Set((targetsQuery.data?.connections ?? []).map((c) => c.id)),
    [targetsQuery.data],
  )

  const lockedOn = useCallback(
    (connectionId: string | null) =>
      !!connectionId && !!live.find((l) => l.id === connectionId)?.versionLocked,
    [live],
  )

  return {
    workflow,
    isLoading: !ready || workflowQuery.isLoading,
    error: workflowQuery.error,
    isFetching: workflowQuery.isFetching,
    refetch: () => void workflowQuery.refetch(),
    versions,
    versionsHasMore: !!versionsQuery.hasNextPage,
    versionsLoadingMore: versionsQuery.isFetchingNextPage,
    loadMoreVersions: () => void versionsQuery.fetchNextPage(),
    currentVersion: versions[0]?.version ?? 0,
    live,
    offeredIds,
    hasActiveDeployment,
    deployedVersion,
    // The latest version is live on no account.
    hasUndeployedChanges:
      hasActiveDeployment && !live.some((l) => l.versionId === workflow?.currentVersionId),
    // Every account it is live on runs a locked version: nothing can replace one.
    deployBlocked: hasActiveDeployment && live.every((l) => l.versionLocked),
    /** The version live on that account is locked: nothing replaces it there. */
    lockedOn,
  }
}

export type WorkflowOverview = ReturnType<typeof useWorkflowOverview>
