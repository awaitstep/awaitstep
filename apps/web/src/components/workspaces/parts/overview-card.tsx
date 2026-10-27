import type { ReactNode } from 'react'
import { hasContent } from '../../ui/has-content'

interface OverviewCardProps {
  title: string
  /** "1 failing", "4 can open Sales". */
  caption?: ReactNode
  /** A link at the right, e.g. "All runs →". */
  action?: ReactNode
  children: ReactNode
}

/** A titled card on the workspace Overview (`WsOverview`): Needs attention, Recent runs, People, Shared. */
export function OverviewCard({ title, caption, action, children }: OverviewCardProps) {
  return (
    <section className="flex flex-col overflow-hidden rounded-2xl border border-border bg-card">
      <div className="flex flex-wrap items-center gap-2.5 border-b border-border px-5 py-4">
        <h2 className="text-sm font-semibold text-foreground">{title}</h2>
        <span className="flex-1 text-xs text-muted-foreground">{caption}</span>
        {hasContent(action) && action}
      </div>
      {children}
    </section>
  )
}
