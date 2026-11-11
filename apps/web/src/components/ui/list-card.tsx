import { Children, type ReactNode } from 'react'
import { cn } from '../../lib/utils'
import { hasContent } from './has-content'
import { LINKED_ROW, STRETCHED_LINK } from './linked-row'
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
  /** Under the rows, e.g. a `Pager`. */
  footer?: ReactNode
}

/** A bordered card of rows: workflows, functions, activity, notifications. */
export function ListCard({ label, empty, framed = true, children, footer }: ListCardProps) {
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
      {hasContent(footer) && <div className="border-t border-border">{footer}</div>}
    </div>
  )
}

interface ListRowProps {
  /** A `Tile` or avatar. */
  leading?: ReactNode
  title: string
  /** Makes the title a link to the item. */
  href?: string
  /** Beside the title, e.g. "This device". Plain content only with `href`: it sits under the row's link. */
  badge?: ReactNode
  /** Plain content only with `href`: it sits under the row's link. */
  description?: ReactNode
  /**
   * Status, history, toggles — laid out left to right, wrapping on phones.
   * With `href`, a control here must sit `ABOVE_LINK` (as `ShareToggle`'s switch does).
   */
  trailing?: ReactNode
}

/**
 * One row of a `ListCard`. With `href` the whole row opens it: the title is the
 * row's one link, stretched over the row (see `linked-row`), and the controls in
 * it sit above that, so a switch in the row still works on its own.
 */
export function ListRow({ leading, title, href, badge, description, trailing }: ListRowProps) {
  const heading = href ? (
    <ShellLink
      href={href}
      className={cn('w-fit text-sm font-semibold text-foreground', STRETCHED_LINK)}
    >
      {title}
    </ShellLink>
  ) : (
    <span className="text-sm font-semibold text-foreground">{title}</span>
  )
  return (
    <li
      className={cn('flex flex-wrap items-center gap-x-4.5 gap-y-3 px-5 py-4', href && LINKED_ROW)}
    >
      {hasContent(leading) && leading}
      <div className="flex min-w-[200px] flex-1 flex-col gap-0.5">
        {hasContent(badge) ? (
          <span className="flex flex-wrap items-center gap-2">
            {heading}
            {badge}
          </span>
        ) : (
          heading
        )}
        {hasContent(description) && (
          <span className="text-xs text-muted-foreground">{description}</span>
        )}
      </div>
      {hasContent(trailing) && (
        <div className="flex flex-wrap items-center gap-x-4.5 gap-y-2">{trailing}</div>
      )}
    </li>
  )
}
