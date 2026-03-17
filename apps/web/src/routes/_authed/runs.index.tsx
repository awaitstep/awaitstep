import { createFileRoute, Link } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { Loader2, Play } from 'lucide-react'
import { Button } from '../../components/ui/button'
import { api } from '../../lib/api-client'
import { RunStatusBadge } from '../../components/monitoring/run-status-badge'
import { TriggerDialog } from '../../components/canvas/trigger-dialog'
import { useActiveRunSync } from '../../hooks/use-active-run-sync'

export const Route = createFileRoute('/_authed/runs/')({
  component: RunsIndexPage,
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

function RunsIndexPage() {
  const [triggerWorkflowId, setTriggerWorkflowId] = useState<string | null>(null)

  const { data: runs, isLoading } = useQuery({
    queryKey: ['all-runs'],
    queryFn: () => api.listAllRuns(),
    retry: false,
  })

  useActiveRunSync(runs, ['all-runs'])

  const { data: workflows } = useQuery({
    queryKey: ['workflows'],
    queryFn: () => api.listWorkflows(),
    retry: false,
  })

  const { data: allDeployments } = useQuery({
    queryKey: ['all-deployments'],
    queryFn: () => api.listAllDeployments(),
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

      <div className="mx-auto max-w-screen-md">
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
        <div className="mt-6 overflow-hidden border border-border">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="px-4 py-2.5 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground/60">Workflow</th>
                <th className="px-4 py-2.5 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground/60">Instance</th>
                <th className="px-4 py-2.5 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground/60">Status</th>
                <th className="px-4 py-2.5 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground/60">Duration</th>
                <th className="px-4 py-2.5 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground/60">Started</th>
              </tr>
            </thead>
            <tbody>
              {runs.map((run) => {
                const wf = workflowMap.get(run.workflowId)
                return (
                  <tr key={run.id} className="border-b border-border/50 last:border-0 transition-colors hover:bg-muted/30">
                    <td className="px-4 py-3">
                      {wf ? (
                        <Link
                          to="/workflows/$workflowId/runs"
                          params={{ workflowId: run.workflowId }}
                          className="text-sm text-foreground/70 hover:text-foreground"
                        >
                          {wf.name}
                        </Link>
                      ) : (
                        <span className="text-sm font-mono text-muted-foreground">{run.workflowId.slice(0, 8)}</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <Link
                        to="/runs/$runId"
                        params={{ runId: run.id }}
                        search={{ workflowId: run.workflowId }}
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
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      </div>

      <TriggerDialog
        open={!!triggerWorkflowId}
        onClose={() => setTriggerWorkflowId(null)}
        workflowId={triggerWorkflowId ?? ''}
      />
    </div>
  )
}
