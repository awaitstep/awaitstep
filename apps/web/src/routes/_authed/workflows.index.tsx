import { createFileRoute, Link } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { Plus, Loader2, Search } from 'lucide-react'
import { useState, useMemo } from 'react'
import { Button } from '../../components/ui/button'
import { api } from '../../lib/api-client'
import { WorkflowActionsMenu } from '../../components/dashboard/workflow-actions-menu'
import { TriggerButton } from '../../components/dashboard/trigger-button'

export const Route = createFileRoute('/_authed/workflows/')({
  component: WorkflowsIndexPage,
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

function WorkflowsIndexPage() {
  const [search, setSearch] = useState('')

  const { data: workflows, isLoading } = useQuery({
    queryKey: ['workflows'],
    queryFn: () => api.listWorkflows(),
    retry: false,
  })

  const { data: recentDeployments } = useQuery({
    queryKey: ['all-deployments'],
    queryFn: () => api.listAllDeployments(),
    retry: false,
  })

  const latestDeployStatus = new Map<string, string>()
  if (recentDeployments) {
    for (const d of recentDeployments) {
      if (!latestDeployStatus.has(d.workflowId)) {
        latestDeployStatus.set(d.workflowId, d.status)
      }
    }
  }

  const filtered = useMemo(() => {
    if (!workflows) return []
    if (!search.trim()) return workflows
    const q = search.toLowerCase()
    return workflows.filter(
      (wf) => wf.name.toLowerCase().includes(q) || wf.description?.toLowerCase().includes(q),
    )
  }, [workflows, search])

  return (
    <div>
      <div className="flex items-center justify-between border-b border-border pb-4">
        <h1 className="text-lg font-semibold">Workflows</h1>
        <Link to="/workflows/$workflowId/canvas" params={{ workflowId: 'new' }} search={{ template: true }}>
          <Button size="sm" className="gap-1.5">
            <Plus className="h-4 w-4" />
            New Workflow
          </Button>
        </Link>
      </div>

      <div className="mx-auto max-w-screen-md">
      {workflows && workflows.length > 0 && (
        <div className="relative mt-6 max-w-xs">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/60" />
          <input
            type="text"
            placeholder="Search workflows..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-lg border border-border bg-muted/40 py-2 pl-9 pr-4 text-sm text-foreground placeholder:text-muted-foreground/60 outline-none focus:border-border"
          />
        </div>
      )}

      {isLoading && (
        <div className="mt-12 flex justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground/60" />
        </div>
      )}

      {workflows && workflows.length === 0 && (
        <div className="mt-6 rounded-md border border-border px-4 py-8 text-center text-sm text-muted-foreground">
          No workflows yet.{' '}
          <Link to="/workflows/$workflowId/canvas" params={{ workflowId: 'new' }} search={{ template: true }} className="text-primary hover:underline">
            Create one
          </Link>
        </div>
      )}

      {filtered.length > 0 && (
        <div className="mt-4 overflow-hidden border border-border">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="px-4 py-2.5 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground/60">Name</th>
                <th className="px-4 py-2.5 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground/60">Status</th>
                <th className="px-4 py-2.5 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground/60">Updated</th>
                <th className="w-12 px-4 py-2.5"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((wf) => {
                const deployStatus = latestDeployStatus.get(wf.id)
                return (
                  <tr key={wf.id} className="border-b border-border/50 last:border-0 transition-colors hover:bg-muted/30">
                    <td className="px-4 py-3">
                      <Link
                        to="/workflows/$workflowId"
                        params={{ workflowId: wf.id }}
                        className="text-sm font-medium text-foreground hover:text-foreground"
                      >
                        {wf.name}
                      </Link>
                      {wf.description && (
                        <p className="mt-0.5 truncate text-xs text-muted-foreground/60 max-w-sm">{wf.description}</p>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <StatusLabel hasVersion={!!wf.currentVersionId} deployStatus={deployStatus} />
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">{timeAgo(wf.updatedAt)}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        {deployStatus === 'success' && <TriggerButton workflowId={wf.id} />}
                        <WorkflowActionsMenu workflow={wf} isDeployed={deployStatus === 'success'} />
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {search && filtered.length === 0 && workflows && workflows.length > 0 && (
        <p className="mt-8 text-center text-sm text-muted-foreground">No workflows match "{search}"</p>
      )}
      </div>
    </div>
  )
}

function StatusLabel({ hasVersion, deployStatus }: { hasVersion: boolean; deployStatus?: string }) {
  if (hasVersion && deployStatus === 'success') {
    return <span className="inline-flex items-center gap-1 text-xs text-status-success"><span className="h-1.5 w-1.5 rounded-full bg-status-success" /> Deployed</span>
  }
  if (deployStatus === 'failed') {
    return <span className="inline-flex items-center gap-1 text-xs text-status-error"><span className="h-1.5 w-1.5 rounded-full bg-status-error" /> Error</span>
  }
  return <span className="inline-flex items-center gap-1 text-xs text-muted-foreground/60"><span className="h-1.5 w-1.5 rounded-full border border-border" /> Draft</span>
}
