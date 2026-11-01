import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useOrgStore, type Organization } from '../../stores/org-store'
import { orgOpenedAt, recentOrgs, rememberOrg } from '../../components/navigation/scope-memory'
import { slugify } from '@awaitstep/ir'
import { authClient } from '../../lib/auth-client'
import { dashboardApi } from '../../lib/dashboard-api'
import { mockServer } from '../../mocks/dashboard/server'
import { useAuthStore } from '../../stores/auth-store'
import type { OrgListing, OrgSummary } from '../../types/dashboard/session'
import { toOrgListing } from './api/records'
import { viewerFromUser } from './api/session'
import { authError } from './errors'
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
    queryFn: (): Promise<OrgListing[]> =>
      source === 'api'
        ? dashboardApi
            .listOrgs()
            .then((res) => res.data.map((org) => toOrgListing(org, orgOpenedAt(org.slug))))
        : mockServer.session.listOrgs(ctx),
  })
}

/**
 * Marks an org as the one opened last; the org switcher and /dashboard's
 * cards call it. On the API the dashboard remembers it itself, so the next sign-in
 * lands there without a round trip.
 */
export function useSwitchOrg() {
  const source = useDataSource()
  const ctx = useMockContext()
  const client = useQueryClient()
  return useMutation({
    // Records the org you opened; you navigate there anyway (D-AT-2).
    meta: { toast: 'silent' },
    mutationFn: (orgSlug: string): Promise<OrgSummary | null> => {
      if (source !== 'api') return mockServer.session.openOrg(ctx, orgSlug)
      rememberOrg(orgSlug)
      return Promise.resolve(null)
    },
    onSuccess: () => invalidateAll(client, [dashKeys.viewer(), dashKeys.orgs()]),
  })
}

/**
 * Creates an organization with you as its owner (/dashboard's Create an
 * organization). On the API it is better-auth's own call, whose hook refuses
 * a reserved or taken URL. The new org is remembered as opened now, so it is
 * first with Last used before its page is even entered; the old pages' org
 * store hears of it too, active when nothing valid was, so they stop treating
 * the session as having none until the layout's loader refetches.
 */
export function useCreateOrg() {
  const source = useDataSource()
  const ctx = useMockContext()
  const client = useQueryClient()
  return useMutation({
    meta: { toast: { success: 'Organization created', error: 'Couldn’t create the organization' } },
    mutationFn: async (name: string): Promise<{ slug: string }> => {
      if (source !== 'api') return mockServer.org.createOrg(ctx, name)
      const trimmed = name.trim()
      const res = await authClient.organization.create({
        name: trimmed,
        slug: slugify(trimmed, 'org'),
      })
      if (res.error || !res.data) {
        const field = /slug|url/i.test(res.error?.message ?? '') ? 'name' : undefined
        throw authError(res.error, 'Could not create the organization', field)
      }
      const store = useOrgStore.getState()
      const hadActive = store.organizations.some((o) => o.id === store.activeOrganizationId)
      store.addOrganization(res.data as Organization)
      if (!hadActive) store.setActiveOrganization(res.data.id)
      rememberOrg(res.data.slug)
      return { slug: res.data.slug }
    },
    onSuccess: () => invalidateAll(client, [dashKeys.viewer(), dashKeys.orgs()]),
  })
}
