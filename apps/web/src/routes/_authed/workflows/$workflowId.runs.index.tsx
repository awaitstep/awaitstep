import { createFileRoute, Link, useParams } from '@tanstack/react-router'
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Loader2, Play } from 'lucide-react'
import { Button } from '../../../components/ui/button'
import { RunStatusBadge } from '../../../components/monitoring/run-status-badge'
import { api } from '../../../lib/api-client'
import { TriggerDialog } from '../../../components/canvas/trigger-dialog'
import { useActiveRunSync } from '../../../hooks/use-active-run-sync'

export const Route = createFileRoute('/_authed/workflows/$workflowId/runs/')({
  component: RunsListPage,
})

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  return `${days}d ago`
}

function duration(start: string, end: string, status: string): string {
  if (['running', 'queued'].includes(status)) return '--'
  const ms = new Date(end).getTime() - new Date(start).getTime()
  if (ms < 1000) return `${ms}ms`
  const secs = Math.floor(ms / 1000)
  if (secs < 60) return `${secs}s`
  const mins = Math.floor(secs / 60)
  const remSecs = secs % 60
  return `${mins}m ${remSecs}s`
}

function RunsListPage() {
  const { workflowId } = useParams({ from: '/_authed/workflows/$workflowId/runs/' })
  const [triggerOpen, setTriggerOpen] = useState(false)

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
        <div className="mb-6 flex items-center justify-end">
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
        <div className="overflow-hidden border border-border">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="px-4 py-2.5 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground/60">Instance</th>
                <th className="px-4 py-2.5 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground/60">Status</th>
                <th className="px-4 py-2.5 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground/60">Duration</th>
                <th className="px-4 py-2.5 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground/60">Started</th>
              </tr>
            </thead>
            <tbody>
              {runs.map((run: { id: string; instanceId: string; status: string; createdAt: string; updatedAt: string }) => (
                <tr key={run.id} className="border-b border-border/50 last:border-0 transition-colors hover:bg-muted/30">
                  <td className="px-4 py-3">
                    <Link
                      to="/runs/$runId"
                      params={{ runId: run.id }}
                      search={{ workflowId }}
                      className="font-mono text-xs text-foreground/60 hover:text-foreground"
                    >
                      {run.instanceId}
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    <RunStatusBadge status={run.status} />
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{duration(run.createdAt, run.updatedAt, run.status)}</td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">{timeAgo(run.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <TriggerDialog
        open={triggerOpen}
        onClose={() => setTriggerOpen(false)}
        workflowId={workflowId}
      />
    </div>
  )
}
