import type { ReactNode } from 'react'
import { cn } from '../../lib/utils'
import { hasContent } from './has-content'

interface PageIntroProps {
  title: string
  description?: ReactNode
  /** Right-hand content, such as stat tiles; wraps below the title on narrow screens. */
  aside?: ReactNode
}

/** The page's h1 and one-line description, at the top of `PageBody`. */
export function PageIntro({ title, description, aside }: PageIntroProps) {
  return (
    <div className="flex flex-wrap items-end gap-5">
      <div className="flex min-w-[260px] flex-1 flex-col gap-1.5">
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {hasContent(description) && <p className="text-sm text-muted-foreground">{description}</p>}
      </div>
      {hasContent(aside) && <div className="flex flex-wrap gap-2.5">{aside}</div>}
    </div>
  )
}

const PAGE_BODY_WIDTH = {
  wide: 'max-w-screen-xl',
  narrow: 'max-w-3xl',
} as const

interface PageBodyProps {
  /** `wide` for lists and dashboards; `narrow` for settings forms. */
  width?: keyof typeof PAGE_BODY_WIDTH
  children: ReactNode
}

/** The padded, width-capped column under the top bar. */
export function PageBody({ width = 'wide', children }: PageBodyProps) {
  return (
    <div className={cn('flex w-full flex-col gap-8 px-6 py-8 md:px-8', PAGE_BODY_WIDTH[width])}>
      {children}
    </div>
  )
}
