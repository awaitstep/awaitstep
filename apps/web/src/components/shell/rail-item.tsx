import type { ComponentProps } from 'react'
import { Moon, Sun, type LucideIcon } from 'lucide-react'
import type { Theme } from '../../lib/theme'
import { cn } from '../../lib/utils'
import { Avatar } from '../ui/avatar'
import { ActiveBar } from './panel-item'
import { ShellLink } from '../ui/shell-link'

const railItemBase =
  'relative flex w-[60px] flex-col items-center gap-1 rounded-md py-2 text-center text-3xs font-medium transition-colors'

function railItemClass(active: boolean): string {
  return cn(
    railItemBase,
    active
      ? 'bg-sidebar-accent text-sidebar-foreground'
      : 'text-muted-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-foreground',
  )
}

/**
 * A marker on a rail icon. `description` completes the accessible name
 * ("Inbox, 3 unread notifications"), since the marker itself is visual only.
 * A count of zero or less shows no marker.
 */
export type RailBadge =
  { kind: 'dot'; description: string } | { kind: 'count'; value: number; description: string }

export interface RailItemProps {
  href: string
  icon: LucideIcon
  label: string
  /** Ignored for external items, which never stand for the current page. */
  active?: boolean
  badge?: RailBadge
  external?: boolean
}

function visibleBadge(badge: RailBadge | undefined): RailBadge | undefined {
  if (badge?.kind === 'count' && badge.value <= 0) return undefined
  return badge
}

function RailBadgeMark({ badge }: { badge: RailBadge }) {
  if (badge.kind === 'dot') {
    return (
      <span
        aria-hidden="true"
        className="absolute -right-[3px] -top-0.5 size-[7px] rounded-full bg-primary ring-2 ring-sidebar"
      />
    )
  }
  const text = badge.value > 99 ? '99+' : String(badge.value)
  return (
    <span
      aria-hidden="true"
      className="absolute -right-2.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-3xs font-semibold text-background ring-2 ring-sidebar"
    >
      {text}
    </span>
  )
}

/** A 60px rail tile: icon over a short label, with an optional dot or count. */
export function RailItem({
  href,
  icon: Icon,
  label,
  active = false,
  badge,
  external = false,
}: RailItemProps) {
  const shownBadge = visibleBadge(badge)
  const isActive = active && !external
  const ariaLabel = shownBadge ? `${label}, ${shownBadge.description}` : undefined
  const ariaCurrent = isActive ? 'page' : undefined
  const className = railItemClass(isActive)

  const content = (
    <>
      {isActive && <ActiveBar />}
      <span className="relative flex">
        <Icon size={18} aria-hidden="true" />
        {shownBadge && <RailBadgeMark badge={shownBadge} />}
      </span>
      <span>{label}</span>
    </>
  )

  if (external) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={ariaLabel}
        className={className}
      >
        {content}
      </a>
    )
  }

  return (
    <ShellLink href={href} aria-label={ariaLabel} aria-current={ariaCurrent} className={className}>
      {content}
    </ShellLink>
  )
}

interface ThemeButtonProps {
  theme: Theme
  onToggle: () => void
}

/** Rail button that offers the other theme: a sun "Light" in dark mode, a moon "Dark" in light. */
export function ThemeButton({ theme, onToggle }: ThemeButtonProps) {
  const toLight = theme === 'dark'
  const Icon = toLight ? Sun : Moon
  const ariaLabel = toLight ? 'Switch to light mode' : 'Switch to dark mode'
  const text = toLight ? 'Light' : 'Dark'
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label={ariaLabel}
      className={cn(railItemClass(false), 'cursor-pointer')}
    >
      <Icon size={18} aria-hidden="true" />
      <span>{text}</span>
    </button>
  )
}

interface RailOrgButtonProps extends ComponentProps<'button'> {
  name: string
  initial: string
}

/**
 * The org avatar at the top of the rail. Spreads extra props and the ref onto
 * the button so a menu can use it as its trigger.
 */
export function RailOrgButton({ name, initial, className, ...props }: RailOrgButtonProps) {
  return (
    <button
      type="button"
      aria-label={`${name} — switch organization`}
      className={cn(
        'mb-3 flex size-10 shrink-0 cursor-pointer items-center justify-center rounded-lg bg-primary text-sm font-semibold text-primary-foreground',
        className,
      )}
      {...props}
    >
      {initial}
    </button>
  )
}

interface RailAccountButtonProps extends ComponentProps<'button'> {
  user: { name?: string | null; email?: string | null; image?: string | null }
}

/** The account avatar at the bottom of the rail; a menu trigger like `RailOrgButton`. */
export function RailAccountButton({ user, className, ...props }: RailAccountButtonProps) {
  return (
    <button
      type="button"
      aria-label="Your account"
      className={cn('mt-2 shrink-0 cursor-pointer rounded-full', className)}
      {...props}
    >
      <Avatar
        name={user.name}
        email={user.email}
        src={user.image}
        className="font-semibold text-foreground"
      />
    </button>
  )
}
