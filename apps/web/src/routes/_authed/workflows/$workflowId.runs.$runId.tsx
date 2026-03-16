import { useEffect } from 'react'
import { createFileRoute, Link, useParams } from '@tanstack/react-router'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Loader2 } from 'lucide-react'
import type { WorkflowNode, Edge } from '@awaitstep/ir'
import { Button } from '../../../components/ui/button'
import { RunDetailPanel } from '../../../components/monitoring/run-detail-panel'
import { RunCanvasPreview } from '../../../components/monitoring/run-canvas-preview'
import { usePolling } from '../../../lib/use-polling'
import { useRunOverlayStore } from '../../../stores/run-overlay-store'
import { computeStepStatuses } from '../../../lib/compute-step-statuses'
import { api } from '../../../lib/api-client'

export const Route = createFileRoute('/_authed/workflows/$workflowId/runs/$runId')({
  component: RunDetailPage,
})

const TERMINAL_STATUSES = new Set(['complete', 'errored', 'terminated'])

function RunDetailPage() {
  const { workflowId, runId } = useParams({ from: '/_authed/workflows/$workflowId/runs/$runId' })
  const queryClient = useQueryClient()
  const { setOverlay, clearOverlay } = useRunOverlayStore()

  const { data: run, isLoading, refetch } = useQuery({
    queryKey: ['workflow-run', workflowId, runId],
    queryFn: () =>
      fetch(`/api/workflows/${workflowId}/runs/${runId}`, { credentials: 'include' }).then((r) => r.json()),
  })

  const { data: version } = useQuery({
    queryKey: ['workflow-version', workflowId, run?.versionId],
    queryFn: () => api.getVersion(workflowId, run.versionId),
    enabled: !!run?.versionId,
  })

  const isActive = run && !TERMINAL_STATUSES.has(run.status)
  usePolling(() => { refetch() }, 3000, !!isActive)

  // Compute and set overlay when run status or version changes
  useEffect(() => {
    if (!run || !version) return

    try {
      const ir = JSON.parse(version.ir) as { nodes: WorkflowNode[]; edges: Edge[]; entryNodeId: string }
      const statuses = computeStepStatuses(ir.nodes, ir.edges, ir.entryNodeId, run.status)
      setOverlay(statuses)
    } catch {
      // Invalid IR — don't set overlay
    }

    return () => clearOverlay()
  }, [run?.status, version, setOverlay, clearOverlay])

  const actionMutation = useMutation({
    mutationFn: (action: 'pause' | 'resume' | 'terminate') =>
      fetch(`/api/workflows/${workflowId}/runs/${runId}/${action}`, {
        method: 'POST',
        credentials: 'include',
      }).then((r) => r.json()),
    onSuccess: () => {
      refetch()
      queryClient.invalidateQueries({ queryKey: ['workflow-runs', workflowId] })
    },
  })

  return (
    <div className="mx-auto max-w-4xl">
        <div className="flex items-center gap-3 mb-6">
          <Link to="/workflows/$workflowId/runs" params={{ workflowId }}>
            <Button variant="ghost" size="icon" className="h-8 w-8">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <h1 className="text-xl font-bold">Run Detail</h1>
        </div>

        {isLoading && (
          <div className="flex justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        )}

        {run && (
          <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
            <div className="h-[400px] rounded-xl border border-border bg-card overflow-hidden">
              {version ? (
                <RunCanvasPreview ir={version.ir} />
              ) : (
                <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                  Loading canvas...
                </div>
              )}
            </div>
            <div className="rounded-xl border border-border bg-card p-6">
              <RunDetailPanel
                run={run}
                onPause={() => actionMutation.mutate('pause')}
                onResume={() => actionMutation.mutate('resume')}
                onTerminate={() => actionMutation.mutate('terminate')}
              />
            </div>
          </div>
        )}
      </div>
  )
}
