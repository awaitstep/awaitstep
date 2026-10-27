import type { ReactNode } from 'react'
import { ArrowRight, type LucideIcon } from 'lucide-react'
import { ShellLink } from '../../ui/shell-link'
import { Tile } from '../../ui/tile'

interface ProjectPoolCardProps {
  href: string
  icon: LucideIcon
  tone: 'ok' | 'info' | 'warn'
  title: string
  /** The big number. */
  count: number
  /** Beside the number: "admins open every workspace". */
  caption: string
  /** Avatars or chips under the number. */
  children?: ReactNode
}

/** A card under "Project pool" (`ProjectOverview`): what every workspace inherits. One link. */
export function ProjectPoolCard({
  href,
  icon: Icon,
  tone,
  title,
  count,
  caption,
  children,
}: ProjectPoolCardProps) {
  return (
    <ShellLink
      href={href}
      className="flex flex-col gap-3.5 rounded-2xl border border-border bg-card p-5 transition-colors hover:border-foreground/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <span className="flex items-center gap-3">
        <Tile tone={tone} size="sm">
          <Icon />
        </Tile>
        <span className="flex-1 text-sm font-semibold text-foreground">{title}</span>
        <ArrowRight className="size-4 text-muted-foreground" aria-hidden="true" />
      </span>
      <span className="flex items-baseline gap-2">
        <span className="text-2xl font-semibold text-foreground">{count}</span>
        <span className="text-xs text-muted-foreground">{caption}</span>
      </span>
      {children}
    </ShellLink>
  )
}
