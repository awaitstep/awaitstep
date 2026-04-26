import { Link } from '@tanstack/react-router'
import { Plus, Workflow } from 'lucide-react'
import { Button, buttonVariants } from '../ui/button'
import { GuardedLink } from '../ui/guarded-link'
import type { WorkflowSummary } from '../../lib/api-client'
import { useWorkflowsStore } from '../../stores/workflows-store'
import { WorkflowStatusBadge } from './workflow-status-badge'
import { WorkflowActionsMenu } from './workflow-actions-menu'
import { TriggerButton } from './trigger-button'
import { NewArtifactDropdown } from './new-artifact-dropdown'
import { timeAgo } from '../../lib/time'
import { NEW_WORKFLOW_NAV } from '../../lib/nav'
import { useShallow } from 'zustand/react/shallow'
import { LoadingView } from '../ui/loading-view'
import { EmptyState } from '../ui/empty-state'

export function WorkflowList() {
  const { workflows, isLoading, hasMore } = useWorkflowsStore(
    useShallow((s) => ({
      workflows: s.workflows,
      isLoading: s.fetchState === 'loading' || s.fetchState === 'idle',
      hasMore: s.workflows.length > 5,
    })),
  )

  const latestWorkflows = workflows.slice(0, 5)

  return (
    <section className="mt-10">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Workflows</h2>
        <div className="flex items-center gap-2">
          {hasMore && (
            <Link to="/workflows">
              <Button variant="ghost" size="sm" className="text-xs">
                View all
              </Button>
            </Link>
          )}
          <NewArtifactDropdown />
        </div>
      </div>

      <LoadingView isLoading={isLoading} LoadingPlaceholder={LoadingPlaceholder}>
        {latestWorkflows.length > 0 ? (
          <div className="mt-4 space-y-2">
            {latestWorkflows.map((wf) => (
              <WorkflowRow key={wf.id} workflow={wf} />
            ))}
          </div>
        ) : (
          <div className="mt-4">
            <EmptyState
              icon={Workflow}
              title="No workflows yet"
              description="Create your first visual workflow and deploy it to Cloudflare Workers."
              action={
                <GuardedLink
                  requirement="project"
                  nav={NEW_WORKFLOW_NAV}
                  className={buttonVariants({ size: 'sm' })}
                >
                  <Plus className="h-4 w-4" />
                  New Workflow
                </GuardedLink>
              }
            />
          </div>
        )}
      </LoadingView>
    </section>
  )
}

function WorkflowRow({ workflow: wf }: { workflow: WorkflowSummary }) {
  const isOutdated = !!(
    wf.deployStatus === 'success' &&
    wf.currentVersionId &&
    wf.deployVersionId !== wf.currentVersionId
  )

  return (
    <Link
      to="/workflows/$workflowId"
      params={{ workflowId: wf.id }}
      className="group block rounded-lg border border-border bg-card transition-all duration-150 hover:border-border/80 hover:bg-muted/20"
    >
      <div className="flex items-center justify-between px-4 py-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2.5">
            <span className="text-sm font-medium text-foreground">{wf.name}</span>
            <WorkflowStatusBadge
              hasVersion={!!wf.currentVersionId}
              deployStatus={wf.deployStatus ?? undefined}
              isOutdated={isOutdated}
            />
          </div>
          {wf.description && (
            <p className="mt-0.5 max-w-sm truncate text-xs text-muted-foreground/60">
              {wf.description}
            </p>
          )}
        </div>
        <div className="flex items-center gap-3" onClick={(e) => e.preventDefault()}>
          {wf.lastRunAt && (
            <span className="text-xs text-muted-foreground/60">{timeAgo(wf.lastRunAt)}</span>
          )}
          <div className="flex items-center gap-1">
            {wf.deployStatus === 'success' && <TriggerButton workflowId={wf.id} />}
            <WorkflowActionsMenu workflow={wf} isDeployed={wf.deployStatus === 'success'} />
          </div>
        </div>
      </div>
    </Link>
  )
}

function WorkflowRowSkeleton() {
  return (
    <div className="rounded-lg border border-border bg-card">
      <div className="flex items-center justify-between px-4 py-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2.5">
            <div className="h-4 w-32 animate-pulse rounded bg-muted/60" />
            <div className="h-4 w-16 animate-pulse rounded bg-muted/40" />
          </div>
          <div className="mt-1.5 h-3 w-48 animate-pulse rounded bg-muted/30" />
        </div>
        <div className="flex items-center gap-3">
          <div className="h-3 w-12 animate-pulse rounded bg-muted/30" />
          <div className="h-7 w-7 animate-pulse rounded bg-muted/30" />
        </div>
      </div>
    </div>
  )
}

function LoadingPlaceholder() {
  return (
    <div className="mt-4 space-y-2">
      <WorkflowRowSkeleton />
      <WorkflowRowSkeleton />
      <WorkflowRowSkeleton />
    </div>
  )
}
