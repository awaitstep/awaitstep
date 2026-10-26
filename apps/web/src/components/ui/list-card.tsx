import { Children, type ReactNode } from 'react'
import { cn } from '../../lib/utils'
import { hasContent } from './has-content'
import { ShellLink } from './shell-link'

interface ListCardProps {
  /** Names the list for screen readers when no heading does. */
  label?: string
  /** Shown inside the card when there are no rows. */
  empty?: ReactNode
  /** `false` drops the card's border and fill, for use inside a `ScopedSection`. */
  framed?: boolean
  /** `ListRow`s. */
  children?: ReactNode
}

/** A bordered card of rows: workflows, functions, activity, notifications. */
export function ListCard({ label, empty, framed = true, children }: ListCardProps) {
  const isEmpty = Children.toArray(children).length === 0
  return (
    <div className={cn(framed && 'overflow-hidden rounded-2xl border border-border bg-card')}>
      {isEmpty ? (
        <div className="px-5 py-8 text-center text-xs text-muted-foreground">{empty}</div>
      ) : (
        <ul aria-label={label} className="flex flex-col divide-y divide-border">
          {children}
        </ul>
      )}
    </div>
  )
}

interface ListRowProps {
  /** A `Tile` or avatar. */
  leading?: ReactNode
  title: string
  /** Makes the title a link to the item. */
  href?: string
  description?: ReactNode
  /** Status, history, toggles — laid out left to right, wrapping on phones. */
  trailing?: ReactNode
}

/** One row of a `ListCard`. Only the title is a link, so trailing controls stay usable. */
export function ListRow({ leading, title, href, description, trailing }: ListRowProps) {
  return (
    <li className="flex flex-wrap items-center gap-x-4.5 gap-y-3 px-5 py-4">
      {hasContent(leading) && leading}
      <div className="flex min-w-[200px] flex-1 flex-col gap-0.5">
        {href ? (
          <ShellLink
            href={href}
            className="w-fit text-sm font-semibold text-foreground hover:underline"
          >
            {title}
          </ShellLink>
        ) : (
          <span className="text-sm font-semibold text-foreground">{title}</span>
        )}
        {hasContent(description) && (
          <span className="text-2xs text-muted-foreground">{description}</span>
        )}
      </div>
      {hasContent(trailing) && (
        <div className="flex flex-wrap items-center gap-x-4.5 gap-y-2">{trailing}</div>
      )}
    </li>
  )
}
