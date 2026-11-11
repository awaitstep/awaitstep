import { useQuery } from '@tanstack/react-query'
import { dashboardApi } from '../../lib/dashboard-api'
import { mockServer } from '../../mocks/dashboard/server'
import type { ActivityItem } from '../../types/dashboard/activity'
import { toFailingItem } from './api/runs'
import { dashKeys } from './keys'
import type { FailingNowSummary } from './runs'
import { useMockContext } from './scenario-context'
import { useDashKey, useDataSource } from './source'

/** The org home's own data: the Failing now tile and Recent activity, in one request. */
interface OrgHomeData {
  failing: FailingNowSummary
  activity: ActivityItem[]
}

function useOrgHome<T>(org: string, select: (data: OrgHomeData) => T) {
  const source = useDataSource()
  const ctx = useMockContext()
  const key = useDashKey()
  return useQuery({
    queryKey: key(dashKeys.homeSummary(org)),
    queryFn: async (): Promise<OrgHomeData> => {
      if (source === 'api') {
        const summary = await dashboardApi.getOrgHomeSummary(org)
        return {
          failing: {
            count: summary.failing.count,
            first: summary.failing.first ? toFailingItem(summary.failing.first) : null,
          },
          activity: summary.activity,
        }
      }
      const [failing, activity] = await Promise.all([
        mockServer.runs.listFailingNow(ctx, org),
        mockServer.activity.listActivity(ctx, org),
      ])
      return { failing: { count: failing.length, first: failing[0] ?? null }, activity }
    },
    select,
  })
}

function selectFailing(data: OrgHomeData): FailingNowSummary {
  return data.failing
}

function selectActivity(data: OrgHomeData): ActivityItem[] {
  return data.activity
}

/** Org home "Failing now": a count and the first row, not the whole list. */
export function useOrgHomeSummary(org: string) {
  return useOrgHome(org, selectFailing)
}

/** Org home "Recent activity", across every project and workspace the viewer can open. */
export function useOrgActivity(org: string) {
  return useOrgHome(org, selectActivity)
}
