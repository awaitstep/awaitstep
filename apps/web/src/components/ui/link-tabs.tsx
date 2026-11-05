import { cn } from '../../lib/utils'
import { ShellLink } from './shell-link'

export interface LinkTab {
  key: string
  label: string
  href: string
  /** A count in a pill beside the label (`WorkflowDetail`'s "Runs 128"); none when left out. */
  count?: number
}

interface LinkTabsProps {
  /** Names the nav for screen readers, e.g. "Account sections". */
  label: string
  tabs: LinkTab[]
  activeKey: string
}

/** Underlined tabs that are pages of their own (`AccountProfile`): links, not a tablist. */
export function LinkTabs({ label, tabs, activeKey }: LinkTabsProps) {
  return (
    <nav aria-label={label} className="flex flex-wrap gap-x-6 border-b border-border">
      {tabs.map((tab) => {
        const active = tab.key === activeKey
        return (
          <ShellLink
            key={tab.key}
            href={tab.href}
            aria-current={active ? 'page' : undefined}
            className={cn(
              // As the kit's underline tabs, at the board's 14px.
              '-mb-px flex h-10 shrink-0 items-center gap-[7px] border-b-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              active
                ? 'border-primary text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground',
            )}
          >
            {tab.label}
            {/* A space, so the name reads "Runs 128"; the gap already spaces it on screen. */}
            {tab.count !== undefined && ' '}
            {tab.count !== undefined && (
              <span className="rounded-full bg-muted px-1.5 py-px text-[11px] font-medium tabular-nums text-muted-foreground">
                {tab.count}
              </span>
            )}
          </ShellLink>
        )
      })}
    </nav>
  )
}
