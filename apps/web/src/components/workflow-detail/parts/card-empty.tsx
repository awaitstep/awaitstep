import type { ReactNode } from 'react'
import { hasContent } from '../../ui/has-content'
import { Tile } from '../../ui/tile'
import { cn } from '../../../lib/utils'

interface CardEmptyProps {
  icon: ReactNode
  title: string
  body: string
  /** An action under it, e.g. Deploy. */
  action?: ReactNode
  className?: string
}

/** A card or tab with nothing in it yet (`WorkflowDraft`): an icon, what's missing, what to do. */
export function CardEmpty({ icon, title, body, action, className }: CardEmptyProps) {
  return (
    <div className={cn('flex flex-col items-center gap-2 px-5 py-10 text-center', className)}>
      <Tile tone="neutral">{icon}</Tile>
      <span className="text-sm font-semibold text-foreground">{title}</span>
      <span className="max-w-[44ch] text-sm leading-relaxed text-muted-foreground">{body}</span>
      {hasContent(action) && <span className="mt-2">{action}</span>}
    </div>
  )
}
