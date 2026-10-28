import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { recentOrgs, rememberOrg } from '../../components/navigation/scope-memory'
import { dashboardApi } from '../../lib/dashboard-api'
import { mockServer } from '../../mocks/dashboard/server'
import { useAuthStore } from '../../stores/auth-store'
import type { OrgSummary } from '../../types/dashboard/session'
import { toOrgSummary } from './api/records'
import { viewerFromUser } from './api/session'
import { dashKeys, invalidateAll } from './keys'
import { useMockContext } from './scenario-context'
import { useDashKey, useDataSource } from './source'

/** The signed-in person: the session the app holds, or the dummy one. */
export function useViewer() {
  const source = useDataSource()
  const ctx = useMockContext()
  const key = useDashKey()
  const user = useAuthStore((s) => s.user)
  return useQuery({
    queryKey: [...key(dashKeys.viewer()), user?.id ?? null],
    queryFn: () =>
      source === 'api'
        ? Promise.resolve(viewerFromUser(user, recentOrgs()[0] ?? null))
        : mockServer.session.getViewer(ctx),
  })
}

export function useOrgs() {
  const source = useDataSource()
  const ctx = useMockContext()
  const key = useDashKey()
  return useQuery({
    queryKey: key(dashKeys.orgs()),
    queryFn: () =>
      source === 'api'
        ? dashboardApi.listOrgs().then((res) => res.data.map(toOrgSummary))
        : mockServer.session.listOrgs(ctx),
  })
}

/**
 * Marks an org as the one opened last; the org switcher and ChooseOrg call
 * it. On the API the dashboard remembers it itself, so the next sign-in
 * lands there without a round trip.
 */
export function useSwitchOrg() {
  const source = useDataSource()
  const ctx = useMockContext()
  const client = useQueryClient()
  return useMutation({
    mutationFn: (orgSlug: string): Promise<OrgSummary | null> => {
      if (source !== 'api') return mockServer.session.openOrg(ctx, orgSlug)
      rememberOrg(orgSlug)
      return Promise.resolve(null)
    },
    onSuccess: () => invalidateAll(client, [dashKeys.viewer(), dashKeys.orgs()]),
  })
}
