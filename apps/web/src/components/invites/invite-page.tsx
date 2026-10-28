import {
  useAcceptInvite,
  useAskForNewInvite,
  useDeclineInvite,
  useInvite,
  useUndoDeclineInvite,
} from '../../data/dashboard/invites'
import { handleSignOut } from '../../lib/auth-client'
import { invitePath, orgPath, projectPath, workspacePath } from '../../lib/dashboard-paths'
import type { AcceptedInvite } from '../../types/dashboard/invites'
import { LoadError } from '../ui/load-error'
import { Bone, LoadingRegion } from '../ui/skeletons'
import { AuthLayout } from '../shell/auth-layout'
import { useGoTo } from '../navigation/router-shell-link'
import {
  DeclinedInvite,
  ExpiredInvite,
  GoneInvite,
  OpenInvite,
  WrongAccountInvite,
} from './invite-states'

const FOOTER_LINKS = [{ label: 'Docs', href: 'https://docs.awaitstep.dev' }]

/** Where Accept goes: the invite's first workspace, else its project, else the org's Projects. */
export function landingPath(landing: AcceptedInvite): string {
  const { org, project, workspace } = landing
  if (project && workspace) return workspacePath({ org, project, workspace })
  if (project) return projectPath({ org, project })
  return orgPath(org)
}

interface InvitePageProps {
  token: string
}

/** `/invite/<token>`: AcceptInvite, InviteWrongAccount or InviteExpired, from the data (D-P9-3). */
export function InvitePage({ token }: InvitePageProps) {
  const invite = useInvite(token)
  const accept = useAcceptInvite(token)
  const decline = useDeclineInvite(token)
  const undo = useUndoDeclineInvite(token)
  const ask = useAskForNewInvite(token)
  const goTo = useGoTo()

  function handleAccept() {
    decline.reset()
    accept.mutate(undefined, { onSuccess: (landing) => goTo(landingPath(landing)) })
  }

  function handleDecline() {
    accept.reset()
    decline.mutate()
  }

  function handleUndo() {
    undo.reset()
    undo.mutate()
  }

  function handleAsk() {
    ask.mutate()
  }

  function handleSwitchAccount() {
    void handleSignOut(invitePath(token))
  }

  function handleRetry() {
    void invite.refetch()
  }

  const busy = accept.isPending || decline.isPending || undo.isPending
  const answerError = (accept.error ?? decline.error)?.message

  let card
  if (invite.isError) {
    card = (
      <LoadError
        title="We couldn’t open this invite"
        detail="Nothing was changed. Try again in a moment."
        onRetry={handleRetry}
        retrying={invite.isFetching}
      />
    )
  } else if (!invite.data) {
    card = (
      <LoadingRegion label="Opening the invite">
        <Bone className="h-12 w-64" />
        <Bone className="h-48 w-full rounded-2xl" />
      </LoadingRegion>
    )
  } else {
    const view = invite.data
    switch (view.state) {
      case 'open':
        card = (
          <OpenInvite
            invite={view.invite}
            viewerEmail={view.viewerEmail}
            busy={busy}
            error={answerError}
            onAccept={handleAccept}
            onDecline={handleDecline}
            onSwitchAccount={handleSwitchAccount}
          />
        )
        break
      case 'declined':
        card = (
          <DeclinedInvite
            invite={view.invite}
            busy={busy}
            error={undo.error?.message}
            onUndo={handleUndo}
          />
        )
        break
      case 'wrong-account':
        card = (
          <WrongAccountInvite
            invite={view.invite}
            viewerEmail={view.viewerEmail}
            onSwitchAccount={handleSwitchAccount}
          />
        )
        break
      case 'expired':
        card = (
          <ExpiredInvite
            invite={view.invite}
            asked={view.askedForNew}
            busy={ask.isPending}
            error={ask.error?.message}
            onAsk={handleAsk}
          />
        )
        break
      case 'gone':
        card = <GoneInvite />
    }
  }

  return <AuthLayout footerLinks={FOOTER_LINKS}>{card}</AuthLayout>
}
