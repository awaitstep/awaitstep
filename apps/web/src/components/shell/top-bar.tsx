import { Fragment, type ReactNode } from 'react'
import { hasContent } from './has-content'
import { ShellLink } from './shell-link'

export interface Crumb {
  label: string
  /** Omitted for a level that has no page of its own, e.g. "Settings". */
  href?: string
}

interface TopBarProps {
  /** Starts at the org; the last crumb is the current page and never a link. */
  breadcrumbs: Crumb[]
  /** Free space between the breadcrumbs and the actions, e.g. a search field. */
  children?: ReactNode
  actions?: ReactNode
}

function CrumbLabel({ crumb, current }: { crumb: Crumb; current: boolean }) {
  if (current) {
    return (
      <span aria-current="page" className="text-foreground">
        {crumb.label}
      </span>
    )
  }
  if (crumb.href) {
    return (
      <ShellLink
        href={crumb.href}
        className="text-muted-foreground transition-colors hover:text-foreground"
      >
        {crumb.label}
      </ShellLink>
    )
  }
  return <span className="text-muted-foreground">{crumb.label}</span>
}

/** The 64px band at the top of the main column, level with the panel's header row. */
export function TopBar({ breadcrumbs, children, actions }: TopBarProps) {
  const lastIndex = breadcrumbs.length - 1
  return (
    <header className="flex h-16 shrink-0 items-center gap-3 border-b border-border px-6 md:px-8">
      <nav aria-label="Breadcrumb" className="min-w-0">
        <ol className="flex min-w-0 items-center gap-2 text-xs">
          {breadcrumbs.map((crumb, index) => (
            <Fragment key={`${index}-${crumb.label}`}>
              {index > 0 && (
                <li aria-hidden="true" className="text-muted-foreground/60">
                  /
                </li>
              )}
              <li className="min-w-0 truncate">
                <CrumbLabel crumb={crumb} current={index === lastIndex} />
              </li>
            </Fragment>
          ))}
        </ol>
      </nav>
      <div className="flex flex-1 justify-end">{children}</div>
      {hasContent(actions) && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </header>
  )
}
