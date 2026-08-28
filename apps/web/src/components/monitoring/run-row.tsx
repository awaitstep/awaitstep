import type { RunSummary } from '../../lib/api-client'
import { duration, timeAgo } from '../../lib/time'
import { RunStatusBadge } from './run-status-badge'

interface RunRowProps {
  run: RunSummary
  workflowName?: string
  onClick: () => void
}

/**
 * A single run list row. Border-less by design — render inside a
 * `divide-y divide-border rounded-lg border border-border bg-card` container.
 */
export function RunRow({ run, workflowName, onClick }: RunRowProps) {
  return (
    <button
      onClick={onClick}
      className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/20"
    >
      <div className="flex min-w-0 items-center gap-3">
        <RunStatusBadge status={run.status} />
        <div className="flex min-w-0 flex-col">
          <span className="truncate text-sm text-foreground/80">
            {workflowName ?? run.workflowId.slice(0, 8)}
          </span>
          <span className="truncate font-mono text-2xs text-muted-foreground/50">
            {run.instanceId}
          </span>
        </div>
      </div>
      <div className="flex shrink-0 flex-col items-end font-mono text-2xs tabular-nums text-muted-foreground">
        <span>{timeAgo(run.createdAt)}</span>
        <span className="text-muted-foreground/50">
          {duration(run.createdAt, run.updatedAt, run.status)}
        </span>
      </div>
    </button>
  )
}
