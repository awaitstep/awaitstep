import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ApiError } from '../../lib/api-client'
import { authClient } from '../../lib/auth-client'
import { dashboardApi } from '../../lib/dashboard-api'
import { mockServer } from '../../mocks/dashboard/server'
import type { AccessGrant } from '../../types/dashboard/access'
import type {
  Invitation,
  NewConnectionInput,
  NewInvitesInput,
  OrgMember,
  OrgUpdate,
  PersonAccess,
} from '../../types/dashboard/org-settings'
import type { OrgSummary } from '../../types/dashboard/session'
import { toInvitation, toOrgMember, toPersonAccess } from './api/access'
import { dashKeys, invalidateAll, withMockContext } from './keys'
import { useMockContext } from './scenario-context'
import { useDashKey, useDataSource } from './source'
import { useScope } from './workspaces'

/** Org Settings → Members. */
export function useOrgMembers(org: string) {
  const source = useDataSource()
  const ctx = useMockContext()
  const key = useDashKey()
  return useQuery({
    queryKey: key(dashKeys.orgMembers(org)),
    queryFn: (): Promise<OrgMember[]> =>
      source === 'api'
        ? dashboardApi.listOrgMembers(org).then((res) => res.data.map(toOrgMember))
        : mockServer.org.listOrgMembers(ctx, org),
  })
}

/** The access editor's data for one person; waits for a person. */
export function usePersonAccess(org: string, userId: string | null) {
  const source = useDataSource()
  const ctx = useMockContext()
  const key = useDashKey()
  return useQuery({
    queryKey: key(dashKeys.personAccess(org, userId ?? '')),
    queryFn: (): Promise<PersonAccess> =>
      source === 'api'
        ? dashboardApi.getPersonAccess(org, userId!).then(toPersonAccess)
        : mockServer.org.getPersonAccess(ctx, org, userId!),
    enabled: userId !== null,
  })
}

/** Everything someone's access shows up in, across the org. */
function accessKeys(org: string) {
  return [
    dashKeys.orgMembers(org),
    dashKeys.inOrg('members', org),
    dashKeys.inOrg('workspaces', org),
    dashKeys.projects(org),
    dashKeys.orgs(),
    dashKeys.scope(),
  ]
}

export function useSaveAccess(org: string) {
  const source = useDataSource()
  const ctx = useMockContext()
  const client = useQueryClient()
  return useMutation({
    mutationFn: async ({ userId, grant }: { userId: string; grant: AccessGrant }) => {
      if (source !== 'api') return mockServer.org.saveAccess(ctx, org, userId, grant)
      await dashboardApi.saveAccess(org, userId, grant)
    },
    onSuccess: () => invalidateAll(client, accessKeys(org)),
  })
}

export function useRemoveFromOrg(org: string) {
  const source = useDataSource()
  const ctx = useMockContext()
  const client = useQueryClient()
  return useMutation({
    mutationFn: async (userId: string) => {
      if (source !== 'api') return mockServer.org.removeFromOrg(ctx, org, userId)
      await dashboardApi.removeFromOrg(org, userId)
    },
    onSuccess: () => invalidateAll(client, accessKeys(org)),
  })
}

/** Pending invitations, for owners and admins: `enabled: false` keeps a member's page from asking. */
export function useInvitations(org: string, { enabled = true }: { enabled?: boolean } = {}) {
  const source = useDataSource()
  const ctx = useMockContext()
  const key = useDashKey()
  return useQuery({
    queryKey: key(dashKeys.invitations(org)),
    queryFn: (): Promise<Invitation[]> =>
      source === 'api'
        ? dashboardApi.listInvitations(org).then((res) => res.data.map(toInvitation))
        : mockServer.org.listInvitations(ctx, org),
    enabled,
  })
}

/** Invite people: one invitation per address, each emailed. The list refetches for the rows. */
export function useSendInvites(org: string) {
  const source = useDataSource()
  const ctx = useMockContext()
  const client = useQueryClient()
  return useMutation({
    mutationFn: async (input: NewInvitesInput): Promise<void> => {
      if (source !== 'api') {
        await mockServer.org.sendInvites(ctx, org, input)
        return
      }
      await dashboardApi.sendInvites(org, input)
    },
    onSuccess: () => invalidateAll(client, [dashKeys.invitations(org)]),
  })
}

export function useResendInvite(org: string) {
  const source = useDataSource()
  const ctx = useMockContext()
  const client = useQueryClient()
  return useMutation({
    mutationFn: async (invitationId: string) => {
      if (source !== 'api') return mockServer.org.resendInvite(ctx, org, invitationId)
      await dashboardApi.resendInvite(org, invitationId)
    },
    onSuccess: () => invalidateAll(client, [dashKeys.invitations(org)]),
  })
}

export function useCancelInvite(org: string) {
  const source = useDataSource()
  const ctx = useMockContext()
  const client = useQueryClient()
  return useMutation({
    mutationFn: async (invitationId: string) => {
      if (source !== 'api') return mockServer.org.cancelInvite(ctx, org, invitationId)
      await dashboardApi.cancelInvite(org, invitationId)
    },
    onSuccess: () => invalidateAll(client, [dashKeys.invitations(org)]),
  })
}

export function useConnections(org: string) {
  const ctx = useMockContext()
  return useQuery({
    queryKey: withMockContext(dashKeys.connections(org), ctx),
    queryFn: () => mockServer.org.listConnections(ctx, org),
  })
}

/** Connections change the cards and the "Cloudflare connected" setup step. */
function connectionKeys(org: string) {
  return [dashKeys.connections(org), dashKeys.inOrg('setup', org)]
}

export function useConnect(org: string) {
  const ctx = useMockContext()
  const client = useQueryClient()
  return useMutation({
    mutationFn: (input: NewConnectionInput) => mockServer.org.connect(ctx, org, input),
    onSuccess: () => invalidateAll(client, connectionKeys(org)),
  })
}

export function useReplaceToken(org: string) {
  const ctx = useMockContext()
  const client = useQueryClient()
  return useMutation({
    mutationFn: ({ connectionId, token }: { connectionId: string; token: string }) =>
      mockServer.org.replaceToken(ctx, org, connectionId, token),
    onSuccess: () => invalidateAll(client, connectionKeys(org)),
  })
}

export function useUpdateConnection(org: string) {
  const ctx = useMockContext()
  const client = useQueryClient()
  return useMutation({
    mutationFn: ({
      connectionId,
      update,
    }: {
      connectionId: string
      update: { name?: string; projects?: 'all' | string[] }
    }) => mockServer.org.updateConnection(ctx, org, connectionId, update),
    onSuccess: () => invalidateAll(client, connectionKeys(org)),
  })
}

export function useRemoveConnection(org: string) {
  const ctx = useMockContext()
  const client = useQueryClient()
  return useMutation({
    mutationFn: (connectionId: string) => mockServer.org.removeConnection(ctx, org, connectionId),
    onSuccess: () => invalidateAll(client, connectionKeys(org)),
  })
}

/** A refusal from better-auth, as the pages read every other one. */
function authError(
  error: { message?: string; status?: number } | null,
  fallback: string,
): ApiError {
  const message = error?.message ?? fallback
  // The slug hook's refusals name the URL; the page puts those under the URL field.
  const field = /slug|url/i.test(message) ? 'slug' : undefined
  return new ApiError(message, error?.status ?? 400, { field })
}

/**
 * Org Settings → General. On the API the organization is better-auth's:
 * its own update call, whose hook refuses a reserved or taken URL. A new
 * URL leaves every query through the old slug stale rather than refetched
 * (the page follows the new URL).
 */
export function useUpdateOrg(org: string) {
  const source = useDataSource()
  const ctx = useMockContext()
  const client = useQueryClient()
  const scope = useScope({ org })
  const current = scope.data?.found ? scope.data.org.org : null
  return useMutation({
    mutationFn: async (update: OrgUpdate): Promise<OrgSummary> => {
      if (source !== 'api') return mockServer.org.updateOrg(ctx, org, update)
      if (!current) throw new Error('The organization has not loaded yet')
      const name = update.name?.trim()
      const res = await authClient.organization.update({
        organizationId: current.id,
        data: {
          ...(name && { name }),
          ...(update.slug !== undefined && { slug: update.slug }),
          // No logo is stored as an empty string; the dashboard reads that as none.
          ...(update.logo !== undefined && { logo: update.logo ?? '' }),
        },
      })
      if (res.error) throw authError(res.error, 'Could not save the organization')
      return {
        ...current,
        name: name || current.name,
        slug: update.slug ?? current.slug,
        logo: update.logo === undefined ? current.logo : update.logo,
      }
    },
    onSuccess: (updated) =>
      invalidateAll(client, [['dash']], updated.slug === org ? undefined : { org }),
  })
}

/** Deletes an org with no projects left (owners only); better-auth's hook refuses otherwise. */
export function useDeleteOrg(org: string) {
  const source = useDataSource()
  const ctx = useMockContext()
  const client = useQueryClient()
  const scope = useScope({ org })
  const current = scope.data?.found ? scope.data.org.org : null
  return useMutation({
    mutationFn: async (): Promise<void> => {
      if (source !== 'api') return mockServer.org.deleteOrg(ctx, org)
      if (!current) throw new Error('The organization has not loaded yet')
      const res = await authClient.organization.delete({ organizationId: current.id })
      if (res.error) throw authError(res.error, 'Could not delete the organization')
    },
    onSuccess: () => invalidateAll(client, [['dash']], { org }),
  })
}
