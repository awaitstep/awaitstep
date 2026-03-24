import { Link } from '@tanstack/react-router'
import { RunStatusBadge } from '../monitoring/run-status-badge'
import { RunDetailSheet } from '../monitoring/run-detail-sheet'
import type { RunSummary } from '../../lib/api-client'
import { useSheetStore } from '../../stores/sheet-store'
import { timeAgo } from '../../lib/time'

interface RecentRunsProps {
  workflowId: string
  runs: RunSummary[]
}

export function RecentRuns({ workflowId, runs }: RecentRunsProps) {
  const openRunSheet = useSheetStore((s) => s.openRunSheet)

  return (
    <section>
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-foreground/70">Recent Runs</h2>
        {runs.length > 0 && (
          <Link
            to="/workflows/$workflowId/runs"
            params={{ workflowId }}
            className="text-[11px] text-muted-foreground/60 hover:text-muted-foreground"
          >
            View all
          </Link>
        )}
      </div>
      {runs.length > 0 ? (
        <div className="mt-3 rounded-md border border-border">
          {runs.slice(0, 8).map((run, i) => (
            <button
              key={run.id}
              onClick={() => openRunSheet({ runId: run.id, workflowId })}
              className={`flex w-full items-center justify-between px-3 py-2.5 text-left transition-colors hover:bg-muted/30 ${
                i < Math.min(runs.length, 8) - 1 ? 'border-b border-border' : ''
              }`}
            >
              <div className="flex items-center gap-3">
                <RunStatusBadge status={run.status} />
                <span className="font-mono text-xs text-muted-foreground">
                  {run.instanceId.slice(0, 12)}
                </span>
              </div>
              <span className="text-xs text-muted-foreground/60">{timeAgo(run.createdAt)}</span>
            </button>
          ))}
        </div>
      ) : (
        <div className="mt-3 rounded-md border border-border px-4 py-6 text-center text-xs text-muted-foreground">
          No runs yet. Deploy and trigger your workflow to see runs here.
        </div>
      )}
      <RunDetailSheet />
    </section>
  )
}
