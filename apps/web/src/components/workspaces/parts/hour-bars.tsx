import type { RunHour } from '../../../types/dashboard/workspaces'
import { cn } from '../../../lib/utils'
import { runBars } from '../runs-by-hour'

interface HourBarsProps {
  /** The last 24 hours, oldest first. */
  hours: RunHour[]
  /** Names the strip for screen readers. */
  label: string
  /** The strip's height class, e.g. `h-[42px]`. */
  className?: string
}

/** A bar per hour, scaled to the busiest, with an hour's failures on top in red. */
export function HourBars({ hours, label, className }: HourBarsProps) {
  const bars = runBars(hours)
  return (
    <span role="img" aria-label={label} className={cn('flex items-end gap-[3px]', className)}>
      {bars.map((bar, i) => (
        <span key={i} className="flex h-full flex-1 flex-col justify-end">
          {bar.failedHeight > 0 && (
            <span
              data-part="failed"
              className="min-h-[3px] rounded-t-[2px] bg-status-error"
              style={{ height: `${bar.failedHeight * 100}%` }}
            />
          )}
          {bar.height > bar.failedHeight && (
            <span
              data-part="ok"
              className={
                bar.failedHeight > 0
                  ? 'rounded-b-[2px] bg-primary/45'
                  : 'min-h-[3px] rounded-[2px] bg-primary/45'
              }
              style={{ height: `${(bar.height - bar.failedHeight) * 100}%` }}
            />
          )}
        </span>
      ))}
    </span>
  )
}
