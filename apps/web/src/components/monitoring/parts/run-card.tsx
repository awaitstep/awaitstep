import type { ReactNode } from 'react'
import { cn } from '../../../lib/utils'

interface RunCardProps {
  title: ReactNode
  /** A short line beside the title. */
  meta?: ReactNode
  /** Controls at the head's right. */
  actions?: ReactNode
  /** A band under the body, e.g. "Showing 12 of 36". */
  footer?: ReactNode
  className?: string
  children: ReactNode
}

/** A section of the run page (26a): a head line over its body. */
export function RunCard({ title, meta, actions, footer, className, children }: RunCardProps) {
  return (
    <section
      className={cn(
        'flex min-w-0 flex-col overflow-hidden rounded-2xl border border-border bg-card',
        className,
      )}
    >
      <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-3">
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">{meta}</span>
        {actions}
      </div>
      {children}
      {footer && (
        <div className="border-t border-border bg-muted/20 px-4 py-2.5 text-xs text-muted-foreground">
          {footer}
        </div>
      )}
    </section>
  )
}
