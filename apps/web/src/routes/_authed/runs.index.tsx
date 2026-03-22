import { createFileRoute } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { Loader2, Play } from 'lucide-react'
import { Button } from '../../components/ui/button'
import { api } from '../../lib/api-client'
import { RunStatusBadge } from '../../components/monitoring/run-status-badge'
import { RunDetailSheet } from '../../components/monitoring/run-detail-sheet'
import { TriggerDialog } from '../../components/canvas/trigger-dialog'
import { useOrgReady } from '../../stores/org-store'
import { useSheetStore } from '../../stores/sheet-store'
import { useActiveRunSync } from '../../hooks/use-active-run-sync'
import { timeAgo, duration } from '../../lib/time'

export const Route = createFileRoute('/_authed/runs/')({
  component: RunsIndexPage,
})

function RunsIndexPage() {
  const ready = useOrgReady()
  const [triggerWorkflowId, setTriggerWorkflowId] = useState<string | null>(null)
  const openRunSheet = useSheetStore((s) => s.openRunSheet)

  const { data: runs, isLoading } = useQuery({
    queryKey: ['all-runs'],
    queryFn: () => api.listAllRuns(),
    enabled: ready,
    retry: false,
  })

  useActiveRunSync(runs, ['all-runs'])

  const { data: workflows } = useQuery({
    queryKey: ['workflows'],
    queryFn: () => api.listWorkflows(),
    enabled: ready,
    retry: false,
  })

  const { data: allDeployments } = useQuery({
    queryKey: ['all-deployments'],
    queryFn: () => api.listAllDeployments(),
    enabled: ready,
    retry: false,
  })

  const workflowMap = new Map(workflows?.map((w) => [w.id, w]) ?? [])

  // Workflows that have a successful deployment
  const deployedWorkflowIds = new Set<string>()
  if (allDeployments) {
    for (const d of allDeployments) {
      if (d.status === 'success') deployedWorkflowIds.add(d.workflowId)
    }
  }
  const deployedWorkflows = workflows?.filter((w) => deployedWorkflowIds.has(w.id)) ?? []

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
      {isLoading && (
        <div className="mt-12 flex justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground/60" />
        </div>
      )}

      {runs && runs.length === 0 && (
        <div className="mt-6 rounded-md border border-border px-4 py-8 text-center text-sm text-muted-foreground">
          No runs yet. Trigger a workflow to see execution history here.
        </div>
      )}

      {runs && runs.length > 0 && (
        <div className="mt-6 space-y-2">
          {runs.map((run) => {
            const wf = workflowMap.get(run.workflowId)
            return (
              <button
                key={run.id}
                onClick={() => openRunSheet({ runId: run.id, workflowId: run.workflowId, workflowName: wf?.name })}
                className="flex w-full items-center justify-between rounded-lg border border-border bg-card px-4 py-3 text-left transition-colors hover:border-border/80 hover:bg-muted/20"
              >
                <div className="flex items-center gap-3">
                  <RunStatusBadge status={run.status} />
                  <div className="min-w-0">
                    <span className="text-sm text-foreground/70">
                      {wf?.name ?? <span className="font-mono">{run.workflowId.slice(0, 8)}</span>}
                    </span>
                    <span className="ml-2 font-mono text-xs text-muted-foreground/50">
                      {run.instanceId}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-4 text-xs text-muted-foreground">
                  <span className="font-mono">{duration(run.createdAt, run.updatedAt, run.status)}</span>
                  <span>{timeAgo(run.createdAt)}</span>
                </div>
              </button>
            )
          })}
        </div>
      )}

      </div>

      <RunDetailSheet />

      <TriggerDialog
        open={!!triggerWorkflowId}
        onClose={() => setTriggerWorkflowId(null)}
        workflowId={triggerWorkflowId ?? ''}
      />
    </div>
  )
}
