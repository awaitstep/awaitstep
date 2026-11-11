import { useCallback, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useQueries } from '../../contexts/api-client-context'
import { useWorkflowPageSummary } from '../../data/dashboard/items'

/**
 * What a workflow's Overview shows and its actions need: the workflow, its
 * page summary (current version, deploy counts, run counts) and what is live
 * on each account. `ready` holds every read until the page knows the URL's
 * project; `withSummary` false skips the summary for a page that shows none of it.
 */
export function useWorkflowOverview(workflowId: string, ready: boolean, withSummary = true) {
  const queries = useQueries()
  const workflowQuery = useQuery({ ...queries.workflows.detail(workflowId), enabled: ready })
  const summaryQuery = useWorkflowPageSummary(workflowId, ready && withSummary)
  const workflow = workflowQuery.data
  const summary = summaryQuery.data

  // What is live on each account, newest first: that account's newest successful deploy.
  const targetsQuery = useQuery({ ...queries.connections.forDeploy(workflowId), enabled: ready })
  const live = useMemo(() => targetsQuery.data?.deployedWith ?? [], [targetsQuery.data])
  const newest = live[0]
  // The summary's newest success names its version and lock; the live entry is the fallback.
  const deployedVersion = useMemo(() => {
    const last = summary?.lastSuccessfulDeploy
    if (last?.versionId && last.versionNumber !== null) {
      return { id: last.versionId, version: last.versionNumber, locked: last.versionLocked ? 1 : 0 }
    }
    return newest?.versionId && newest.version !== null
      ? { id: newest.versionId, version: newest.version, locked: newest.versionLocked ? 1 : 0 }
      : undefined
  }, [summary, newest])
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

  const refetch = useCallback(() => {
    void workflowQuery.refetch()
    void summaryQuery.refetch()
  }, [workflowQuery, summaryQuery])

  return {
    workflow,
    summary,
    isLoading: !ready || workflowQuery.isLoading || summaryQuery.isLoading,
    error: workflowQuery.error ?? summaryQuery.error,
    isFetching: workflowQuery.isFetching || summaryQuery.isFetching,
    refetch,
    currentVersion: summary?.currentVersion?.version ?? 0,
    versionCount: summary?.versionCount ?? 0,
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
