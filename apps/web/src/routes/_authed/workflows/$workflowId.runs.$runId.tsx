import { createFileRoute, Link, useParams } from '@tanstack/react-router'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Loader2 } from 'lucide-react'
import { Button } from '../../../components/ui/button'
import { RunDetailPanel } from '../../../components/monitoring/run-detail-panel'
import { usePolling } from '../../../lib/use-polling'

export const Route = createFileRoute('/_authed/workflows/$workflowId/runs/$runId')({
  component: RunDetailPage,
})

const TERMINAL_STATUSES = new Set(['complete', 'errored', 'terminated'])

function RunDetailPage() {
  const { workflowId, runId } = useParams({ from: '/_authed/workflows/$workflowId/runs/$runId' })
  const queryClient = useQueryClient()

  const { data: run, isLoading, refetch } = useQuery({
    queryKey: ['workflow-run', workflowId, runId],
    queryFn: () =>
      fetch(`/api/workflows/${workflowId}/runs/${runId}`, { credentials: 'include' }).then((r) => r.json()),
  })

  const isActive = run && !TERMINAL_STATUSES.has(run.status)
  usePolling(() => { refetch() }, 3000, !!isActive)

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
    <div className="mx-auto max-w-3xl">
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
          <div className="rounded-xl border border-border bg-card p-6">
            <RunDetailPanel
              run={run}
              onPause={() => actionMutation.mutate('pause')}
              onResume={() => actionMutation.mutate('resume')}
              onTerminate={() => actionMutation.mutate('terminate')}
            />
          </div>
        )}
      </div>
  )
}
