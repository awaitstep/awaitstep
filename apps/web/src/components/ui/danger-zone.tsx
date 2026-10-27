import { useId, type ReactNode } from 'react'
import { cn } from '../../lib/utils'
import { hasContent } from './has-content'
import { Tile } from './tile'

interface DangerZoneProps {
  title?: string
  /** `DangerRow`s. */
  children: ReactNode
}

/** The red-edged card at the foot of a settings page, for what can't be undone. */
export function DangerZone({ title = 'Danger zone', children }: DangerZoneProps) {
  const titleId = useId()
  return (
    <section
      aria-labelledby={titleId}
      className="settings-width overflow-hidden rounded-2xl border border-destructive/40"
    >
      <div className="border-b border-destructive/40 bg-tone-fail px-6 py-4">
        <h2 id={titleId} className="text-sm font-semibold text-status-error">
          {title}
        </h2>
      </div>
      <div className="flex flex-col divide-y divide-destructive/20">{children}</div>
    </section>
  )
}

const ICON_TONE = {
  neutral: 'text-foreground/80',
  warn: 'text-status-warning',
  danger: 'text-status-error',
} as const

interface DangerRowProps {
  icon: ReactNode
  /** Colours the icon: amber for the lock, red for delete. */
  tone?: keyof typeof ICON_TONE
  title: string
  /** Beside the title, e.g. "From Project 101". */
  badge?: ReactNode
  description: ReactNode
  /** A button, link or switch, with any reason under it. */
  action: ReactNode
}

/** One action in a `DangerZone`: what it does on the left, the control on the right. */
export function DangerRow({
  icon,
  tone = 'neutral',
  title,
  badge,
  description,
  action,
}: DangerRowProps) {
  return (
    <div className="flex flex-wrap items-center gap-4 px-6 py-4.5">
      <Tile size="sm" className={cn('size-9', ICON_TONE[tone])}>
        {icon}
      </Tile>
      <div className="flex min-w-[220px] flex-1 flex-col gap-1">
        <span className="flex flex-wrap items-center gap-2 text-sm font-semibold text-foreground">
          {title}
          {hasContent(badge) && badge}
        </span>
        <span className="text-xs leading-relaxed text-muted-foreground">{description}</span>
      </div>
      <div className="flex w-full flex-col items-start gap-1.5 sm:w-[200px] sm:shrink-0 sm:items-end">
        {action}
      </div>
    </div>
  )
}
