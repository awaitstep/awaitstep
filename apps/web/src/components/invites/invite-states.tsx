import { Check, Clock, Mail, PenLine } from 'lucide-react'
import { chooseOrgPath } from '../../lib/dashboard-paths'
import type { InviteDetails } from '../../types/dashboard/invites'
import { AuthCard, FactList, type Fact } from '../ui/auth-card'
import { PersonAvatar } from '../ui/avatar-stack'
import { Badge } from '../ui/badge'
import { Button } from '../ui/button'
import { ShellLink } from '../ui/shell-link'
import { Tile } from '../ui/tile'
import { firstName, inviteRole, placeKind, shortDay } from './invite-format'

function OrgTile({ invite }: { invite: InviteDetails }) {
  return (
    <Tile tone="ok" size="lg">
      {invite.org.logo ? (
        <img src={invite.org.logo} alt="" className="size-full rounded-[inherit] object-cover" />
      ) : (
        invite.org.initial
      )}
    </Tile>
  )
}

function EmailTile({ email }: { email: string }) {
  return (
    <Tile tone="neutral" size="sm">
      {email.charAt(0).toUpperCase()}
    </Tile>
  )
}

// D-P9-8: in W1 the dummy session is chosen by ?as=, not by signing in.
const SWITCH_NOTE = 'On sample data, add ?as=<name> to the address to open it as someone else.'

interface OpenInviteProps {
  invite: InviteDetails
  viewerEmail: string
  busy: boolean
  error?: string
  onAccept: () => void
  onDecline: () => void
  /** Not you? Signs out, and signing in again comes back here. */
  onSwitchAccount: () => void
}

/** `AcceptInvite`: where it leads, the role, who's signed in; Accept or Decline. */
export function OpenInvite({
  invite,
  viewerEmail,
  busy,
  error,
  onAccept,
  onDecline,
  onSwitchAccount,
}: OpenInviteProps) {
  const role = inviteRole(invite)
  const facts: Fact[] = []
  if (invite.place) {
    facts.push({
      key: 'place',
      leading: <Tile tone="info">{invite.place.name.charAt(0)}</Tile>,
      label: placeKind(invite.place),
      value: invite.place.name,
      sub: invite.place.kind === 'workspace' ? `in ${invite.place.projectName}` : undefined,
    })
  }
  facts.push(
    {
      key: 'role',
      leading: (
        <Tile tone="ok">
          <PenLine />
        </Tile>
      ),
      label: 'Your role',
      value: role.label,
      sub: role.detail,
    },
    {
      key: 'viewer',
      leading: <EmailTile email={viewerEmail} />,
      label: 'Signed in as',
      value: viewerEmail,
      trailing: (
        <Button
          type="button"
          variant="link"
          size="sm"
          className="h-auto px-0 text-xs text-muted-foreground"
          onClick={onSwitchAccount}
        >
          Not you?
        </Button>
      ),
    },
  )
  const acceptLabel = `Accept and open ${invite.place?.name ?? invite.org.name}`
  return (
    <AuthCard
      width="md"
      avatar={<OrgTile invite={invite} />}
      eyebrow={`${invite.invitedBy.name} invited you to`}
      title={`Join ${invite.org.name}`}
      actions={
        <>
          <Button type="button" className="flex-1" onClick={onAccept} disabled={busy}>
            {acceptLabel}
          </Button>
          <Button type="button" variant="outline" onClick={onDecline} disabled={busy}>
            Decline
          </Button>
        </>
      }
    >
      <FactList items={facts} />
      <p className="text-xs leading-relaxed text-muted-foreground">
        You won’t see other projects or workspaces in {invite.org.name} unless someone adds you. The
        invite expires on {shortDay(invite.expiresAt)}.
      </p>
      {error && (
        <p role="alert" className="text-xs text-status-error">
          {error}
        </p>
      )}
    </AuthCard>
  )
}

interface DeclinedInviteProps {
  invite: InviteDetails
  busy: boolean
  /** Undo failed: expired or replaced meanwhile. */
  error?: string
  onUndo: () => void
}

export function DeclinedInvite({ invite, busy, error, onUndo }: DeclinedInviteProps) {
  const inviter = firstName(invite.invitedBy.name)
  return (
    <AuthCard
      width="md"
      title="Invite declined"
      lead={`We let ${invite.invitedBy.name} know. If that was a mistake, ask ${inviter} to invite you again.`}
      actions={
        <>
          <Button type="button" variant="outline" onClick={onUndo} disabled={busy}>
            Undo
          </Button>
          <Button asChild variant="outline">
            <ShellLink href={chooseOrgPath()}>Go to your organizations</ShellLink>
          </Button>
        </>
      }
    >
      {error && (
        <p role="alert" className="text-xs text-status-error">
          {error}
        </p>
      )}
    </AuthCard>
  )
}

interface WrongAccountProps {
  invite: InviteDetails
  viewerEmail: string
  /** Signs out, and signing in as the invite's address comes back here. */
  onSwitchAccount: () => void
}

/** `InviteWrongAccount`: who it's for, who's signed in. */
export function WrongAccountInvite({ invite, viewerEmail, onSwitchAccount }: WrongAccountProps) {
  return (
    <AuthCard
      width="md"
      avatar={<OrgTile invite={invite} />}
      eyebrow={`Invite to ${invite.org.name}`}
      title="This invite is for another email"
      actions={
        <>
          <Button type="button" className="flex-1" onClick={onSwitchAccount}>
            Sign in as {invite.email}
          </Button>
          <Button asChild variant="outline">
            <ShellLink href={chooseOrgPath()}>Not now</ShellLink>
          </Button>
        </>
      }
    >
      <FactList
        items={[
          {
            key: 'for',
            leading: (
              <Tile tone="neutral">
                <Mail />
              </Tile>
            ),
            label: 'Invite sent to',
            value: invite.email,
            sub: 'The address that can accept it',
          },
          {
            key: 'viewer',
            leading: <EmailTile email={viewerEmail} />,
            label: 'Signed in as',
            value: viewerEmail,
            trailing: <Badge variant="warning">Doesn’t match</Badge>,
          },
        ]}
      />
      <p className="text-xs leading-relaxed text-muted-foreground">
        Sign in as {invite.email} to accept it. If you can’t use that address, ask{' '}
        {invite.invitedBy.name} to invite this one instead. {SWITCH_NOTE}
      </p>
    </AuthCard>
  )
}

interface ExpiredInviteProps {
  invite: InviteDetails
  asked: boolean
  busy: boolean
  error?: string
  onAsk: () => void
}

/** `InviteExpired`: who sent it, when it ran out; ask for a new one, once. */
export function ExpiredInvite({ invite, asked, busy, error, onAsk }: ExpiredInviteProps) {
  const inviter = firstName(invite.invitedBy.name)
  return (
    <AuthCard
      width="md"
      avatar={<OrgTile invite={invite} />}
      eyebrow={`Invite to ${invite.org.name}`}
      title="This invite has expired"
    >
      <FactList
        items={[
          {
            key: 'by',
            leading: <PersonAvatar person={invite.invitedBy} />,
            label: 'Sent by',
            value: invite.invitedBy.name,
            sub: invite.invitedBy.email,
          },
          {
            key: 'expired',
            leading: (
              <Tile tone="warn">
                <Clock />
              </Tile>
            ),
            label: 'Expired',
            value: shortDay(invite.expiresAt),
            sub: '7 days after it was sent',
            trailing: <Badge variant="warning">Expired</Badge>,
          },
        ]}
      />
      <p className="text-xs leading-relaxed text-muted-foreground">
        Invites last 7 days. We can ask {inviter} to send you a new one.
      </p>
      {asked ? (
        <p role="status" className="flex items-center gap-2 text-sm text-status-success">
          <Check className="size-4" aria-hidden="true" />
          Sent. {inviter} gets an email and an inbox notification.
        </p>
      ) : (
        <Button type="button" className="w-fit" onClick={onAsk} disabled={busy}>
          Ask {inviter} for a new invite
        </Button>
      )}
      {error && (
        <p role="alert" className="text-xs text-status-error">
          {error}
        </p>
      )}
    </AuthCard>
  )
}

/** Accepted, cancelled or never there (not drawn): one line and a way on. */
export function GoneInvite() {
  return (
    <AuthCard
      width="md"
      title="This invite is no longer open"
      lead="It was accepted, cancelled or replaced. Ask whoever sent it for a new one."
      actions={
        <Button asChild variant="outline">
          <ShellLink href={chooseOrgPath()}>Go to your organizations</ShellLink>
        </Button>
      }
    />
  )
}
