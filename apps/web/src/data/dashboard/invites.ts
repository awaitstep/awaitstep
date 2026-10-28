import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { mockServer } from '../../mocks/dashboard/server'
import { dashKeys, invalidateAll, withMockContext } from './keys'
import { useMockContext } from './scenario-context'

/** The invite page: which state it's in for the person who opened it. */
export function useInvite(token: string) {
  const ctx = useMockContext()
  return useQuery({
    queryKey: withMockContext(dashKeys.invite(token), ctx),
    queryFn: () => mockServer.invites.getInvite(ctx, token),
  })
}

/** Invites waiting for the viewer, on Choose an organization. */
export function useMyInvites() {
  const ctx = useMockContext()
  return useQuery({
    queryKey: withMockContext(dashKeys.myInvites(), ctx),
    queryFn: () => mockServer.invites.listMyInvites(ctx),
  })
}

/** What answering an invite changes: the invite, the inviter's Inbox and Members list. */
function inviteKeys(token: string) {
  return [
    dashKeys.invite(token),
    dashKeys.myInvites(),
    dashKeys.inAnyOrg('notifications'),
    dashKeys.inAnyOrg('invitations'),
  ]
}

/** Accept: they join the org; its lists and the org switcher change too. */
export function useAcceptInvite(token: string) {
  const ctx = useMockContext()
  const client = useQueryClient()
  return useMutation({
    mutationFn: () => mockServer.invites.acceptInvite(ctx, token),
    onSuccess: () =>
      Promise.all([
        // The page is about to leave: refetching would flash "no longer open" first.
        client.invalidateQueries({ queryKey: dashKeys.invite(token), refetchType: 'none' }),
        invalidateAll(client, [
          dashKeys.myInvites(),
          dashKeys.inAnyOrg('notifications'),
          dashKeys.inAnyOrg('invitations'),
          dashKeys.orgs(),
          dashKeys.viewer(),
          dashKeys.scope(),
          dashKeys.inAnyOrg('orgMembers'),
          dashKeys.inAnyOrg('members'),
          dashKeys.inAnyOrg('workspaces'),
          dashKeys.inAnyOrg('projects'),
        ]),
      ]).then(() => undefined),
  })
}

function useInviteAnswer(token: string, answer: 'declineInvite' | 'undoDeclineInvite') {
  const ctx = useMockContext()
  const client = useQueryClient()
  return useMutation({
    mutationFn: () => mockServer.invites[answer](ctx, token),
    onSuccess: () => invalidateAll(client, inviteKeys(token)),
  })
}

export function useDeclineInvite(token: string) {
  return useInviteAnswer(token, 'declineInvite')
}

export function useUndoDeclineInvite(token: string) {
  return useInviteAnswer(token, 'undoDeclineInvite')
}

/** "Ask … for a new invite", once. */
export function useAskForNewInvite(token: string) {
  const ctx = useMockContext()
  const client = useQueryClient()
  return useMutation({
    mutationFn: () => mockServer.invites.askForNewInvite(ctx, token),
    onSuccess: () => invalidateAll(client, inviteKeys(token)),
  })
}
