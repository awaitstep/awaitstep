import type { ReactNode } from 'react'
import { CircleAlert, Info, TriangleAlert, X } from 'lucide-react'
import { cn } from '../../lib/utils'

type EditorBannerTone = 'info' | 'warn' | 'error'

const TONE_CLASS: Record<EditorBannerTone, string> = {
  info: 'border-status-info/30 bg-tone-info text-foreground/80',
  warn: 'border-status-warning/30 bg-tone-warn text-foreground/80',
  error: 'border-status-error/30 bg-tone-fail text-foreground/80',
}

const TONE_ICON_CLASS: Record<EditorBannerTone, string> = {
  info: 'text-status-info',
  warn: 'text-status-warning',
  error: 'text-status-error',
}

const TONE_ICON = { info: Info, warn: TriangleAlert, error: CircleAlert } as const

interface EditorBannerProps {
  tone: EditorBannerTone
  children: ReactNode
  /** Buttons after the message ("Show", "Discard"). */
  actions?: ReactNode
  /** Adds a close button; omit for a banner that states a fact about the file. */
  onDismiss?: () => void
}

/**
 * A strip above the editor that explains the state of the workspace,
 * announced when it appears. An error is an alert: it interrupts, because
 * the thing it describes (a save that failed) will not fix itself.
 */
export function EditorBanner({ tone, children, actions, onDismiss }: EditorBannerProps) {
  const Icon = TONE_ICON[tone]
  return (
    <div
      role={tone === 'error' ? 'alert' : 'status'}
      className={cn(
        'flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1.5 border-b px-3 py-2 text-xs leading-relaxed',
        TONE_CLASS[tone],
      )}
    >
      <Icon className={cn('size-3.5 shrink-0', TONE_ICON_CLASS[tone])} aria-hidden="true" />
      <span className="min-w-0 flex-1">{children}</span>
      {actions && <div className="flex shrink-0 items-center gap-1.5">{actions}</div>}
      {onDismiss && (
        <button
          type="button"
          aria-label="Dismiss"
          onClick={onDismiss}
          className="flex size-5 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-muted/70 hover:text-foreground"
        >
          <X className="size-3" />
        </button>
      )}
    </div>
  )
}
