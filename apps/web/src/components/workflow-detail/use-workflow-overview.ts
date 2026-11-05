import { useMemo } from 'react'
import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import { api } from '../../lib/api-client'
import { flatPages, queries } from '../../lib/queries'

/**
 * What a workflow's Overview shows and its actions need: the workflow, its
 * versions, deployments and runs, and what they add up to. `ready` holds every
 * read until API calls follow the right project.
 */
export function useWorkflowOverview(workflowId: string, ready: boolean) {
  const workflowQuery = useQuery({
    queryKey: ['workflow', workflowId],
    queryFn: () => api.getWorkflow(workflowId),
    enabled: ready,
  })
  const workflow = workflowQuery.data

  const versionsQuery = useInfiniteQuery({
    ...queries.versions.byWorkflow(workflowId),
    enabled: ready,
  })
  const versions = flatPages(versionsQuery.data)

  const { data: deployments } = useInfiniteQuery({
    ...queries.deployments.byWorkflow(workflowId),
    enabled: ready,
    select: (data) => flatPages(data),
  })

  const { data: runs } = useInfiniteQuery({
    ...queries.runs.all(workflowId),
    enabled: ready,
    select: (data) => flatPages(data),
  })

  const workflowRuns = useMemo(
    () => runs?.filter((r) => r.workflowId === workflowId) ?? [],
    [runs, workflowId],
  )
  const activeDeployment = useMemo(
    () => deployments?.find((d) => d.status === 'success'),
    [deployments],
  )
  // The deployment row carries its version's number and lock, so the live version is
  // known even when it is older than the versions loaded so far.
  const deployedVersion = useMemo(() => {
    if (!activeDeployment?.versionId) return undefined
    if (activeDeployment.version != null) {
      return {
        id: activeDeployment.versionId,
        version: activeDeployment.version,
        locked: activeDeployment.versionLocked ?? 0,
      }
    }
    return versions.find((v) => v.id === activeDeployment.versionId)
  }, [versions, activeDeployment])
  const hasActiveDeployment = !!activeDeployment

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
    workflowRuns,
    currentVersion: versions[0]?.version ?? 0,
    activeDeployment,
    hasActiveDeployment,
    latestDeployment: deployments?.[0],
    deployedVersion,
    hasUndeployedChanges:
      hasActiveDeployment && activeDeployment.versionId !== workflow?.currentVersionId,
    deployBlocked: deployedVersion?.locked === 1,
  }
}

export type WorkflowOverview = ReturnType<typeof useWorkflowOverview>
