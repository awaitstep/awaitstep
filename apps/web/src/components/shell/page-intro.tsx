import type { ReactNode } from 'react'
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
  children: ReactNode
}

/** The padded column under the top bar. It fills the main column on every page, as the boards do. */
export function PageBody({ children }: PageBodyProps) {
  return <div className="flex w-full flex-col gap-8 px-6 py-8 md:px-8">{children}</div>
}
