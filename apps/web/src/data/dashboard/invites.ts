import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { ActionToast } from '../../lib/action-toast'
import { dashboardApi } from '../../lib/dashboard-api'
import type { AcceptedInvite, InviteView, PendingInvite } from '../../types/dashboard/invites'
import { toAcceptedInvite, toInviteView, toPendingInvite } from './api/access'
import { dashKeys, invalidateAll } from './keys'

/** The invite page: which state it's in for the person who opened it. */
export function useInvite(token: string) {
  return useQuery({
    queryKey: dashKeys.invite(token),
    queryFn: (): Promise<InviteView> => dashboardApi.getInvite(token).then(toInviteView),
    // A signed-out visitor gets 401, which the page turns into the sign-in redirect.
    retry: false,
  })
}

/** Invites waiting for the viewer, on /dashboard's "Waiting for you". */
export function useMyInvites() {
  return useQuery({
    queryKey: dashKeys.myInvites(),
    queryFn: (): Promise<PendingInvite[]> =>
      dashboardApi.listMyInvites().then((res) => res.data.map(toPendingInvite)),
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
  const client = useQueryClient()
  return useMutation({
    meta: { toast: { success: 'Invite accepted', error: 'Couldn’t accept the invite' } },
    mutationFn: (): Promise<AcceptedInvite> =>
      dashboardApi.acceptInvite(token).then(toAcceptedInvite),
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
  const client = useQueryClient()
  return useMutation({
    meta: { toast: ANSWER_TOAST[answer] },
    mutationFn: async (): Promise<void> => {
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
