import { Bell, Check } from 'lucide-react'
import { Button } from '../../ui/button'
import { ShellLink } from '../../ui/shell-link'
import { Tile } from '../../ui/tile'
import type { InboxEmptyKind } from '../inbox-filter'

const COPY: Record<InboxEmptyKind, { title: string; body: string }> = {
  none: {
    title: 'Nothing yet',
    body: 'Failures, access requests and expiring keys appear here.',
  },
  read: {
    title: 'You’re all caught up',
    body: 'Nothing unread. Notifications clear after 30 days.',
  },
  done: {
    title: 'Nothing needs you',
    body: 'Access requests and expiring keys appear here.',
  },
  older: {
    title: 'None in your latest notifications',
    body: 'The matching ones are older and not listed here.',
  },
}

interface InboxEmptyProps {
  kind: InboxEmptyKind
  /** Every notification, for "Show all 6". */
  total: number
  settingsHref: string
  onShowAll: () => void
}

/** The Inbox's three zeroes (boards `Notifications` and `NotificationsFirst`). */
export function InboxEmpty({ kind, total, settingsHref, onShowAll }: InboxEmptyProps) {
  const { title, body } = COPY[kind]
  const first = kind === 'none'
  const caughtUp = kind === 'read' || kind === 'done'
  return (
    <div className="flex flex-col items-center gap-2.5 px-7 pb-10 pt-11 text-center">
      <Tile
        tone={caughtUp ? 'ok' : 'neutral'}
        className={caughtUp ? undefined : 'border border-border'}
      >
        {caughtUp ? <Check /> : <Bell />}
      </Tile>
      <p className="text-sm font-semibold text-foreground">{title}</p>
      <p className="max-w-[290px] text-sm leading-relaxed text-muted-foreground">{body}</p>
      {first ? (
        <ShellLink href={settingsHref} className="text-xs font-medium text-status-success">
          Choose what you’re notified about →
        </ShellLink>
      ) : (
        <Button type="button" variant="outline" size="sm" onClick={onShowAll}>
          Show all {total}
        </Button>
      )}
    </div>
  )
}
