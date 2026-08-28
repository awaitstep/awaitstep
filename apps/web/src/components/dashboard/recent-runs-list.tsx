import { Link } from '@tanstack/react-router'
import { Activity } from 'lucide-react'
import { Button } from '../ui/button'
import { useWorkflowsStore } from '../../stores/workflows-store'
import { useRunsStore } from '../../stores/runs-store'
import { useSheetStore } from '../../stores/sheet-store'
import { RunStatusBadge } from '../monitoring/run-status-badge'
import { RunDetailSheet } from '../monitoring/run-detail-sheet'
import { EmptyState } from '../ui/empty-state'
import { timeAgo, duration } from '../../lib/time'

export function RecentRunsList() {
  const runs = useRunsStore((s) => s.runs)
  const workflows = useWorkflowsStore((s) => s.workflows)
  const { openRunSheet } = useSheetStore()

  const workflowMap = new Map(workflows.map((w) => [w.id, w]))

  return (
    <section className="mt-8">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium">Recent Runs</h2>
        {runs.length > 0 && (
          <Link to="/runs">
            <Button variant="ghost" size="sm" className="text-xs">
              View all
            </Button>
          </Link>
        )}
      </div>
      {runs.length === 0 ? (
        <div className="mt-4">
          <EmptyState
            icon={Activity}
            title="No runs yet"
            description="Runs will appear here once you trigger a deployed workflow."
          />
        </div>
      ) : (
        <div className="mt-4 divide-y divide-border overflow-hidden rounded-lg border border-border bg-card">
          {runs.slice(0, 5).map((run) => {
            const wf = workflowMap.get(run.workflowId)
            return (
              <button
                key={run.id}
                onClick={() =>
                  openRunSheet({
                    runId: run.id,
                    workflowId: run.workflowId,
                    workflowName: wf?.name,
                  })
                }
                className="flex w-full items-center justify-between px-4 py-3 text-left transition-colors hover:bg-muted/20"
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
                <div className="flex items-center gap-4 text-2xs text-muted-foreground">
                  <span className="font-mono tabular-nums">
                    {duration(run.createdAt, run.updatedAt, run.status)}
                  </span>
                  <span className="font-mono tabular-nums">{timeAgo(run.createdAt)}</span>
                </div>
              </button>
            )
          })}
        </div>
      )}
      <RunDetailSheet />
    </section>
  )
}
