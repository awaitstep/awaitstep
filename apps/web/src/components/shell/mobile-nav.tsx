import type { ComponentProps, ReactNode } from 'react'
import { ChevronDown, ChevronLeft } from 'lucide-react'
import { cn } from '../../lib/utils'
import { OrgMark } from './org-mark'
import { hasContent } from '../ui/has-content'
import { ShellLink } from '../ui/shell-link'
import { scopeTileColourClass } from '../ui/workspace-colour'
import type { ScopeTile } from './context-panel'
import type { RailEntry } from './org-rail'
import { RailBadgeMark, visibleBadge } from './rail-item'

interface MobileTabBarProps {
  /** Projects, Resources, Audit log, Inbox, Settings — the same entries as the rail's. */
  items: RailEntry[]
  activeKey?: string
}

function TabLink({
  href,
  icon: Icon,
  label,
  badge,
  active,
}: Omit<RailEntry, 'key'> & { active: boolean }) {
  const shownBadge = visibleBadge(badge)
  return (
    <ShellLink
      href={href}
      aria-current={active ? 'page' : undefined}
      aria-label={shownBadge ? `${label}, ${shownBadge.description}` : undefined}
      className={cn(
        'relative flex min-h-14 flex-1 flex-col items-center justify-center gap-1 pb-2 pt-2.5 text-3xs font-medium transition-colors',
        active ? 'text-sidebar-foreground' : 'text-muted-foreground',
      )}
    >
      {active && (
        <span
          aria-hidden="true"
          className="absolute inset-x-5 top-0 h-0.5 rounded-full bg-primary"
        />
      )}
      <span className="relative flex">
        <Icon size={20} aria-hidden="true" />
        {shownBadge && <RailBadgeMark badge={shownBadge} />}
      </span>
      <span>{label}</span>
    </ShellLink>
  )
}

/** The rail below `md`: five tabs fixed to the bottom of the screen. */
export function MobileTabBar({ items, activeKey }: MobileTabBarProps) {
  return (
    <nav
      aria-label="Organization"
      data-mobile-tab-bar
      className="fixed inset-x-0 bottom-0 z-40 flex border-t border-sidebar-border bg-sidebar pb-[env(safe-area-inset-bottom)]"
    >
      {items.map(({ key, ...item }) => (
        <TabLink key={key} {...item} active={key === activeKey} />
      ))}
    </nav>
  )
}

interface MobileHeaderProps {
  /** Workspace pages: the way back to the org's projects. */
  back?: { label: string; href: string }
  /** Workspace pages: a `MobileScopeButton` that opens the project menu. */
  scope?: ReactNode
  /** Org pages: the org switcher trigger. */
  org?: ReactNode
  /** The account menu trigger. */
  account: ReactNode
}

/** The 56px bar at the top of the screen below `md`, in place of the panel and `TopBar`. */
export function MobileHeader({ back, scope, org, account }: MobileHeaderProps) {
  return (
    <header className="flex h-14 shrink-0 items-center gap-1.5 border-b border-sidebar-border bg-sidebar px-2">
      {back && (
        <ShellLink
          href={back.href}
          aria-label={back.label}
          className="flex size-11 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-foreground"
        >
          <ChevronLeft size={20} aria-hidden="true" />
        </ShellLink>
      )}
      <div className="flex min-w-0 flex-1">
        {hasContent(scope) && scope}
        {hasContent(org) && org}
      </div>
      {account}
    </header>
  )
}

type MobileScopeButtonProps = ComponentProps<'button'> & {
  project: string
  workspace: string
  tile: ScopeTile
}

/** "Project 101 / Sales" with the workspace tile: opens the project menu sheet. */
export function MobileScopeButton({
  project,
  workspace,
  tile,
  className,
  ...props
}: MobileScopeButtonProps) {
  return (
    <button
      type="button"
      aria-label={`${project}, ${workspace}. Open the project menu`}
      className={cn(
        'flex min-h-11 min-w-0 items-center gap-2.5 rounded-lg px-2 text-left hover:bg-sidebar-accent/60',
        className,
      )}
      {...props}
    >
      <span
        aria-hidden="true"
        className={cn(
          'flex size-7 shrink-0 items-center justify-center rounded-md text-2xs font-semibold',
          scopeTileColourClass(tile.colour),
        )}
      >
        {tile.initial}
      </span>
      <span className="flex min-w-0 flex-col">
        <span className="truncate text-2xs text-muted-foreground">{project}</span>
        <span className="truncate text-sm font-semibold text-sidebar-foreground">{workspace}</span>
      </span>
      <ChevronDown size={16} aria-hidden="true" className="shrink-0 text-muted-foreground" />
    </button>
  )
}

type MobileOrgButtonProps = ComponentProps<'button'> & {
  name: string
  initial: string
  logo?: string | null
}

/** The org name in the phone header on org pages: opens the org switcher. */
export function MobileOrgButton({
  name,
  initial,
  logo,
  className,
  ...props
}: MobileOrgButtonProps) {
  return (
    <button
      type="button"
      aria-label={`${name}, switch organization`}
      className={cn(
        'flex min-h-11 min-w-0 items-center gap-2.5 rounded-lg px-2 hover:bg-sidebar-accent/60',
        className,
      )}
      {...props}
    >
      <span
        aria-hidden="true"
        className="flex size-7 shrink-0 items-center justify-center overflow-hidden rounded-md bg-primary text-2xs font-semibold text-primary-foreground"
      >
        <OrgMark initial={initial} logo={logo} />
      </span>
      <span className="truncate text-sm font-semibold text-sidebar-foreground">{name}</span>
      <ChevronDown size={16} aria-hidden="true" className="shrink-0 text-muted-foreground" />
    </button>
  )
}
