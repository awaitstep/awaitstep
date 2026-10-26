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
    <li className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3.5">
      <Tile tone={tone} size="sm">
        <Icon />
      </Tile>
      <div className="flex min-w-[240px] flex-1 flex-col gap-0.5">
        <p className="text-xs text-foreground">
          <strong className="font-semibold">{event.actor}</strong> {event.action}{' '}
          <strong className="font-semibold">{event.target}</strong>
        </p>
        <span className="text-2xs text-muted-foreground">{event.detail}</span>
      </div>
      <AuditScope scope={event.scope} />
      <time dateTime={event.at} className="w-24 text-right text-2xs text-muted-foreground">
        {timeAgoOrDay(event.at)}
      </time>
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
    <Badge variant="neutral" dot className="px-2.5 py-1 font-normal">
      {scope.name}
    </Badge>
  )
}
