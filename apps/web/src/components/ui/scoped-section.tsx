import { useId, type ReactNode } from 'react'
import { Lock } from 'lucide-react'
import { cn } from '../../lib/utils'
import { Badge } from './badge'
import { hasContent } from './has-content'
import { ShellLink } from './shell-link'
import { WorkspaceDot } from './workspace-dot'
import type { WorkspaceColour } from './workspace-colour'

interface ScopedSectionProps {
  /**
   * `own`: set at this scope and editable here. `inherited`: comes from a
   * parent scope, drawn dashed, and changed only there.
   */
  kind: 'own' | 'inherited'
  /** "Only in Sales", "From Project 101". Also names the section. */
  scopeLabel: string
  /** The workspace's colour, shown in an `own` label. */
  colour?: WorkspaceColour
  /** "Can open Sales and nothing else in Project 101". */
  hint?: ReactNode
  /** Where an inherited list is managed: "Manage in the project". */
  manage?: { label: string; href: string }
  /** A `ListCard` or `DataTable` with `framed={false}`. */
  children: ReactNode
}

/**
 * Half of an access list: what only this scope has, or what it gets from its
 * parent. The two sit one above the other so the source of each row is plain.
 */
export function ScopedSection({
  kind,
  scopeLabel,
  colour,
  hint,
  manage,
  children,
}: ScopedSectionProps) {
  const labelId = useId()
  const own = kind === 'own'
  return (
    <section
      aria-labelledby={labelId}
      className={cn(
        'overflow-hidden rounded-2xl border',
        own ? 'border-border bg-card' : 'border-dashed border-inherited-border',
      )}
    >
      <div className="flex flex-wrap items-center gap-2.5 border-b border-border px-5 py-4">
        <Badge
          id={labelId}
          variant={own ? 'success' : 'default'}
          className="gap-1.5 px-2.5 font-normal"
        >
          {own ? (
            colour && <WorkspaceDot colour={colour} />
          ) : (
            <Lock className="size-3" aria-hidden="true" />
          )}
          {scopeLabel}
        </Badge>
        {hasContent(hint) && <span className="flex-1 text-xs text-muted-foreground">{hint}</span>}
        {manage && (
          <ShellLink
            href={manage.href}
            className="ml-auto text-xs font-medium text-primary hover:underline"
          >
            {manage.label}
          </ShellLink>
        )}
      </div>
      {children}
    </section>
  )
}

/** Trailing cell of an inherited row, in place of its actions. */
export function InheritedMark() {
  return (
    <span className="inline-flex items-center gap-1.5 text-2xs text-muted-foreground">
      <Lock className="size-3" aria-hidden="true" />
      Inherited
    </span>
  )
}
