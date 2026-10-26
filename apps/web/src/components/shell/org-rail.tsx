import type { ReactNode } from 'react'
import type { Theme } from '../../lib/theme'
import { RailItem, ThemeButton, type RailItemProps } from './rail-item'

export interface RailEntry extends Omit<RailItemProps, 'active'> {
  key: string
}

interface OrgRailProps {
  /** Top of the rail: the org avatar, usually a `RailOrgButton` (a menu trigger). */
  org: ReactNode
  /** Org pages: Projects, Resources, Audit log, Settings. */
  primary: RailEntry[]
  /** Bottom group: What's new, Inbox, API, Docs. */
  secondary: RailEntry[]
  activeKey?: string
  theme: Theme
  onToggleTheme: () => void
  /** Bottom of the rail: usually a `RailAccountButton` (a menu trigger). */
  account: ReactNode
}

function renderEntry(entry: RailEntry, activeKey: string | undefined) {
  const { key, ...item } = entry
  return <RailItem key={key} {...item} active={key === activeKey} />
}

/** Layer 1 of the dashboard: the 72px organization rail, always visible on `md` and up. */
export function OrgRail({
  org,
  primary,
  secondary,
  activeKey,
  theme,
  onToggleTheme,
  account,
}: OrgRailProps) {
  return (
    <nav
      aria-label="Organization"
      className="flex h-full w-[72px] shrink-0 flex-col items-center gap-1 overflow-y-auto border-r border-sidebar-border bg-sidebar py-3"
    >
      {org}
      {primary.map((entry) => renderEntry(entry, activeKey))}
      <div className="flex-1" />
      {secondary.map((entry) => renderEntry(entry, activeKey))}
      <ThemeButton theme={theme} onToggle={onToggleTheme} />
      {account}
    </nav>
  )
}
