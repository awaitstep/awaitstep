import type { ReactNode } from 'react'
import { cn } from '../../lib/utils'
import { hasContent } from '../ui/has-content'

interface AppShellProps {
  /** The `OrgRail`. */
  rail: ReactNode
  /** The `ContextPanel`. Omit it on org and account pages. */
  panel?: ReactNode
  /** Below `md`: the `MobileHeader` that replaces the panel and `TopBar`. */
  mobileHeader?: ReactNode
  /** Below `md`: the `MobileTabBar` that replaces the rail. */
  tabBar?: ReactNode
  /** The main column: a `TopBar` followed by the page. */
  children: ReactNode
}

/**
 * The dashboard frame: rail, optional panel, main column. Rail and panel are
 * sticky and scroll on their own. Below `md` they are hidden and the phone
 * header and tab bar take their place.
 */
export function AppShell({ rail, panel, mobileHeader, tabBar, children }: AppShellProps) {
  const hasTabBar = hasContent(tabBar)
  return (
    <div className="flex min-h-svh flex-col bg-background text-foreground md:flex-row">
      {hasContent(mobileHeader) && (
        <div className="sticky top-0 z-30 md:hidden">{mobileHeader}</div>
      )}
      <div className="sticky top-0 hidden h-svh shrink-0 md:flex">
        {rail}
        {panel}
      </div>
      <main
        className={cn(
          '@container flex min-w-0 flex-1 flex-col',
          hasTabBar && 'pb-[calc(3.5rem+env(safe-area-inset-bottom))] md:pb-0',
        )}
      >
        {children}
      </main>
      {hasTabBar && <div className="md:hidden">{tabBar}</div>}
    </div>
  )
}
