import { createFileRoute } from '@tanstack/react-router'
import { useState } from 'react'
import { Play } from 'lucide-react'
import { Button } from '../../components/ui/button'
import { PageHeader } from '../../components/ui/page-header'
import { RunStatusBadge } from '../../components/monitoring/run-status-badge'
import { RunDetailSheet } from '../../components/monitoring/run-detail-sheet'
import { TriggerDialog } from '../../components/canvas/trigger-dialog'
import { useWorkflowsStore } from '../../stores/workflows-store'
import { useRunsStore } from '../../stores/runs-store'
import { useSheetStore } from '../../stores/sheet-store'
import { useShallow } from 'zustand/react/shallow'
import { timeAgo, duration } from '../../lib/time'
import { RequireProject } from '../../wrappers/require-project'
import { LoadingView } from '../../components/ui/loading-view'
import { LoadMoreButton } from '../../components/ui/load-more-button'
import { ListSkeleton } from '../../components/ui/skeletons'
import { EmptyState } from '../../components/ui/empty-state'
import { Activity } from 'lucide-react'

export const Route = createFileRoute('/_authed/runs/')({
  head: () => ({ meta: [{ title: 'Runs | AwaitStep' }] }),
  component: RunsIndexPage,
})

function RunsIndexPage() {
  return (
    <RequireProject>
      <RunsIndexContent />
    </RequireProject>
  )
}

function RunsIndexContent() {
  const [triggerWorkflowId, setTriggerWorkflowId] = useState<string | null>(null)
  const { openRunSheet } = useSheetStore()

  const { runs, runsLoading, hasMore, loadMore, isFetchingMore } = useRunsStore(
    useShallow((s) => ({
      runs: s.runs,
      runsLoading: s.fetchState === 'idle' || s.fetchState === 'loading',
      hasMore: s.hasMore,
      loadMore: s.loadMore,
      isFetchingMore: s.isFetchingMore,
    })),
  )
  const workflows = useWorkflowsStore((s) => s.workflows)

  const workflowMap = new Map(workflows.map((w) => [w.id, w]))
  const deployedWorkflows = workflows.filter((w) => w.deployStatus === 'success')

  return (
    <div>
      <PageHeader
        title="Runs"
        breadcrumbs={[{ label: 'Home', href: '/dashboard' }, { label: 'Runs' }]}
        actions={
          deployedWorkflows.length > 0 ? (
            <Button
              size="sm"
              className="gap-1.5"
              onClick={() => setTriggerWorkflowId(deployedWorkflows[0].id)}
            >
              <Play className="h-4 w-4" />
              Trigger Run
            </Button>
          ) : undefined
        }
      />

      <div>
        <LoadingView isLoading={runsLoading} LoadingPlaceholder={ListSkeleton}>
          {runs.length === 0 ? (
            <div className="mt-6">
              <EmptyState
                icon={Activity}
                title="No runs recorded"
                description="Runs will appear here once you trigger a deployed workflow."
              />
            </div>
          ) : (
            <div className="mt-6 space-y-2">
              {runs.map((run) => {
                const wf = workflowMap.get(run.workflowId)
                return (
                  <button
                    key={run.id}
                    onClick={() =>
                      openRunSheet({
                        runId: run.id,
                        workflowId: run.workflowId,
                        workflowName: wf?.name,
                      })
                    }
                    className="flex w-full items-center justify-between rounded-lg border border-border bg-card px-4 py-3 text-left transition-colors hover:border-border/80 hover:bg-muted/20"
                  >
                    <div className="flex items-center gap-3">
                      <RunStatusBadge status={run.status} />
                      <div className="min-w-0 flex flex-col">
                        <p className="text-sm text-foreground/70">{wf?.name ?? run.workflowId}</p>
                        <span className="font-mono text-xs text-muted-foreground/50">
                          {run.instanceId}
                        </span>
                      </div>
                    </div>
                    <div className="flex flex-col flex-end items-end text-sm text-muted-foreground">
                      <span>{timeAgo(run.createdAt)}</span>
                      <span className="text-xs text-muted-foreground/50">
                        {duration(run.createdAt, run.updatedAt, run.status)}
                      </span>
                    </div>
                  </button>
                )
              })}
              <LoadMoreButton
                hasMore={hasMore}
                loading={isFetchingMore}
                onClick={() => loadMore?.()}
              />
            </div>
          )}
        </LoadingView>
      </div>

      <RunDetailSheet />

      {triggerWorkflowId && (
        <TriggerDialog
          onClose={() => setTriggerWorkflowId(null)}
          workflowId={triggerWorkflowId}
          workflows={deployedWorkflows.map((w) => ({ id: w.id, name: w.name }))}
        />
      )}
    </div>
  )
}
