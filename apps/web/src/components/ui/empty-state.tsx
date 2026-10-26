import { isValidElement, type ReactElement, type ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import { cn } from '../../lib/utils'
import { hasContent } from './has-content'

type EmptyStateSize = 'sm' | 'lg'
type EmptyStateTone = 'plain' | 'welcome'

interface EmptyStateProps {
  /** A lucide icon drawn in the muted tile, or a ready-made illustration such as fanned tiles. */
  icon: LucideIcon | ReactElement
  title: string
  description: string
  action?: ReactNode
  /** Several actions in a wrapping row, e.g. New workflow · New function · Import. */
  actions?: ReactNode
  /** `lg` is the page-level hero on an empty workspace. */
  size?: EmptyStateSize
  /** `welcome` swaps the dashed box for the green-tinted card new scopes use. */
  tone?: EmptyStateTone
  /** The hero is the page's `h1`; inside a section it stays `h3`. */
  headingLevel?: 1 | 2 | 3
}

const BOX_CLASS: Record<EmptyStateTone, Record<EmptyStateSize, string>> = {
  plain: {
    sm: 'rounded-lg border border-dashed border-border px-6 py-12',
    lg: 'rounded-2xl border border-dashed border-border px-8 py-12',
  },
  welcome: {
    sm: 'rounded-lg border border-status-success/20 bg-tone-ok/40 px-6 py-12',
    lg: 'rounded-2xl border border-status-success/20 bg-tone-ok/40 px-8 py-12',
  },
}

const TITLE_CLASS: Record<EmptyStateSize, string> = {
  sm: 'mt-4 text-sm font-medium text-foreground',
  lg: 'mt-5 text-2xl font-semibold text-foreground',
}

const DESCRIPTION_CLASS: Record<EmptyStateSize, string> = {
  sm: 'mt-1 max-w-xs text-xs leading-relaxed text-muted-foreground',
  lg: 'mt-2 max-w-[460px] text-sm leading-relaxed text-muted-foreground',
}

function EmptyIcon({ icon }: { icon: EmptyStateProps['icon'] }) {
  if (isValidElement(icon)) return icon
  const Icon = icon
  return (
    <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-muted/60">
      <Icon className="h-6 w-6 text-muted-foreground/60" />
    </div>
  )
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  actions,
  size = 'sm',
  tone = 'plain',
  headingLevel = 3,
}: EmptyStateProps) {
  const Heading = `h${headingLevel}` as const
  return (
    <div
      className={cn('flex flex-col items-center justify-center text-center', BOX_CLASS[tone][size])}
    >
      <EmptyIcon icon={icon} />
      <Heading className={TITLE_CLASS[size]}>{title}</Heading>
      <p className={DESCRIPTION_CLASS[size]}>{description}</p>
      {action && <div className="mt-4">{action}</div>}
      {hasContent(actions) && (
        <div className="mt-5 flex flex-wrap justify-center gap-2.5">{actions}</div>
      )}
    </div>
  )
}
