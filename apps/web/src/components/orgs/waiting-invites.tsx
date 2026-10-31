import { useId, useState } from 'react'
import { useDeclineInvite, useUndoDeclineInvite } from '../../data/dashboard/invites'
import type { PendingInvite } from '../../types/dashboard/invites'
import { InviteRow } from './parts/invite-row'

interface InviteAnswersProps {
  invite: PendingInvite
  declined: boolean
  onDeclined: (invite: PendingInvite) => void
  onUndone: (token: string) => void
}

function InviteAnswers({ invite, declined, onDeclined, onUndone }: InviteAnswersProps) {
  const decline = useDeclineInvite(invite.token)
  const undo = useUndoDeclineInvite(invite.token)

  // Marked first: the decline's refetch drops the invite from the list, and
  // the row must still be here to say so and offer Undo.
  function handleDecline() {
    onDeclined(invite)
    decline.mutate(undefined, { onError: () => onUndone(invite.token) })
  }

  function handleUndo() {
    undo.mutate(undefined, { onSuccess: () => onUndone(invite.token) })
  }

  return (
    <InviteRow
      invite={invite}
      declined={declined}
      busy={decline.isPending || undo.isPending}
      error={(decline.error ?? undo.error)?.message ?? null}
      onDecline={handleDecline}
      onUndo={handleUndo}
    />
  )
}

interface Declined {
  invite: PendingInvite
  /** Where it stood when declined, so it doesn't jump once the list drops it. */
  index: number
}

/** The open invites, with any declined here that the list no longer has put back in place. */
function withDeclined(open: PendingInvite[], declined: Declined[]): PendingInvite[] {
  const rows = [...open]
  for (const { invite, index } of [...declined].sort((a, b) => a.index - b.index)) {
    if (!rows.some((row) => row.token === invite.token)) {
      rows.splice(Math.min(index, rows.length), 0, invite)
    }
  }
  return rows
}

/**
 * "Waiting for you" (17a): open invites with Review and join and Decline. A
 * declined one stays on the page with Undo until you leave it (D-DB-10);
 * the list itself no longer has it, so the page keeps it here.
 */
export function WaitingInvites({ invites }: { invites: PendingInvite[] }) {
  const headingId = useId()
  const [declined, setDeclined] = useState<Declined[]>([])
  const rows = withDeclined(invites, declined)

  function handleDeclined(invite: PendingInvite) {
    const index = rows.findIndex((row) => row.token === invite.token)
    setDeclined((list) => [
      ...list.filter((d) => d.invite.token !== invite.token),
      { invite, index },
    ])
  }

  function handleUndone(token: string) {
    setDeclined((list) => list.filter((d) => d.invite.token !== token))
  }

  if (rows.length === 0) return null
  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-3">
      <h2 id={headingId} className="text-base font-semibold text-foreground">
        Waiting for you
      </h2>
      <ul className="flex flex-col gap-2.5">
        {rows.map((invite) => (
          <InviteAnswers
            key={invite.token}
            invite={invite}
            declined={declined.some((d) => d.invite.token === invite.token)}
            onDeclined={handleDeclined}
            onUndone={handleUndone}
          />
        ))}
      </ul>
    </section>
  )
}
