import type { ReactNode } from 'react'
import { cn } from '../../lib/utils'

/**
 * Full-bleed chrome band: spans the entire content pane via container-query
 * units, with its content pinned to the pane edges (not the centered column).
 * Requires an `@container` ancestor (the app shell's content column).
 */
export function PageBand({
  className,
  innerClassName,
  children,
}: {
  className?: string
  innerClassName?: string
  children: ReactNode
}) {
  return (
    <div className={cn('mx-[calc((100%-100cqw)/2)] border-b border-border', className)}>
      <div className={cn('h-full w-full px-6 md:px-8', innerClassName)}>{children}</div>
    </div>
  )
}
