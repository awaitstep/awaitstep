import { Link } from '@tanstack/react-router'
import { Plus, Loader2 } from 'lucide-react'
import { Button } from '../ui/button'
import type { WorkflowSummary } from '../../lib/api-client'
import { useWorkflowsStore } from '../../stores/workflows-store'
import { WorkflowStatusBadge } from './workflow-status-badge'
import { WorkflowActionsMenu } from './workflow-actions-menu'
import { TriggerButton } from './trigger-button'
import { timeAgo } from '../../lib/time'

export function WorkflowList({ isNewUser }: { isNewUser: boolean }) {
  const workflows = useWorkflowsStore((s) => s.workflows)
  const isLoading = useWorkflowsStore((s) => s.fetchState === 'idle' || s.fetchState === 'loading')

  return (
    <section className="mt-10">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Workflows</h2>
        <Link to="/workflows/$workflowId/canvas" params={{ workflowId: 'new' }} search={{ template: true }}>
          <Button size="sm" className="gap-1.5">
            <Plus className="h-4 w-4" />
            New Workflow
          </Button>
        </Link>
      </div>

      {isLoading && (
        <div className="mt-4 flex justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground/60" />
        </div>
      )}

      {!isLoading && workflows.length === 0 && !isNewUser && (
        <div className="mt-4 rounded-md border border-border px-4 py-8 text-center text-sm text-muted-foreground">
          No workflows yet.{' '}
          <Link to="/workflows/$workflowId/canvas" params={{ workflowId: 'new' }} className="text-primary hover:underline">
            Create one
          </Link>
        </div>
      )}

      {workflows.length > 0 && (
        <div className="mt-4 space-y-2">
          {workflows.map((wf) => (
            <WorkflowRow key={wf.id} workflow={wf} />
          ))}
        </div>
      )}
    </section>
  )
}

function WorkflowRow({ workflow: wf }: { workflow: WorkflowSummary }) {
  const isOutdated = !!(wf.deployStatus === 'success' && wf.currentVersionId && wf.deployVersionId !== wf.currentVersionId)

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
            <WorkflowStatusBadge
              hasVersion={!!wf.currentVersionId}
              deployStatus={wf.deployStatus ?? undefined}
              isOutdated={isOutdated}
            />
          </div>
          {wf.description && (
            <p className="mt-0.5 max-w-sm truncate text-xs text-muted-foreground/60">{wf.description}</p>
          )}
        </div>
        <div className="flex items-center gap-3">
          {wf.lastRunAt && (
            <span className="text-xs text-muted-foreground/60">
              {timeAgo(wf.lastRunAt)}
            </span>
          )}
          <div className="flex items-center gap-1">
            {wf.deployStatus === 'success' && <TriggerButton workflowId={wf.id} />}
            <WorkflowActionsMenu
              workflow={wf}
              isDeployed={wf.deployStatus === 'success'}
            />
          </div>
        </div>
      </div>
    </div>
  )
}
