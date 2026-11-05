import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { useCallback } from 'react'
import { dashboardApi, type ApiRunFilter } from '../../lib/dashboard-api'
import { mockServer } from '../../mocks/dashboard/server'
import type { RunFilter, RunPage, WorkspaceRun } from '../../types/dashboard/runs'
import type { ScopeSlugs } from '../../types/dashboard/scope'
import { toFailingItem, toRunPage } from './api/runs'
import { collectPages } from './export-pages'
import { dashKeys } from './keys'
import { useMockContext } from './scenario-context'
import { useDashKey, useDataSource } from './source'

/** The page's filter as the API takes it; the period the dummy server defaults to, the API is told. */
function apiFilter(filter: RunFilter): ApiRunFilter {
  return {
    result: filter.result,
    period: filter.period ?? '24h',
    search: filter.search?.trim() || undefined,
    cursor: filter.cursor,
    limit: filter.limit,
  }
}

function listRuns(slugs: Required<ScopeSlugs>, filter: RunFilter): Promise<RunPage> {
  return dashboardApi.listRuns(slugs, apiFilter(filter)).then(toRunPage)
}

/**
 * One page of a workspace's runs, newest first, with per-result counts for
 * the filter pills. The page passes `cursor` (from `nextCursor`) for Older and
 * keeps its own stack for Newer; the previous page stays on screen meanwhile.
 */
export function useWorkspaceRuns(slugs: Required<ScopeSlugs>, filter: RunFilter = {}) {
  const source = useDataSource()
  const ctx = useMockContext()
  const key = useDashKey()
  return useQuery({
    queryKey: key(dashKeys.runsOf(slugs, filter)),
    queryFn: () =>
      source === 'api' ? listRuns(slugs, filter) : mockServer.runs.listRuns(ctx, slugs, filter),
    placeholderData: keepPreviousData,
  })
}

/**
 * How many runs one workflow has, by result: over the last 24 hours, or
 * all time. Only its workspace's API answers it; reads wait for `enabled`.
 */
export function useWorkflowRunCounts(
  slugs: Required<ScopeSlugs>,
  workflowId: string,
  { period, enabled = true }: { period?: '24h'; enabled?: boolean } = {},
) {
  return useQuery({
    queryKey: dashKeys.workflowRunCounts(slugs, workflowId, period ?? 'all'),
    queryFn: () =>
      dashboardApi.listRuns(slugs, { workflowId, period, limit: 1 }).then((page) => page.counts),
    enabled,
  })
}

/** Org home "Failing now", across every project and workspace the viewer can open. */
export function useFailingNow(org: string) {
  const source = useDataSource()
  const ctx = useMockContext()
  const key = useDashKey()
  return useQuery({
    queryKey: key(dashKeys.failing(org)),
    queryFn: () =>
      source === 'api'
        ? dashboardApi.listFailing(org).then((res) => res.data.map(toFailingItem))
        : mockServer.runs.listFailingNow(ctx, org),
  })
}

/**
 * Runs → Export: every run matching `filter` (period, result, search), page
 * by page, up to `EXPORT_CAP`. A one-off read, so it skips the query cache.
 */
export function useRunsExport(slugs: Required<ScopeSlugs>) {
  const source = useDataSource()
  const ctx = useMockContext()
  return useCallback(
    (filter: Omit<RunFilter, 'cursor' | 'limit'>): Promise<WorkspaceRun[]> =>
      collectPages((cursor, limit) =>
        source === 'api'
          ? listRuns(slugs, { ...filter, cursor, limit })
          : mockServer.runs.listRuns(ctx, slugs, { ...filter, cursor, limit }),
      ),
    [source, ctx, slugs],
  )
}
