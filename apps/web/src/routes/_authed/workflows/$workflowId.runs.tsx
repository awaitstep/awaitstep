import { createFileRoute, Link, useParams } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { ArrowLeft, Loader2, Activity } from 'lucide-react'
import { Button } from '../../../components/ui/button'
import { RunStatusBadge } from '../../../components/monitoring/run-status-badge'
import { usePolling } from '../../../lib/use-polling'

export const Route = createFileRoute('/_authed/workflows/$workflowId/runs')({
  component: RunsListPage,
})

function RunsListPage() {
  const { workflowId } = useParams({ from: '/_authed/workflows/$workflowId/runs' })

  const { data: runs, isLoading, refetch } = useQuery({
    queryKey: ['workflow-runs', workflowId],
    queryFn: () => fetch(`/api/workflows/${workflowId}/runs`, { credentials: 'include' }).then((r) => r.json()),
  })

  // Poll while there are non-terminal runs
  const hasActiveRuns = runs?.some(
    (r: { status: string }) => !['complete', 'errored', 'terminated'].includes(r.status),
  )
  usePolling(() => { refetch() }, 3000, !!hasActiveRuns)

  return (
    <div className="mx-auto max-w-3xl">
        <div className="flex items-center gap-3 mb-6">
          <Link to="/workflows/$workflowId" params={{ workflowId }}>
            <Button variant="ghost" size="icon" className="h-8 w-8">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div className="flex items-center gap-2">
            <Activity className="h-5 w-5 text-primary" />
            <h1 className="text-xl font-bold">Runs</h1>
          </div>
        </div>

        {isLoading && (
          <div className="flex justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        )}

        {runs && runs.length === 0 && (
          <div className="rounded-xl border border-border bg-card p-12 text-center">
            <p className="text-muted-foreground">No runs yet. Trigger the workflow to see execution history.</p>
          </div>
        )}

        {runs && runs.length > 0 && (
          <div className="space-y-2">
            {runs.map((run: { id: string; instanceId: string; status: string; createdAt: string }) => (
              <Link
                key={run.id}
                to="/workflows/$workflowId/runs/$runId"
                params={{ workflowId, runId: run.id }}
                className="flex items-center justify-between rounded-lg border border-border bg-card p-4 transition-colors hover:border-primary/30"
              >
                <div className="flex items-center gap-3">
                  <RunStatusBadge status={run.status} />
                  <span className="text-xs font-mono text-muted-foreground">{run.instanceId}</span>
                </div>
                <span className="text-xs text-muted-foreground">
                  {new Date(run.createdAt).toLocaleString()}
                </span>
              </Link>
            ))}
          </div>
        )}
      </div>
  )
}
