import { cn } from '../../lib/utils'

const STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  queued: { label: 'Queued', className: 'bg-status-info/10 text-status-info' },
  running: { label: 'Running', className: 'bg-status-info/10 text-status-info' },
  paused: { label: 'Paused', className: 'bg-status-warning/10 text-status-warning' },
  complete: { label: 'Complete', className: 'bg-status-success/10 text-status-success' },
  errored: { label: 'Errored', className: 'bg-status-error/10 text-status-error' },
  terminated: { label: 'Terminated', className: 'bg-status-error/10 text-status-error/80' },
  waiting: { label: 'Waiting', className: 'bg-status-info/10 text-status-info' },
  unknown: { label: 'Unknown', className: 'bg-muted/50 text-muted-foreground' },
}

interface RunStatusBadgeProps {
  status: string
  className?: string
}

export function RunStatusBadge({ status, className }: RunStatusBadgeProps) {
  const config = STATUS_CONFIG[status] ?? STATUS_CONFIG.unknown!
  return (
    <span
      className={cn(
        'inline-flex items-center rounded px-2 py-0.5 text-xs font-medium',
        config.className,
        className,
      )}
    >
      {(status === 'running' || status === 'queued') && (
        <span className="mr-1 h-1.5 w-1.5 animate-pulse rounded-full bg-current" />
      )}
      {config.label}
    </span>
  )
}
