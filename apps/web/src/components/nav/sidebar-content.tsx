import { useState, type ReactNode } from 'react'
import { Link, useMatches } from '@tanstack/react-router'
import * as Popover from '@radix-ui/react-popover'
import {
  Activity,
  BookOpen,
  Cable,
  ExternalLink,
  KeyRound,
  LayoutDashboard,
  LogOut,
  Moon,
  PanelLeft,
  Settings,
  SquareTerminal,
  Sun,
  Workflow,
  type LucideIcon,
} from 'lucide-react'
import { useShallow } from 'zustand/react/shallow'
import { NAV_ITEMS, isNavItemActive } from '../../lib/nav'
import { handleSignOut } from '../../lib/auth-client'
import { cn } from '../../lib/utils'
import { useAuthStore } from '../../stores/auth-store'
import { useSidebarStore } from '../../stores/sidebar-store'
import { useThemeStore } from '../../stores/theme-store'
import { useMounted } from '../../hooks/use-mounted'
import { Avatar } from '../ui/avatar'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../ui/tooltip'
import { OrgProjectSwitcher } from './org-project-switcher'

const NAV_ICONS: Record<string, LucideIcon> = {
  '/dashboard': LayoutDashboard,
  '/workflows': Workflow,
  '/runs': Activity,
  '/connections': Cable,
  '/env-vars': KeyRound,
}

interface SidebarContentProps {
  inDrawer?: boolean
  onNavigate?: () => void
}

interface CollapsedTooltipProps {
  label: string
  enabled: boolean
  children: ReactNode
}

function CollapsedTooltip({ label, enabled, children }: CollapsedTooltipProps) {
  const collapsed = useSidebarStore((s) => s.collapsed)
  const mounted = useMounted()
  if (!enabled || !mounted || !collapsed) return <>{children}</>
  return (
    <Tooltip delayDuration={200}>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent side="right">{label}</TooltipContent>
    </Tooltip>
  )
}

const rowClass =
  'relative flex h-8 w-full items-center gap-2.5 rounded-md px-2.5 text-sm font-medium transition-colors'
const inactiveRowClass =
  'text-muted-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-foreground'
const activeRowClass = 'bg-sidebar-accent text-sidebar-foreground'

interface SidebarNavLinkProps {
  to: string
  label: string
  icon: LucideIcon
  collapseAware: boolean
  onNavigate?: () => void
}

function SidebarNavLink({ to, label, icon: Icon, collapseAware, onNavigate }: SidebarNavLinkProps) {
  const matches = useMatches()
  const active = isNavItemActive(
    matches.map((m) => m.routeId),
    to,
  )
  return (
    <CollapsedTooltip label={label} enabled={collapseAware}>
      <Link
        to={to}
        onClick={onNavigate}
        className={cn(
          rowClass,
          active ? activeRowClass : inactiveRowClass,
          collapseAware && 'sidebar-collapsed:justify-center sidebar-collapsed:px-0',
        )}
      >
        {active && <span className="absolute inset-y-2 left-0 w-0.5 rounded-full bg-primary" />}
        <Icon size={16} className="shrink-0" />
        <span className={cn('truncate', collapseAware && 'sidebar-collapsed:hidden')}>{label}</span>
      </Link>
    </CollapsedTooltip>
  )
}

function ThemeToggleRow({ collapseAware }: { collapseAware: boolean }) {
  const { theme, setTheme } = useThemeStore()

  function handleToggle() {
    setTheme(theme === 'dark' ? 'light' : 'dark')
  }

  const label = theme === 'dark' ? 'Light mode' : 'Dark mode'
  return (
    <CollapsedTooltip label={label} enabled={collapseAware}>
      <button
        onClick={handleToggle}
        className={cn(
          rowClass,
          inactiveRowClass,
          collapseAware && 'sidebar-collapsed:justify-center sidebar-collapsed:px-0',
        )}
      >
        {theme === 'dark' ? (
          <Sun size={16} className="shrink-0" />
        ) : (
          <Moon size={16} className="shrink-0" />
        )}
        <span className={cn('truncate', collapseAware && 'sidebar-collapsed:hidden')}>{label}</span>
      </button>
    </CollapsedTooltip>
  )
}

function CollapseToggleRow() {
  const toggleCollapsed = useSidebarStore((s) => s.toggleCollapsed)

  function handleToggle() {
    toggleCollapsed()
  }

  return (
    <CollapsedTooltip label="Expand sidebar" enabled>
      <button
        onClick={handleToggle}
        className={cn(
          rowClass,
          inactiveRowClass,
          'sidebar-collapsed:justify-center sidebar-collapsed:px-0',
        )}
      >
        <PanelLeft size={16} className="shrink-0" />
        <span className="truncate sidebar-collapsed:hidden">Collapse</span>
        <kbd className="ml-auto font-sans text-2xs text-muted-foreground/60 sidebar-collapsed:hidden">
          ⌘B
        </kbd>
      </button>
    </CollapsedTooltip>
  )
}

function UserRow({
  collapseAware,
  onNavigate,
}: {
  collapseAware: boolean
  onNavigate?: () => void
}) {
  const [open, setOpen] = useState(false)
  const collapsed = useSidebarStore((s) => s.collapsed)
  const matches = useMatches()
  const { user } = useAuthStore(useShallow((s) => ({ user: s.user })))

  const active = isNavItemActive(
    matches.map((m) => m.routeId),
    '/account',
  )
  const displayName = user?.name || user?.email || ''

  function handleAccountClick() {
    setOpen(false)
    onNavigate?.()
  }

  function handleSignOutClick() {
    handleSignOut()
  }

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <button
          className={cn(
            rowClass,
            'h-10',
            open || active ? activeRowClass : inactiveRowClass,
            collapseAware && 'sidebar-collapsed:justify-center sidebar-collapsed:px-0',
          )}
        >
          <Avatar name={user?.name} email={user?.email} src={user?.image} size="sm" />
          <span
            className={cn(
              'min-w-0 flex-1 truncate text-left',
              collapseAware && 'sidebar-collapsed:hidden',
            )}
          >
            {displayName}
          </span>
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          side={collapsed && collapseAware ? 'right' : 'top'}
          align="start"
          sideOffset={8}
          className="z-50 w-56 rounded-md border border-border bg-card p-2 shadow-md"
        >
          <p className="truncate px-2 py-1.5 text-xs text-muted-foreground">{user?.email}</p>
          <div className="my-1 h-px bg-border" />
          <Link
            to="/account"
            onClick={handleAccountClick}
            className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm text-foreground/60 transition-colors hover:bg-muted/60 hover:text-foreground"
          >
            <Settings size={14} />
            Account
          </Link>
          <button
            onClick={handleSignOutClick}
            className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm text-foreground/60 transition-colors hover:bg-muted/60 hover:text-foreground"
          >
            <LogOut size={14} />
            Sign out
          </button>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  )
}

export function SidebarContent({ inDrawer = false, onNavigate }: SidebarContentProps) {
  const collapseAware = !inDrawer
  return (
    <TooltipProvider delayDuration={200}>
      <div className="flex h-full min-h-0 flex-col">
        <div className="flex flex-col gap-0.5 border-b border-sidebar-border p-2">
          <OrgProjectSwitcher inDrawer={inDrawer} />
        </div>

        <nav className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto p-2">
          {NAV_ITEMS.map((item) => (
            <SidebarNavLink
              key={item.to}
              to={item.to}
              label={item.label}
              icon={NAV_ICONS[item.to] ?? LayoutDashboard}
              collapseAware={collapseAware}
              onNavigate={onNavigate}
            />
          ))}

          <p
            className={cn(
              'px-2.5 pb-1.5 pt-5 text-2xs font-medium uppercase tracking-wider text-muted-foreground/60',
              collapseAware && 'sidebar-collapsed:hidden',
            )}
          >
            Developer
          </p>
          <div
            className={cn(
              'mx-2 mb-1 mt-3 hidden h-px bg-sidebar-border',
              collapseAware && 'sidebar-collapsed:block',
            )}
          />
          <SidebarNavLink
            to="/api-playground"
            label="API Playground"
            icon={SquareTerminal}
            collapseAware={collapseAware}
            onNavigate={onNavigate}
          />
          <CollapsedTooltip label="Docs" enabled={collapseAware}>
            <a
              href="https://docs.awaitstep.dev"
              target="_blank"
              rel="noopener noreferrer"
              className={cn(
                rowClass,
                inactiveRowClass,
                collapseAware && 'sidebar-collapsed:justify-center sidebar-collapsed:px-0',
              )}
            >
              <BookOpen size={16} className="shrink-0" />
              <span className={cn('truncate', collapseAware && 'sidebar-collapsed:hidden')}>
                Docs
              </span>
              <ExternalLink
                size={12}
                className={cn(
                  'ml-auto shrink-0 opacity-40',
                  collapseAware && 'sidebar-collapsed:hidden',
                )}
              />
            </a>
          </CollapsedTooltip>
        </nav>

        <div className="flex flex-col gap-0.5 border-t border-sidebar-border p-2">
          <SidebarNavLink
            to="/settings"
            label="Settings"
            icon={Settings}
            collapseAware={collapseAware}
            onNavigate={onNavigate}
          />
          <ThemeToggleRow collapseAware={collapseAware} />
          {!inDrawer && <CollapseToggleRow />}
          <UserRow collapseAware={collapseAware} onNavigate={onNavigate} />
        </div>
      </div>
    </TooltipProvider>
  )
}
