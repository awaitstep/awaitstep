import type { ReactNode } from 'react'
import { ArrowRight, type LucideIcon } from 'lucide-react'
import { ShellLink } from '../../ui/shell-link'
import { Tile } from '../../ui/tile'

interface AvailableCardProps {
  href: string
  icon: LucideIcon
  tone: 'ok' | 'info'
  title: string
  /** "Applies here automatically". */
  subtitle: string
  /** The arrowed line at the foot, e.g. "See shared items". */
  cta: string
  children: ReactNode
}

/** A card under "Already available in Support" (`EmptyWorkspace`): what an empty workspace already has. */
export function AvailableCard({
  href,
  icon: Icon,
  tone,
  title,
  subtitle,
  cta,
  children,
}: AvailableCardProps) {
  return (
    <ShellLink
      href={href}
      className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-5.5 transition-colors hover:border-foreground/20"
    >
      <span className="flex items-center gap-3">
        <Tile tone={tone} size="sm">
          <Icon />
        </Tile>
        <span className="flex flex-1 flex-col gap-0.5">
          <span className="text-sm font-semibold text-foreground">{title}</span>
          <span className="text-2xs text-muted-foreground">{subtitle}</span>
        </span>
        <ArrowRight className="size-4 text-muted-foreground" aria-hidden="true" />
      </span>
      {children}
      <span className="text-xs font-medium text-status-success">{cta}</span>
    </ShellLink>
  )
}
