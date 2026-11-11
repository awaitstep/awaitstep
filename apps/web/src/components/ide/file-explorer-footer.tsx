import type { ProjectUsage } from '../../lib/ide/project'
import { usageStatus } from '../../lib/ide/project'
import { cn } from '../../lib/utils'

export function LimitsFooter({ usage }: { usage: ProjectUsage }) {
  const { level, ratio, label } = usageStatus(usage)
  return (
    <div
      className={cn(
        'flex shrink-0 items-center gap-2 border-t border-border px-3 py-1.5 text-2xs',
        level === 'ok' && 'text-muted-foreground',
        level === 'warn' && 'text-status-warning',
        level === 'full' && 'text-status-error',
      )}
    >
      <span>{label}</span>
      <div
        role="meter"
        aria-label="Project size"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(ratio * 100)}
        className="h-1 min-w-4 flex-1 overflow-hidden rounded-full bg-muted"
      >
        <div
          className={cn(
            'h-full',
            level === 'ok' && 'bg-primary',
            level === 'warn' && 'bg-status-warning',
            level === 'full' && 'bg-status-error',
          )}
          style={{ width: `${Math.round(ratio * 100)}%` }}
        />
      </div>
    </div>
  )
}
