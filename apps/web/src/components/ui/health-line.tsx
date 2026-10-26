import { cn } from '../../lib/utils'
import { timeAgo } from '../../lib/time'

interface HealthLineProps {
  /** Items whose latest run failed. */
  failing: number
  lastRunAt: string | null
}

/** "1 failing · 5 minutes ago", "All passing · 3 hours ago" or "No runs yet", on project and workspace cards. */
export function HealthLine({ failing, lastRunAt }: HealthLineProps) {
  if (!lastRunAt) {
    return <span className="text-2xs text-muted-foreground">No runs yet</span>
  }
  const failed = failing > 0
  return (
    <span
      className={cn(
        'flex items-center gap-1.5 text-2xs',
        failed ? 'text-status-error' : 'text-muted-foreground',
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          'size-1.5 shrink-0 rounded-full',
          failed ? 'bg-status-error' : 'bg-status-success',
        )}
      />
      {failed ? `${failing} failing` : 'All passing'} · {timeAgo(lastRunAt)}
    </span>
  )
}
