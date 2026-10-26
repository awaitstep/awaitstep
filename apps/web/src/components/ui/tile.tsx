import type { ReactNode } from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '../../lib/utils'
import { ShellLink } from './shell-link'

const tileVariants = cva('flex shrink-0 items-center justify-center font-semibold', {
  variants: {
    tone: {
      ok: 'bg-tone-ok text-status-success',
      fail: 'bg-tone-fail text-status-error',
      warn: 'bg-tone-warn text-status-warning',
      info: 'bg-tone-info text-status-info',
      neutral: 'bg-muted text-muted-foreground',
    },
    size: {
      sm: 'size-8 rounded-lg text-2xs [&_svg]:size-4',
      md: 'size-10 rounded-xl text-xs [&_svg]:size-[18px]',
      lg: 'size-11 rounded-xl text-base [&_svg]:size-5',
    },
  },
  defaultVariants: { tone: 'neutral', size: 'md' },
})

interface TileProps extends VariantProps<typeof tileVariants> {
  /** An icon or initials. Decorative: the row beside it carries the meaning. */
  children: ReactNode
  className?: string
}

/** The toned square before a row or card: an icon or initials on a tint. */
export function Tile({ tone, size, className, children }: TileProps) {
  return (
    <span aria-hidden="true" className={cn(tileVariants({ tone, size }), className)}>
      {children}
    </span>
  )
}

interface StatTileProps {
  value: ReactNode
  label: string
  /** `danger` tints the tile red, for counts that need attention. */
  tone?: 'danger'
  /** Makes the whole tile a link, e.g. "1 Failing now" → the failing list. */
  href?: string
}

/** A number over its label, as in the org home's header. */
export function StatTile({ value, label, tone, href }: StatTileProps) {
  const danger = tone === 'danger'
  const className = cn(
    'flex min-w-[110px] flex-col gap-0.5 rounded-xl border px-4 py-2.5',
    danger ? 'border-destructive/40 bg-tone-fail' : 'border-border bg-card',
    href && 'transition-colors hover:border-foreground/20',
  )
  const content = (
    <>
      <span className={cn('text-lg font-semibold', danger && 'text-status-error')}>{value}</span>
      {/* Keeps "1 Failing now" apart in the accessible name; invisible in a flex column. */}{' '}
      <span className={cn('text-2xs', danger ? 'text-foreground/70' : 'text-muted-foreground')}>
        {label}
      </span>
    </>
  )
  return href ? (
    <ShellLink href={href} className={className}>
      {content}
    </ShellLink>
  ) : (
    <span className={className}>{content}</span>
  )
}
