import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { ActionToast } from '../../lib/action-toast'
import { dashboardApi } from '../../lib/dashboard-api'
import { mockServer } from '../../mocks/dashboard/server'
import type { AcceptedInvite, InviteView, PendingInvite } from '../../types/dashboard/invites'
import { toAcceptedInvite, toInviteView, toPendingInvite } from './api/access'
import { dashKeys, invalidateAll } from './keys'
import { useMockContext } from './scenario-context'
import { useDashKey, useDataSource } from './source'

/** The invite page: which state it's in for the person who opened it. */
export function useInvite(token: string) {
  const source = useDataSource()
  const ctx = useMockContext()
  const key = useDashKey()
  return useQuery({
    queryKey: key(dashKeys.invite(token)),
    queryFn: (): Promise<InviteView> =>
      source === 'api'
        ? dashboardApi.getInvite(token).then(toInviteView)
        : mockServer.invites.getInvite(ctx, token),
    // A signed-out visitor gets 401, which the page turns into the sign-in redirect.
    retry: false,
  })
}

/** Invites waiting for the viewer, on /dashboard's "Waiting for you". */
export function useMyInvites() {
  const source = useDataSource()
  const ctx = useMockContext()
  const key = useDashKey()
  return useQuery({
    queryKey: key(dashKeys.myInvites()),
    queryFn: (): Promise<PendingInvite[]> =>
      source === 'api'
        ? dashboardApi.listMyInvites().then((res) => res.data.map(toPendingInvite))
        : mockServer.invites.listMyInvites(ctx),
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
  const source = useDataSource()
  const ctx = useMockContext()
  const client = useQueryClient()
  return useMutation({
    meta: { toast: { success: 'Invite accepted', error: 'Couldn’t accept the invite' } },
    mutationFn: (): Promise<AcceptedInvite> =>
      source === 'api'
        ? dashboardApi.acceptInvite(token).then(toAcceptedInvite)
        : mockServer.invites.acceptInvite(ctx, token),
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

type Answer = 'declineInvite' | 'undoDeclineInvite' | 'askForNewInvite'

const API_ACTION: Record<Answer, 'decline' | 'undo-decline' | 'ask-again'> = {
  declineInvite: 'decline',
  undoDeclineInvite: 'undo-decline',
  askForNewInvite: 'ask-again',
}

const ANSWER_TOAST: Record<Answer, ActionToast> = {
  declineInvite: { success: 'Invite declined', error: 'Couldn’t decline the invite' },
  undoDeclineInvite: { success: 'Decline undone', error: 'Couldn’t undo the decline' },
  askForNewInvite: { success: 'New invite requested', error: 'Couldn’t ask for a new invite' },
}

function useInviteAnswer(token: string, answer: Answer) {
  const source = useDataSource()
  const ctx = useMockContext()
  const client = useQueryClient()
  return useMutation({
    meta: { toast: ANSWER_TOAST[answer] },
    mutationFn: async (): Promise<void> => {
      if (source !== 'api') return mockServer.invites[answer](ctx, token)
      await dashboardApi.answerInvite(token, API_ACTION[answer])
    },
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
  return useInviteAnswer(token, 'askForNewInvite')
}
