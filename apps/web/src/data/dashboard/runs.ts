import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { useCallback } from 'react'
import { mockServer } from '../../mocks/dashboard/server'
import type { RunFilter, WorkspaceRun } from '../../types/dashboard/runs'
import type { ScopeSlugs } from '../../types/dashboard/scope'
import { dashKeys, withMockContext } from './keys'
import { useMockContext } from './scenario-context'

/**
 * One page of a workspace's runs, newest first, with per-result counts for
 * the filter pills. The page passes `cursor` (from `nextCursor`) for Older and
 * keeps its own stack for Newer; the previous page stays on screen meanwhile.
 */
export function useWorkspaceRuns(slugs: Required<ScopeSlugs>, filter: RunFilter = {}) {
  const ctx = useMockContext()
  return useQuery({
    queryKey: withMockContext(dashKeys.runsOf(slugs, filter), ctx),
    queryFn: () => mockServer.runs.listRuns(ctx, slugs, filter),
    placeholderData: keepPreviousData,
  })
}

/** Org home "Failing now", across every project and workspace the viewer can open. */
export function useFailingNow(org: string) {
  const ctx = useMockContext()
  return useQuery({
    queryKey: withMockContext(dashKeys.failing(org), ctx),
    queryFn: () => mockServer.runs.listFailingNow(ctx, org),
  })
}

/** Export stops here; a bigger export is a backend job (B1). */
export const EXPORT_CAP = 1000

/**
 * Runs → Export: every run matching `filter` (period, result, search), page
 * by page, up to `EXPORT_CAP`. A one-off read, so it skips the query cache.
 */
export function useRunsExport(slugs: Required<ScopeSlugs>) {
  const ctx = useMockContext()
  return useCallback(
    async (filter: Omit<RunFilter, 'cursor' | 'limit'>): Promise<WorkspaceRun[]> => {
      const runs: WorkspaceRun[] = []
      let cursor: string | undefined
      do {
        const page = await mockServer.runs.listRuns(ctx, slugs, { ...filter, cursor, limit: 100 })
        runs.push(...page.data)
        cursor = page.nextCursor ?? undefined
      } while (cursor && runs.length < EXPORT_CAP)
      return runs.slice(0, EXPORT_CAP)
    },
    [ctx, slugs],
  )
}
