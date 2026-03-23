import { createFileRoute, Link } from '@tanstack/react-router'
import { Plus, Loader2, Search } from 'lucide-react'
import { useState, useMemo } from 'react'
import { Button } from '../../components/ui/button'
import type { WorkflowSummary } from '../../lib/api-client'
import { useWorkflowsStore } from '../../stores/workflows-store'
import { WorkflowActionsMenu } from '../../components/dashboard/workflow-actions-menu'
import { TriggerButton } from '../../components/dashboard/trigger-button'
import { timeAgo } from '../../lib/time'

export const Route = createFileRoute('/_authed/workflows/')({
  component: WorkflowsIndexPage,
})

function WorkflowsIndexPage() {
  const workflows = useWorkflowsStore((s) => s.workflows)
  const isLoading = useWorkflowsStore((s) => s.fetchState === 'idle' || s.fetchState === 'loading')
  const [search, setSearch] = useState('')

  const filtered = useMemo(() => {
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

      <div>
      {workflows.length > 0 && (
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

      {!isLoading && workflows.length === 0 && (
        <div className="mt-6 rounded-md border border-border px-4 py-8 text-center text-sm text-muted-foreground">
          No workflows yet.{' '}
          <Link to="/workflows/$workflowId/canvas" params={{ workflowId: 'new' }} search={{ template: true }} className="text-primary hover:underline">
            Create one
          </Link>
        </div>
      )}

      {filtered.length > 0 && (
        <div className="mt-4 space-y-2">
          {filtered.map((wf) => (
            <WorkflowRow key={wf.id} workflow={wf} />
          ))}
        </div>
      )}

      {search && filtered.length === 0 && workflows.length > 0 && (
        <p className="mt-8 text-center text-sm text-muted-foreground">No workflows match &ldquo;{search}&rdquo;</p>
      )}
      </div>
    </div>
  )
}

function WorkflowRow({ workflow: wf }: { workflow: WorkflowSummary }) {
  return (
    <div className="group rounded-lg border border-border bg-card transition-colors hover:border-border/80 hover:bg-muted/20">
      <div className="flex items-center justify-between px-4 py-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2.5">
            <Link
              to="/workflows/$workflowId"
              params={{ workflowId: wf.id }}
              className="text-sm font-medium text-foreground hover:text-foreground"
            >
              {wf.name}
            </Link>
            <StatusLabel hasVersion={!!wf.currentVersionId} deployStatus={wf.deployStatus ?? undefined} />
          </div>
          {wf.description && (
            <p className="mt-0.5 max-w-sm truncate text-xs text-muted-foreground/60">{wf.description}</p>
          )}
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-muted-foreground">{timeAgo(wf.updatedAt)}</span>
          <div className="flex items-center gap-1">
            {wf.deployStatus === 'success' && <TriggerButton workflowId={wf.id} />}
            <WorkflowActionsMenu workflow={wf} isDeployed={wf.deployStatus === 'success'} />
          </div>
        </div>
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
