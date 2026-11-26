import {
  ArrowUpCircle,
  KeyRound,
  Lock,
  LogIn,
  ShieldX,
  UserPlus,
  type LucideIcon,
} from 'lucide-react'
import { timeAgoOrDay } from '../../../lib/time'
import { cn } from '../../../lib/utils'
import { LIST_ROW_TEXT_CLASS, listRowClass, listRowTrailingClass } from '../../ui/list-card'
import { Badge } from '../../ui/badge'
import { Tile } from '../../ui/tile'
import { ScopeChip } from '../../ui/workspace-dot'
import type { AuditEvent, AuditKind } from '../../../types/dashboard/audit'

const KIND_LOOK: Record<
  AuditKind,
  { icon: LucideIcon; tone: 'fail' | 'warn' | 'info' | 'ok' | 'neutral' }
> = {
  danger: { icon: ShieldX, tone: 'fail' },
  key: { icon: KeyRound, tone: 'warn' },
  lock: { icon: Lock, tone: 'warn' },
  access: { icon: UserPlus, tone: 'info' },
  deploy: { icon: ArrowUpCircle, tone: 'ok' },
  auth: { icon: LogIn, tone: 'neutral' },
}

interface AuditRowProps {
  event: AuditEvent
}

/** One audit log event, for a `ListCard`: who did what to what, how, where and when. */
export function AuditRow({ event }: AuditRowProps) {
  const { icon: Icon, tone } = KIND_LOOK[event.kind]
  return (
    <li className={cn(listRowClass(true), 'gap-x-4 py-3.5 sm:gap-y-2')}>
      <Tile tone={tone} size="sm">
        <Icon />
      </Tile>
      <div className={cn(LIST_ROW_TEXT_CLASS, 'sm:min-w-[240px]')}>
        <p className="text-sm text-foreground">
          <strong className="font-semibold">{event.actor}</strong> {event.action}{' '}
          <strong className="font-semibold">{event.target}</strong>
        </p>
        {/* The name is the person's to choose; the address says who it was. */}
        <span className="flex flex-wrap gap-x-3 text-2xs text-muted-foreground">
          {event.actorEmail && <span>{event.actorEmail}</span>}
          {event.detail && <span>{event.detail}</span>}
        </span>
      </div>
      <div className={listRowTrailingClass(true)}>
        <AuditScope scope={event.scope} />
        {/* On a phone the time ends the line under the title; wider, it lines up in a column. */}
        <time
          dateTime={event.at}
          className="ml-auto text-2xs text-muted-foreground sm:ml-0 sm:w-24 sm:text-right"
        >
          {timeAgoOrDay(event.at)}
        </time>
      </div>
    </li>
  )
}

function AuditScope({ scope }: { scope: AuditEvent['scope'] }) {
  if (scope.level === 'workspace' && scope.colour) {
    return <ScopeChip colour={scope.colour}>{scope.name}</ScopeChip>
  }
  if (scope.level === 'organization') {
    return <ScopeChip colour="purple">{scope.name}</ScopeChip>
  }
  return (
    <Badge variant="neutral" className="px-2.5 py-1 font-normal">
      {scope.name}
    </Badge>
  )
}
