import { createFileRoute, useParams } from '@tanstack/react-router'
import { useState } from 'react'
import { useInfiniteQuery } from '@tanstack/react-query'
import { Play } from 'lucide-react'
import { Button } from '../../../components/ui/button'
import { RunStatusBadge } from '../../../components/monitoring/run-status-badge'
import { RunDetailSheet } from '../../../components/monitoring/run-detail-sheet'
import { queries, flatPages } from '../../../lib/queries'
import { useOrgReady } from '../../../stores/org-store'
import { TriggerDialog } from '../../../components/canvas/trigger-dialog'
import { useSheetStore } from '../../../stores/sheet-store'
import { useActiveRunSync } from '../../../hooks/use-active-run-sync'
import { timeAgo, duration } from '../../../lib/time'
import { LoadingView } from '../../../components/ui/loading-view'
import { LoadMoreButton } from '../../../components/ui/load-more-button'
import { ListSkeleton } from '../../../components/ui/skeletons'

export const Route = createFileRoute('/_authed/workflows/$workflowId/runs/')({
  head: () => ({ meta: [{ title: 'Runs | AwaitStep' }] }),
  component: RunsListPage,
})

function RunsListPage() {
  const { workflowId } = useParams({ from: '/_authed/workflows/$workflowId/runs/' })
  const ready = useOrgReady()
  const [triggerOpen, setTriggerOpen] = useState(false)
  const openRunSheet = useSheetStore((s) => s.openRunSheet)

  const {
    data: runsData,
    isLoading,
    hasNextPage,
    fetchNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery({ ...queries.runs.byWorkflow(workflowId), enabled: ready })
  const runs = flatPages(runsData)

  useActiveRunSync(
    runs.map((r: { id: string; workflowId: string; status: string }) => ({
      id: r.id,
      workflowId: r.workflowId ?? workflowId,
      status: r.status,
    })),
    ['workflow-runs', workflowId],
  )

  const { data: deployments } = useInfiniteQuery({
    ...queries.deployments.byWorkflow(workflowId),
    enabled: ready,
    retry: false,
    select: (data) => flatPages(data),
  })

  const hasActiveDeployment =
    deployments?.some((d: { status: string }) => d.status === 'success') ?? false

  return (
    <div>
      {hasActiveDeployment && (
        <div className="mb-4 flex justify-end">
          <Button size="sm" className="gap-1.5" onClick={() => setTriggerOpen(true)}>
            <Play className="h-4 w-4" />
            Trigger Run
          </Button>
        </div>
      )}

      <LoadingView isLoading={isLoading} LoadingPlaceholder={ListSkeleton}>
        {runs.length === 0 ? (
          <div className="mt-6 rounded-md border border-border px-4 py-8 text-center text-sm text-muted-foreground">
            No runs yet. Trigger the workflow to see execution history.
          </div>
        ) : (
          <div className="space-y-2">
            {runs.map(
              (run: {
                id: string
                instanceId: string
                status: string
                createdAt: string
                updatedAt: string
              }) => (
                <button
                  key={run.id}
                  onClick={() => openRunSheet({ runId: run.id, workflowId })}
                  className="flex w-full items-center justify-between rounded-lg border border-border bg-card px-4 py-3 text-left transition-colors hover:border-border/80 hover:bg-muted/20"
                >
                  <div className="flex items-center gap-3">
                    <RunStatusBadge status={run.status} />
                    <span className="font-mono text-xs text-foreground/60">{run.instanceId}</span>
                  </div>
                  <div className="flex items-center gap-4 text-xs text-muted-foreground">
                    <span className="font-mono">
                      {duration(run.createdAt, run.updatedAt, run.status)}
                    </span>
                    <span>{timeAgo(run.createdAt)}</span>
                  </div>
                </button>
              ),
            )}
            <LoadMoreButton
              hasMore={!!hasNextPage}
              loading={isFetchingNextPage}
              onClick={() => fetchNextPage()}
            />
          </div>
        )}
      </LoadingView>

      <RunDetailSheet />

      {triggerOpen && (
        <TriggerDialog onClose={() => setTriggerOpen(false)} workflowId={workflowId} />
      )}
    </div>
  )
}
