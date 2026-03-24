import { createFileRoute } from '@tanstack/react-router'
import { useState } from 'react'
import { Play } from 'lucide-react'
import { Button } from '../../components/ui/button'
import { RunStatusBadge } from '../../components/monitoring/run-status-badge'
import { RunDetailSheet } from '../../components/monitoring/run-detail-sheet'
import { TriggerDialog } from '../../components/canvas/trigger-dialog'
import { useWorkflowsStore } from '../../stores/workflows-store'
import { useRunsStore } from '../../stores/runs-store'
import { useSheetStore } from '../../stores/sheet-store'
import { useShallow } from 'zustand/react/shallow'
import { timeAgo, duration } from '../../lib/time'
import { RequireProject } from '../../wrappers/require-project'
import { LoadingView } from '../../components/ui/loading-view'
import { ListSkeleton } from '../../components/ui/skeletons'

export const Route = createFileRoute('/_authed/runs/')({
  component: RunsIndexPage,
})

function RunsIndexPage() {
  return (
    <RequireProject>
      <RunsIndexContent />
    </RequireProject>
  )
}

function RunsIndexContent() {
  const [triggerWorkflowId, setTriggerWorkflowId] = useState<string | null>(null)
  const { openRunSheet } = useSheetStore()

  const { runs, runsLoading } = useRunsStore(
    useShallow((s) => ({
      runs: s.runs,
      runsLoading: s.fetchState === 'idle' || s.fetchState === 'loading',
    })),
  )
  const workflows = useWorkflowsStore((s) => s.workflows)

  const workflowMap = new Map(workflows.map((w) => [w.id, w]))
  const deployedWorkflows = workflows.filter((w) => w.deployStatus === 'success')

  return (
    <div>
      <div className="flex items-center justify-between border-b border-border pb-4">
        <h1 className="text-lg font-semibold">Runs</h1>
        {deployedWorkflows.length > 0 && (
          <Button
            size="sm"
            className="gap-1.5"
            onClick={() => setTriggerWorkflowId(deployedWorkflows[0].id)}
          >
            <Play className="h-4 w-4" />
            Trigger Run
          </Button>
        )}
      </div>

      <div>
        <LoadingView isLoading={runsLoading} LoadingPlaceholder={ListSkeleton}>
          {runs.length === 0 ? (
            <div className="mt-6 rounded-md border border-border px-4 py-8 text-center text-sm text-muted-foreground">
              No runs yet. Trigger a workflow to see execution history here.
            </div>
          ) : (
            <div className="mt-6 space-y-2">
              {runs.map((run) => {
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
                    className="flex w-full items-center justify-between rounded-lg border border-border bg-card px-4 py-3 text-left transition-colors hover:border-border/80 hover:bg-muted/20"
                  >
                    <div className="flex items-center gap-3">
                      <RunStatusBadge status={run.status} />
                      <div className="min-w-0">
                        <span className="text-sm text-foreground/70">
                          {wf?.name ?? (
                            <span className="font-mono">{run.workflowId.slice(0, 8)}</span>
                          )}
                        </span>
                        <span className="ml-2 font-mono text-xs text-muted-foreground/50">
                          {run.instanceId}
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
          )}
        </LoadingView>
      </div>

      <RunDetailSheet />

      {triggerWorkflowId && (
        <TriggerDialog onClose={() => setTriggerWorkflowId(null)} workflowId={triggerWorkflowId} />
      )}
    </div>
  )
}
