import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { mockServer } from '../../mocks/dashboard/server'
import type { AccessGrant } from '../../types/dashboard/access'
import type {
  NewConnectionInput,
  NewInvitesInput,
  OrgUpdate,
} from '../../types/dashboard/org-settings'
import { dashKeys, invalidateAll, withMockContext } from './keys'
import { useMockContext } from './scenario-context'

/** Org Settings → Members. */
export function useOrgMembers(org: string) {
  const ctx = useMockContext()
  return useQuery({
    queryKey: withMockContext(dashKeys.orgMembers(org), ctx),
    queryFn: () => mockServer.org.listOrgMembers(ctx, org),
  })
}

/** The access editor's data for one person; waits for a person. */
export function usePersonAccess(org: string, userId: string | null) {
  const ctx = useMockContext()
  return useQuery({
    queryKey: withMockContext(dashKeys.personAccess(org, userId ?? ''), ctx),
    queryFn: () => mockServer.org.getPersonAccess(ctx, org, userId!),
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
  const ctx = useMockContext()
  const client = useQueryClient()
  return useMutation({
    mutationFn: ({ userId, grant }: { userId: string; grant: AccessGrant }) =>
      mockServer.org.saveAccess(ctx, org, userId, grant),
    onSuccess: () => invalidateAll(client, accessKeys(org)),
  })
}

export function useRemoveFromOrg(org: string) {
  const ctx = useMockContext()
  const client = useQueryClient()
  return useMutation({
    mutationFn: (userId: string) => mockServer.org.removeFromOrg(ctx, org, userId),
    onSuccess: () => invalidateAll(client, accessKeys(org)),
  })
}

export function useInvitations(org: string) {
  const ctx = useMockContext()
  return useQuery({
    queryKey: withMockContext(dashKeys.invitations(org), ctx),
    queryFn: () => mockServer.org.listInvitations(ctx, org),
  })
}

export function useSendInvites(org: string) {
  const ctx = useMockContext()
  const client = useQueryClient()
  return useMutation({
    mutationFn: (input: NewInvitesInput) => mockServer.org.sendInvites(ctx, org, input),
    onSuccess: () => invalidateAll(client, [dashKeys.invitations(org)]),
  })
}

export function useResendInvite(org: string) {
  const ctx = useMockContext()
  const client = useQueryClient()
  return useMutation({
    mutationFn: (invitationId: string) => mockServer.org.resendInvite(ctx, org, invitationId),
    onSuccess: () => invalidateAll(client, [dashKeys.invitations(org)]),
  })
}

export function useCancelInvite(org: string) {
  const ctx = useMockContext()
  const client = useQueryClient()
  return useMutation({
    mutationFn: (invitationId: string) => mockServer.org.cancelInvite(ctx, org, invitationId),
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

/**
 * Org Settings → General. A new URL leaves every query through the old slug
 * stale rather than refetched (the page follows the new URL).
 */
export function useUpdateOrg(org: string) {
  const ctx = useMockContext()
  const client = useQueryClient()
  return useMutation({
    mutationFn: (update: OrgUpdate) => mockServer.org.updateOrg(ctx, org, update),
    onSuccess: (updated) =>
      invalidateAll(client, [['dash']], updated.slug === org ? undefined : { org }),
  })
}

export function useDeleteOrg(org: string) {
  const ctx = useMockContext()
  const client = useQueryClient()
  return useMutation({
    mutationFn: () => mockServer.org.deleteOrg(ctx, org),
    onSuccess: () => invalidateAll(client, [['dash']], { org }),
  })
}
