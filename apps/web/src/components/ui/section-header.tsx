import type { ReactNode } from 'react'
import { hasContent } from './has-content'
import { cn } from '../../lib/utils'

interface SectionHeaderProps {
  title: string
  /** Id for the heading, so a wrapping section can name itself with `aria-labelledby`. */
  id?: string
  /** One line beside the title, e.g. "From other workspaces in Project 101". */
  caption?: ReactNode
  /** A button or link at the right end. */
  action?: ReactNode
  /** Heading level; sections inside a section use `h3`. */
  as?: 'h2' | 'h3'
  direction?: 'row' | 'column'
}

/** Title row above a list, table or card group within a page. */
export function SectionHeader({
  title,
  id,
  caption,
  action,
  as: Heading = 'h2',
  direction = 'row',
}: SectionHeaderProps) {
  return (
    <div
      className={cn(
        'flex flex-wrap items-baseline gap-x-2.5 gap-y-1',
        direction === 'column' && 'flex-col gap-y-0',
      )}
    >
      <Heading id={id} className="text-base font-semibold text-foreground">
        {title}
      </Heading>
      {hasContent(caption) && <span className="text-xs text-muted-foreground">{caption}</span>}
      {hasContent(action) && <div className="ml-auto self-center">{action}</div>}
    </div>
  )
}
