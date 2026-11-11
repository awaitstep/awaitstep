import { useId, type ReactNode } from 'react'
import { ArrowRight, type LucideIcon } from 'lucide-react'
import { cn } from '../../lib/utils'
import { hasContent } from './has-content'
import { ShellLink } from './shell-link'
import { Tile } from './tile'

type ActionCardTone = 'ok' | 'info' | 'warn'

const CTA_TONE_CLASS: Record<ActionCardTone, string> = {
  ok: 'text-status-success',
  info: 'text-status-info',
  warn: 'text-status-warning',
}

interface ActionCardProps {
  /** Where the card leads. Give `onSelect` instead for an action, e.g. "New workflow". */
  href?: string
  onSelect?: () => void
  /** With `onSelect`: while the action runs, so a second click doesn't repeat it. */
  disabled?: boolean
  icon: LucideIcon
  tone: ActionCardTone
  title: string
  description: string
  /** The arrowed line at the foot, e.g. "Start building". */
  cta?: string
  /** Top-right label, e.g. "Step 1" or "Optional". */
  corner?: ReactNode
  /** The suggested next step: a primary-coloured border. */
  highlighted?: boolean
  /** `dashed`: an unfilled, centred card with a dashed border, for "New project" / "New workspace". */
  variant?: 'solid' | 'dashed'
}

/** A whole-card link (or, with `onSelect`, a button) to the next thing to do in a new org, project or workspace. */
export function ActionCard({
  href,
  onSelect,
  disabled,
  icon: Icon,
  tone,
  title,
  description,
  cta,
  corner,
  highlighted,
  variant = 'solid',
}: ActionCardProps) {
  const titleId = useId()
  const descriptionId = useId()
  const className = cn(
    'flex flex-col gap-3 rounded-2xl border p-5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
    // The "New …" tile: unfilled, its content centred, as the boards draw it.
    variant === 'dashed'
      ? 'min-h-[200px] items-center justify-center border-dashed bg-transparent text-center'
      : 'bg-card',
    highlighted ? 'border-primary shadow-lg' : 'border-border hover:border-foreground/20',
  )
  const content = (
    <>
      <span className="flex items-center justify-between gap-2">
        <Tile tone={tone}>
          <Icon />
        </Tile>
        {hasContent(corner) && <span className="text-2xs text-muted-foreground">{corner}</span>}
      </span>
      <span className="flex flex-col gap-1">
        <span id={titleId} className="text-sm font-semibold text-foreground">
          {title}
        </span>
        <span id={descriptionId} className="text-sm leading-relaxed text-muted-foreground">
          {description}
        </span>
      </span>
      {cta && (
        <span
          aria-hidden="true"
          className={cn(
            'mt-auto flex items-center gap-1.5 text-xs font-medium',
            CTA_TONE_CLASS[tone],
          )}
        >
          {cta}
          <ArrowRight className="size-3.5" />
        </span>
      )}
    </>
  )
  const labelling = { 'aria-labelledby': titleId, 'aria-describedby': descriptionId }
  if (href === undefined) {
    return (
      <button
        type="button"
        onClick={onSelect}
        disabled={disabled}
        className={cn(className, 'disabled:cursor-wait disabled:opacity-70')}
        {...labelling}
      >
        {content}
      </button>
    )
  }
  return (
    <ShellLink href={href} className={className} {...labelling}>
      {content}
    </ShellLink>
  )
}
