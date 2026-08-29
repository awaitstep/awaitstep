import { Link } from '@tanstack/react-router'
import { Activity } from 'lucide-react'
import { Button } from '../ui/button'
import { useWorkflowsStore } from '../../stores/workflows-store'
import { useRunsStore } from '../../stores/runs-store'
import { useSheetStore } from '../../stores/sheet-store'
import { RunRow } from '../monitoring/run-row'
import { RunDetailSheet } from '../monitoring/run-detail-sheet'
import { EmptyState } from '../ui/empty-state'

export function RecentRunsList() {
  const runs = useRunsStore((s) => s.runs)
  const workflows = useWorkflowsStore((s) => s.workflows)
  const { openRunSheet } = useSheetStore()

  const workflowMap = new Map(workflows.map((w) => [w.id, w]))

  return (
    <section className="mt-8 xl:mt-5">
      <div className="flex h-8 items-center justify-between">
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
          {runs.slice(0, 8).map((run) => {
            const wf = workflowMap.get(run.workflowId)
            return (
              <RunRow
                key={run.id}
                run={run}
                workflowName={wf?.name}
                onClick={() =>
                  openRunSheet({
                    runId: run.id,
                    workflowId: run.workflowId,
                    workflowName: wf?.name,
                  })
                }
              />
            )
          })}
        </div>
      )}
      <RunDetailSheet />
    </section>
  )
}
