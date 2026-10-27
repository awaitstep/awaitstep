import type { ReactNode } from 'react'
import { cn } from '../../lib/utils'
import { hasContent } from '../ui/has-content'

interface PageIntroProps {
  title: string
  description?: ReactNode
  /** Right-hand content, such as stat tiles; wraps below the title on narrow screens. */
  aside?: ReactNode
  /** Beside the title, e.g. a phone's "New" button (the top bar holds it on wider screens). */
  action?: ReactNode
}

/** The page's h1 and one-line description, at the top of `PageBody`. */
export function PageIntro({ title, description, aside, action }: PageIntroProps) {
  return (
    <div className="flex flex-wrap items-end gap-5">
      <div className="flex min-w-[260px] flex-1 flex-col gap-1.5">
        {hasContent(action) ? (
          <div className="flex items-center justify-between gap-3">
            <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
            {action}
          </div>
        ) : (
          <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        )}
        {hasContent(description) && <p className="text-sm text-muted-foreground">{description}</p>}
      </div>
      {hasContent(aside) && <div className="flex flex-wrap gap-2.5">{aside}</div>}
    </div>
  )
}

interface PageBodyProps {
  /** Spans the whole main column above the capped content: a title row with stat tiles. */
  header?: ReactNode
  children: ReactNode
}

const PAGE_PADDING = 'px-6 md:px-8'

/**
 * The padded column under the top bar, on every dashboard page. It stops at
 * `--page-max-width` (styles.css, `page-width`), left-aligned, as the boards do;
 * only `header` runs the full width.
 */
export function PageBody({ header, children }: PageBodyProps) {
  if (!hasContent(header)) {
    return <div className={cn('page-width flex flex-col gap-8 py-8', PAGE_PADDING)}>{children}</div>
  }
  return (
    <div className="flex flex-col">
      <div className={cn('pt-8', PAGE_PADDING)}>{header}</div>
      <div className={cn('page-width flex flex-col gap-8 py-8', PAGE_PADDING)}>{children}</div>
    </div>
  )
}
