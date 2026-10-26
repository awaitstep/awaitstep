import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { mockServer } from '../../mocks/dashboard/server'
import type { RunFilter } from '../../types/dashboard/runs'
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
