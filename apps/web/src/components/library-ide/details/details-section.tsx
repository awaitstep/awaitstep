import type { ReactNode } from 'react'
import { cn } from '../../../lib/utils'

/** One titled block of the Details pane (28d): stacked, no dividers. */
export function DetailsSection({
  title,
  label,
  action,
  note,
  children,
}: {
  title: ReactNode
  /** The section's name for assistive tech, when `title` is not plain text. */
  label?: string
  action?: ReactNode
  note?: string
  children: ReactNode
}) {
  return (
    <section
      aria-label={label ?? (typeof title === 'string' ? title : undefined)}
      className="flex flex-col gap-2"
    >
      <div className="flex items-center gap-2">
        <h3 className="flex-1 text-xs font-medium text-muted-foreground">{title}</h3>
        {action}
      </div>
      {children}
      {note && <p className="text-2xs leading-relaxed text-muted-foreground">{note}</p>}
    </section>
  )
}

/** A Details list line: a dot, then what it is. `on` marks the current one. */
export function DotRow({ on, children }: { on?: boolean; children: ReactNode }) {
  return (
    <li className="flex h-6 items-center gap-2 text-xs">
      <span
        aria-hidden="true"
        className={cn(
          'size-1.5 shrink-0 rounded-full',
          on ? 'bg-primary' : 'bg-muted-foreground/40',
        )}
      />
      {children}
    </li>
  )
}

/** The muted line a Details block shows when it has nothing to list. */
export function DetailsEmpty({ children }: { children: ReactNode }) {
  return <p className="text-xs text-muted-foreground">{children}</p>
}
