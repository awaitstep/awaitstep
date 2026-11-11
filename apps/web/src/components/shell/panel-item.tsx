import type { ReactNode } from 'react'
import { ExternalLink, type LucideIcon } from 'lucide-react'
import { cn } from '../../lib/utils'
import { hasContent } from '../ui/has-content'
import { ShellLink } from '../ui/shell-link'

const rowClass =
  'relative flex h-9 w-full items-center gap-2.5 rounded-md px-2.5 text-xs font-medium transition-colors'
const inactiveRowClass =
  'text-muted-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-foreground'
const activeRowClass = 'bg-sidebar-accent text-sidebar-foreground'

/** Row classes shared by panel links and panel buttons, so both read the same. */
export function panelRowClass(active = false): string {
  return cn(rowClass, active ? activeRowClass : inactiveRowClass)
}

/** The 2px primary bar on the left edge of the active rail or panel item. */
export function ActiveBar() {
  return (
    <span
      aria-hidden="true"
      data-active-bar=""
      className="absolute inset-y-2 left-0 w-0.5 rounded-full bg-primary"
    />
  )
}

export interface PanelItemProps {
  href: string
  icon: LucideIcon
  label: string
  /** Ignored for external items, which never stand for the current page. */
  active?: boolean
  /** Trailing content, such as a count. */
  badge?: ReactNode
  /** Opens in a new tab as a plain anchor instead of an in-app link. */
  external?: boolean
  /** Called when the row is followed, e.g. to close the menu it sits in. */
  onSelect?: () => void
}

/** A panel row: icon + label, with the active bar and `aria-current` when active. */
export function PanelItem({
  href,
  icon: Icon,
  label,
  active = false,
  badge,
  external = false,
  onSelect,
}: PanelItemProps) {
  const isActive = active && !external
  const hasBadge = hasContent(badge)
  const className = panelRowClass(isActive)
  const ariaCurrent = isActive ? 'page' : undefined

  const content = (
    <>
      {isActive && <ActiveBar />}
      <Icon size={16} aria-hidden="true" className="shrink-0" />
      <span className="truncate">{label}</span>
      {(hasBadge || external) && (
        <span className="ml-auto flex shrink-0 items-center gap-1.5">
          {hasBadge && badge}
          {external && <ExternalLink size={12} aria-hidden="true" className="opacity-40" />}
        </span>
      )}
    </>
  )

  if (external) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        onClick={onSelect}
        className={className}
      >
        {content}
      </a>
    )
  }

  return (
    <ShellLink href={href} aria-current={ariaCurrent} onClick={onSelect} className={className}>
      {content}
    </ShellLink>
  )
}

interface PanelSectionProps {
  /** Uppercase caption above the items, such as "Workspace". */
  title?: string
  children: ReactNode
}

/** A group of panel rows, optionally captioned. */
export function PanelSection({ title, children }: PanelSectionProps) {
  return (
    <div role="group" aria-label={title} className="flex flex-col gap-1 px-2.5">
      {title && (
        <p
          aria-hidden="true"
          className="px-2.5 pb-1.5 pt-3.5 text-2xs font-medium uppercase tracking-wider text-muted-foreground"
        >
          {title}
        </p>
      )}
      {children}
    </div>
  )
}
