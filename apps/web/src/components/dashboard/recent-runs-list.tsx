import { Link } from '@tanstack/react-router'
import { Button } from '../ui/button'
import { useWorkflowsStore } from '../../stores/workflows-store'
import { useRunsStore } from '../../stores/runs-store'
import { useSheetStore } from '../../stores/sheet-store'
import { RunStatusBadge } from '../monitoring/run-status-badge'
import { RunDetailSheet } from '../monitoring/run-detail-sheet'
import { timeAgo, duration } from '../../lib/time'

export function RecentRunsList() {
  const runs = useRunsStore((s) => s.runs)
  const workflows = useWorkflowsStore((s) => s.workflows)
  const openRunSheet = useSheetStore((s) => s.openRunSheet)

  const workflowMap = new Map(workflows.map((w) => [w.id, w]))

  if (runs.length === 0) return null

  return (
    <section className="mt-10">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Recent Runs</h2>
        <Link to="/runs">
          <Button variant="ghost" size="sm" className="text-xs">
            View all
          </Button>
        </Link>
      </div>
      <div className="mt-4 space-y-2">
        {runs.slice(0, 8).map((run) => {
          const wf = workflowMap.get(run.workflowId)
          return (
            <button
              key={run.id}
              onClick={() =>
                openRunSheet({ runId: run.id, workflowId: run.workflowId, workflowName: wf?.name })
              }
              className="flex w-full items-center justify-between rounded-lg border border-border bg-card px-4 py-3 text-left transition-colors hover:border-border/80 hover:bg-muted/20"
            >
              <div className="flex items-center gap-3">
                <RunStatusBadge status={run.status} />
                <div className="min-w-0">
                  <span className="text-sm text-foreground/70">
                    {wf?.name ?? run.workflowId.slice(0, 8)}
                  </span>
                  <span className="ml-2 font-mono text-xs text-muted-foreground/50">
                    {run.instanceId.slice(0, 12)}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-4 text-xs text-muted-foreground">
                <span className="font-mono">
                  {duration(run.createdAt, run.updatedAt, run.status)}
                </span>
                <span>{timeAgo(run.createdAt)}</span>
              </div>
            </button>
          )
        })}
      </div>
      <RunDetailSheet />
    </section>
  )
}
