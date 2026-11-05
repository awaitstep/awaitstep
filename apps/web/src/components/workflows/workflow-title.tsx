import type { ReactNode } from 'react'
import { cn } from '../../lib/utils'
import { RouterShellLink } from '../navigation/router-shell-link'
import { FUNCTION_BADGE_TITLE } from './function-copy'

interface WorkflowTitleProps {
  name: string
  /** `'workflow'` (default) or `'script'`; scripts get the "Function" pill. */
  kind?: 'workflow' | 'script'
  /** Shown as a `vN` pill when known and greater than zero. */
  version?: number
  /** Extra pills/indicators rendered after the version. */
  children?: ReactNode
  /** Where the name leads (the workflow's Overview); plain text without one. */
  href?: string
}

const NAME_CLASS =
  'max-w-[120px] truncate text-sm font-semibold text-foreground sm:max-w-[200px] md:max-w-[260px] lg:max-w-none'

/** The name · kind · version cluster every workflow editing header starts with. */
export function WorkflowTitle({ name, kind, version, children, href }: WorkflowTitleProps) {
  return (
    <div className="flex min-w-0 items-center gap-1.5 px-1 sm:gap-2">
      {href ? (
        <RouterShellLink
          href={href}
          title="Open the overview"
          className={cn(NAME_CLASS, 'hover:underline')}
        >
          {name}
        </RouterShellLink>
      ) : (
        <span className={NAME_CLASS}>{name}</span>
      )}
      {kind === 'script' && (
        <span
          className="hidden shrink-0 items-center rounded border border-border bg-muted/40 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground sm:inline-flex"
          title={FUNCTION_BADGE_TITLE}
        >
          Function
        </span>
      )}
      {version !== undefined && version > 0 && (
        <span className="shrink-0 rounded bg-muted/60 px-1.5 py-0.5 text-xs font-medium text-muted-foreground/60">
          v{version}
        </span>
      )}
      {children}
    </div>
  )
}
