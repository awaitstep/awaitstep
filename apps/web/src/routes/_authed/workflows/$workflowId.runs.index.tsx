import { createFileRoute, useParams } from '@tanstack/react-router'
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Loader2, Play } from 'lucide-react'
import { Button } from '../../../components/ui/button'
import { RunStatusBadge } from '../../../components/monitoring/run-status-badge'
import { RunDetailSheet } from '../../../components/monitoring/run-detail-sheet'
import { api } from '../../../lib/api-client'
import { TriggerDialog } from '../../../components/canvas/trigger-dialog'
import { useActiveRunSync } from '../../../hooks/use-active-run-sync'
import { timeAgo, duration } from '../../../lib/time'

export const Route = createFileRoute('/_authed/workflows/$workflowId/runs/')({
  component: RunsListPage,
})

function RunsListPage() {
  const { workflowId } = useParams({ from: '/_authed/workflows/$workflowId/runs/' })
  const [triggerOpen, setTriggerOpen] = useState(false)
  const [selectedRun, setSelectedRun] = useState<{ id: string; workflowId: string } | null>(null)

  const { data: runs, isLoading } = useQuery({
    queryKey: ['workflow-runs', workflowId],
    queryFn: () => fetch(`/api/workflows/${workflowId}/runs`, { credentials: 'include' }).then((r) => r.json()),
  })

  useActiveRunSync(
    runs?.map((r: { id: string; workflowId: string; status: string }) => ({ id: r.id, workflowId: r.workflowId ?? workflowId, status: r.status })),
    ['workflow-runs', workflowId],
  )

  const { data: deployments } = useQuery({
    queryKey: ['deployments', workflowId],
    queryFn: () => api.listDeployments(workflowId),
    retry: false,
  })

  const hasActiveDeployment = deployments?.some((d: { status: string }) => d.status === 'success') ?? false

  return (
    <div>
      {hasActiveDeployment && (
        <div className="mb-4 flex justify-end">
          <Button size="sm" className="gap-1.5" onClick={() => setTriggerOpen(true)}>
            <Play className="h-4 w-4" />
            Trigger Run
          </Button>
        </div>
      )}

      {isLoading && (
        <div className="mt-12 flex justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground/60" />
        </div>
      )}

      {runs && runs.length === 0 && (
        <div className="mt-6 rounded-md border border-border px-4 py-8 text-center text-sm text-muted-foreground">
          No runs yet. Trigger the workflow to see execution history.
        </div>
      )}

      {runs && runs.length > 0 && (
        <div className="space-y-2">
          {runs.map((run: { id: string; instanceId: string; status: string; createdAt: string; updatedAt: string }) => (
            <button
              key={run.id}
              onClick={() => setSelectedRun({ id: run.id, workflowId })}
              className="flex w-full items-center justify-between rounded-lg border border-border bg-card px-4 py-3 text-left transition-colors hover:border-border/80 hover:bg-muted/20"
            >
              <div className="flex items-center gap-3">
                <RunStatusBadge status={run.status} />
                <span className="font-mono text-xs text-foreground/60">
                  {run.instanceId}
                </span>
              </div>
              <div className="flex items-center gap-4 text-xs text-muted-foreground">
                <span className="font-mono">{duration(run.createdAt, run.updatedAt, run.status)}</span>
                <span>{timeAgo(run.createdAt)}</span>
              </div>
            </button>
          ))}
        </div>
      )}

      <RunDetailSheet
        run={selectedRun}
        onClose={() => setSelectedRun(null)}
      />

      <TriggerDialog
        open={triggerOpen}
        onClose={() => setTriggerOpen(false)}
        workflowId={workflowId}
      />
    </div>
  )
}
