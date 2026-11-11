import type { ReactNode } from 'react'
import { Info, TriangleAlert, type LucideIcon } from 'lucide-react'
import { cva } from 'class-variance-authority'
import { hasContent } from './has-content'

const bannerVariants = cva(
  'flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border px-4 py-3 text-sm leading-relaxed',
  {
    variants: {
      tone: {
        info: 'border-status-info/30 bg-tone-info text-status-info',
        warn: 'border-status-warning/30 bg-tone-warn text-status-warning',
      },
    },
  },
)

type BannerTone = 'info' | 'warn'

const TONE_ICON: Record<BannerTone, LucideIcon> = {
  info: Info,
  warn: TriangleAlert,
}

interface BannerProps {
  tone: BannerTone
  /** Replaces the tone's default icon. */
  icon?: LucideIcon
  children: ReactNode
  /** Trailing control, e.g. a link to the status page. */
  action?: ReactNode
}

/**
 * A line of context that is there when the page renders: "Read-only in Sales…",
 * "Your deployed workflows keep running…". It is not a live region; use a
 * `role="status"` element for things that change after render.
 */
export function Banner({ tone, icon, children, action }: BannerProps) {
  const Icon = icon ?? TONE_ICON[tone]
  return (
    <div className={bannerVariants({ tone })}>
      <Icon className="size-4 shrink-0" aria-hidden="true" />
      <span className="min-w-0 flex-1">{children}</span>
      {hasContent(action) && action}
    </div>
  )
}
