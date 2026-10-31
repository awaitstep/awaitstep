import { invitePath } from '../../../lib/dashboard-paths'
import type { PendingInvite } from '../../../types/dashboard/invites'
import { Button } from '../../ui/button'
import { ShellLink } from '../../ui/shell-link'
import { Tile } from '../../ui/tile'
import { inviteMeta } from '../org-cards'

interface InviteRowProps {
  invite: PendingInvite
  /** Declined here: "Declined. Lena Ortiz was told." with Undo in place of the actions. */
  declined: boolean
  busy: boolean
  error: string | null
  onDecline: () => void
  onUndo: () => void
}

/** One invite in Waiting for you (17a): who and where, Review and join, Decline. */
export function InviteRow({ invite, declined, busy, error, onDecline, onUndo }: InviteRowProps) {
  return (
    <li className="flex flex-wrap items-center gap-4 rounded-2xl border border-primary/20 bg-primary/5 px-4.5 py-4">
      <Tile tone="warn" size="lg">
        {invite.org.initial}
      </Tile>
      <span className="flex min-w-60 flex-1 flex-col gap-0.5">
        <span className="text-sm font-medium text-foreground">
          {invite.invitedBy} invited you to {invite.org.name}
        </span>
        <span className="text-xs text-muted-foreground">
          {declined ? `Declined. ${invite.invitedBy} was told.` : inviteMeta(invite)}
        </span>
        {error && (
          <span role="alert" className="text-xs text-status-error">
            {error}
          </span>
        )}
      </span>
      {declined ? (
        <Button variant="outline" onClick={onUndo} disabled={busy}>
          Undo
        </Button>
      ) : (
        <span className="flex gap-2">
          <Button asChild>
            <ShellLink href={invitePath(invite.token)}>Review and join</ShellLink>
          </Button>
          <Button variant="outline" onClick={onDecline} disabled={busy}>
            Decline
          </Button>
        </span>
      )}
    </li>
  )
}
