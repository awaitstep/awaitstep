import { Link } from '@tanstack/react-router'
import { Plus, Workflow } from 'lucide-react'
import { Button, buttonVariants } from '../ui/button'
import { GuardedLink } from '../ui/guarded-link'
import { useWorkflowsStore } from '../../stores/workflows-store'
import { WorkflowRow, WorkflowRowSkeleton } from '../workflows/workflow-row'
import { NEW_WORKFLOW_NAV } from '../../lib/nav'
import { useShallow } from 'zustand/react/shallow'
import { LoadingView } from '../ui/loading-view'
import { EmptyState } from '../ui/empty-state'

const listClass = 'divide-y divide-border overflow-hidden rounded-lg border border-border bg-card'

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
    <section className="mt-8">
      <div className="flex h-8 items-center justify-between">
        <h2 className="text-sm font-medium">Workflows</h2>
        {hasMore && (
          <Link to="/workflows">
            <Button variant="ghost" size="sm" className="text-xs">
              View all
            </Button>
          </Link>
        )}
      </div>

      <LoadingView isLoading={isLoading} LoadingPlaceholder={LoadingPlaceholder}>
        {latestWorkflows.length > 0 ? (
          <div className={`mt-4 ${listClass}`}>
            {latestWorkflows.map((wf) => (
              <WorkflowRow key={wf.id} workflow={wf} timestamp={wf.lastRunAt} />
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

function LoadingPlaceholder() {
  return (
    <div className={`mt-4 ${listClass}`}>
      <WorkflowRowSkeleton />
      <WorkflowRowSkeleton />
      <WorkflowRowSkeleton />
    </div>
  )
}
