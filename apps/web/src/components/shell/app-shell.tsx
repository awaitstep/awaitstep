import type { ReactNode } from 'react'

interface AppShellProps {
  /** The `OrgRail`. */
  rail: ReactNode
  /** The `ContextPanel`. Omit it on org pages (Resources, Audit log), which use the full width. */
  panel?: ReactNode
  /** The main column: a `TopBar` followed by the page. */
  children: ReactNode
}

/**
 * The dashboard frame: rail, optional panel, main column. Rail and panel are
 * sticky and scroll on their own. Below `md` they are hidden; the phone tab
 * bar replaces them in K5.
 */
export function AppShell({ rail, panel, children }: AppShellProps) {
  return (
    <div className="flex min-h-svh bg-background text-foreground">
      <div className="sticky top-0 hidden h-svh shrink-0 md:flex">
        {rail}
        {panel}
      </div>
      <main className="@container flex min-w-0 flex-1 flex-col">{children}</main>
    </div>
  )
}
