import { cn } from '../../lib/utils'
import { ShellLink } from './shell-link'

export interface LinkTab {
  key: string
  label: string
  href: string
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
    <nav aria-label={label} className="flex gap-6 overflow-x-auto border-b border-border">
      {tabs.map((tab) => {
        const active = tab.key === activeKey
        return (
          <ShellLink
            key={tab.key}
            href={tab.href}
            aria-current={active ? 'page' : undefined}
            className={cn(
              // As the kit's underline tabs, at the board's 14px.
              '-mb-px flex h-10 shrink-0 items-center border-b-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              active
                ? 'border-primary text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground',
            )}
          >
            {tab.label}
          </ShellLink>
        )
      })}
    </nav>
  )
}
