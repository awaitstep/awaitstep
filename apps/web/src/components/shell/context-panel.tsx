import type { ComponentProps, ReactNode } from 'react'
import { ChevronLeft, ChevronsUpDown } from 'lucide-react'
import { cn } from '../../lib/utils'
import { scopeTileColourClass, type WorkspaceColour } from '../ui/workspace-colour'
import { panelRowClass } from './panel-item'
import { hasContent } from '../ui/has-content'
import { ShellLink } from './shell-link'

interface ContextPanelProps {
  /** Names the panel's navigation landmark, e.g. "Project" or "Organization settings". */
  label: string
  /** The 64px top row: a `PanelScopeButton` or `PanelOrgHeader`. */
  header: ReactNode
  /** Pinned to the bottom above a divider, e.g. "Project settings". */
  footer?: ReactNode
  children: ReactNode
}

/**
 * Layer 2 of the dashboard: the panel beside the rail. Its three modes
 * (workspace, project settings, org settings) are compositions of the parts
 * in this file and `PanelSection` / `PanelItem`.
 */
export function ContextPanel({ label, header, footer, children }: ContextPanelProps) {
  return (
    <nav
      aria-label={label}
      className="flex h-full w-[232px] shrink-0 flex-col border-r border-sidebar-border bg-sidebar"
    >
      <div className="flex h-16 shrink-0 items-center border-b border-sidebar-border">{header}</div>
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto pb-2">{children}</div>
      {hasContent(footer) && (
        <div className="flex shrink-0 flex-col gap-0.5 border-t border-sidebar-border p-2.5">
          {footer}
        </div>
      )}
    </nav>
  )
}

export interface ScopeTile {
  initial: string
  /** Workspaces carry their swatch; projects use a neutral tile. */
  colour?: WorkspaceColour
}

type PanelScopeButtonProps = ComponentProps<'button'> & {
  /** What the scope is: "Project" or "Workspace". */
  scope: string
  name: string
  tile: ScopeTile
  /** `header` fills the panel's top row; `card` is the boxed workspace switcher. */
  variant: 'header' | 'card'
}

const SCOPE_BUTTON_VARIANT = {
  header: {
    button: 'h-full w-full px-3.5 hover:bg-sidebar-accent/60',
    tile: 'size-7 text-2xs',
    name: 'font-semibold',
  },
  card: {
    button:
      'mx-2.5 mb-1 mt-3 rounded-lg border border-border bg-card px-2.5 py-2 hover:bg-sidebar-accent',
    tile: 'size-[22px] text-3xs',
    name: 'font-medium',
  },
} as const

/**
 * Shows the current project or workspace and opens its switcher. Spreads extra
 * props and the ref onto the button so a popover can use it as its trigger.
 */
export function PanelScopeButton({
  scope,
  name,
  tile,
  variant,
  className,
  ...props
}: PanelScopeButtonProps) {
  const classes = SCOPE_BUTTON_VARIANT[variant]
  return (
    <button
      type="button"
      aria-label={`${scope}: ${name}. Switch ${scope.toLowerCase()}`}
      className={cn(
        'flex cursor-pointer items-center gap-2.5 text-left transition-colors',
        classes.button,
        className,
      )}
      {...props}
    >
      <span
        aria-hidden="true"
        className={cn(
          'flex shrink-0 items-center justify-center rounded-md font-semibold',
          classes.tile,
          scopeTileColourClass(tile.colour),
        )}
      >
        {tile.initial}
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="text-2xs text-muted-foreground">{scope}</span>
        <span className={cn('truncate text-sm text-sidebar-foreground', classes.name)}>{name}</span>
      </span>
      <ChevronsUpDown size={14} aria-hidden="true" className="shrink-0 text-muted-foreground" />
    </button>
  )
}

interface PanelOrgHeaderProps {
  name: string
  initial: string
}

/** The org-settings panel header: the org itself, not a switcher. */
export function PanelOrgHeader({ name, initial }: PanelOrgHeaderProps) {
  return (
    <div className="flex h-full w-full items-center gap-2.5 px-3.5">
      <span
        aria-hidden="true"
        className="flex size-7 shrink-0 items-center justify-center rounded-md bg-primary text-2xs font-semibold text-primary-foreground"
      >
        {initial}
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="text-2xs text-muted-foreground">Organization</span>
        <span className="truncate text-sm font-semibold text-sidebar-foreground">{name}</span>
      </span>
    </div>
  )
}

interface PanelBackLinkProps {
  href: string
  label: string
}

/** "← Back to …": leaves a settings mode for the place it was entered from. */
export function PanelBackLink({ href, label }: PanelBackLinkProps) {
  return (
    <div className="px-2.5 pb-1 pt-3">
      <ShellLink href={href} className={panelRowClass(false)}>
        <ChevronLeft size={16} aria-hidden="true" className="shrink-0" />
        <span className="truncate">{label}</span>
      </ShellLink>
    </div>
  )
}

interface PanelEmptyProps {
  message: string
  action: { href: string; label: string }
}

/** Panel body when there is nothing to navigate yet, e.g. an org with no project. */
export function PanelEmpty({ message, action }: PanelEmptyProps) {
  return (
    <div className="flex flex-col gap-2.5 px-4 py-4.5 text-xs text-muted-foreground">
      <p>{message}</p>
      <ShellLink href={action.href} className="text-primary hover:underline">
        {action.label}
      </ShellLink>
    </div>
  )
}
