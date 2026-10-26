import { useRef } from 'react'
import {
  AlertTriangle,
  ArrowRight,
  ArrowUpCircle,
  AtSign,
  Clock,
  UserPlus,
  type LucideIcon,
} from 'lucide-react'
import { cn } from '../../../lib/utils'
import { timeAgoOrDay } from '../../../lib/time'
import { Button } from '../../ui/button'
import { ShellLink } from '../../ui/shell-link'
import { Tile } from '../../ui/tile'
import type { InboxNotification, NotificationKind } from '../../../types/dashboard/inbox'

const KIND_LOOK: Record<
  NotificationKind,
  { icon: LucideIcon; tone: 'fail' | 'warn' | 'info' | 'ok' | 'neutral' }
> = {
  failure: { icon: AlertTriangle, tone: 'fail' },
  request: { icon: UserPlus, tone: 'info' },
  expiry: { icon: Clock, tone: 'warn' },
  people: { icon: AtSign, tone: 'ok' },
  deploy: { icon: ArrowUpCircle, tone: 'neutral' },
}

interface NotificationRowProps {
  notification: InboxNotification
  /** Following the row's link marks it read. */
  onRead?: (id: string) => void
  onApprove?: (id: string) => void
  onDecline?: (id: string) => void
}

/**
 * One Inbox notification, for a `ListCard`. An edit-access request carries
 * Approve and Decline; once decided, they give way to the outcome, which takes
 * focus so it isn't lost with the button.
 */
export function NotificationRow({
  notification,
  onRead,
  onApprove,
  onDecline,
}: NotificationRowProps) {
  const { icon: Icon, tone } = KIND_LOOK[notification.kind]
  const focusOutcome = useRef(false)
  const request = notification.request

  function handleRead() {
    onRead?.(notification.id)
  }

  function handleApprove() {
    focusOutcome.current = true
    onApprove?.(notification.id)
  }

  function handleDecline() {
    focusOutcome.current = true
    onDecline?.(notification.id)
  }

  function handleOutcomeRef(node: HTMLParagraphElement | null) {
    if (node && focusOutcome.current) {
      focusOutcome.current = false
      node.focus()
    }
  }

  return (
    <li className="flex items-start gap-3.5 px-5 py-4">
      <Tile tone={tone} size="sm">
        <Icon />
      </Tile>
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <p
          className={cn(
            'text-xs',
            notification.read ? 'text-foreground/80' : 'font-medium text-foreground',
          )}
        >
          {notification.title}
        </p>
        <span className="text-2xs text-muted-foreground">
          {notification.where} · {timeAgoOrDay(notification.at)}
        </span>
        {request?.status === 'pending' && (
          <span className="flex gap-2 pt-1">
            <Button type="button" size="sm" onClick={handleApprove}>
              Approve
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={handleDecline}>
              Decline
            </Button>
          </span>
        )}
        {request && request.status !== 'pending' && request.outcome && (
          <p
            ref={handleOutcomeRef}
            role="status"
            tabIndex={-1}
            className={cn(
              'text-2xs focus-visible:outline-none',
              request.status === 'approved' ? 'text-status-success' : 'text-muted-foreground',
            )}
          >
            {request.outcome}
          </p>
        )}
        {notification.link && (
          <ShellLink
            href={notification.link.href}
            onClick={handleRead}
            className="flex w-fit items-center gap-1 text-2xs font-medium text-status-success hover:underline"
          >
            {notification.link.label}
            <ArrowRight className="size-3" aria-hidden="true" />
          </ShellLink>
        )}
      </div>
      {!notification.read && (
        <span
          role="img"
          aria-label="Unread"
          className="mt-1.5 size-2 shrink-0 rounded-full bg-primary"
        />
      )}
    </li>
  )
}
