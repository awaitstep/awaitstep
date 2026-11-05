import { useState } from 'react'
import { useInfiniteQuery } from '@tanstack/react-query'
import { Play } from 'lucide-react'
import { useEditorScope } from '../../contexts/editor-scope-context'
import { useActiveRunSync } from '../../hooks/use-active-run-sync'
import { flatPages, queries } from '../../lib/queries'
import { duration, timeAgo } from '../../lib/time'
import { useWorkflowLinks } from '../../lib/workflows/detail-links'
import { useSheetStore } from '../../stores/sheet-store'
import { TriggerDialog } from '../canvas/trigger-dialog'
import { NO_RUNS_MESSAGE } from '../monitoring/no-runs-copy'
import { RunDetailSheet } from '../monitoring/run-detail-sheet'
import { RunStatusBadge } from '../monitoring/run-status-badge'
import { RouterShellLink } from '../navigation/router-shell-link'
import { Button } from '../ui/button'
import { LoadMoreButton } from '../ui/load-more-button'
import { LoadingView } from '../ui/loading-view'
import { ListSkeleton } from '../ui/skeletons'

interface RunsPanelProps {
  workflowId: string
  /** Holds every read until API calls follow the right project. */
  ready: boolean
}

interface RunRowData {
  id: string
  instanceId: string
  status: string
  createdAt: string
  updatedAt: string
}

const ROW_CLASS =
  'flex w-full items-center justify-between px-4 py-3 text-left transition-colors hover:bg-muted/20'

/** A workflow's runs, newest first, with Trigger run once it's deployed. */
export function RunsPanel({ workflowId, ready }: RunsPanelProps) {
  const [triggerOpen, setTriggerOpen] = useState(false)
  // In a workspace a run opens as its own page; the old pages open the sheet.
  const inWorkspace = useEditorScope() !== null

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

      <LoadingView isLoading={isLoading || !ready} LoadingPlaceholder={ListSkeleton}>
        {runs.length === 0 ? (
          <div className="mt-6 rounded-md border border-border px-4 py-8 text-center text-sm text-muted-foreground">
            {NO_RUNS_MESSAGE}
          </div>
        ) : (
          <>
            <div className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-card">
              {runs.map((run: RunRowData) => (
                <RunRow key={run.id} run={run} workflowId={workflowId} asLink={inWorkspace} />
              ))}
            </div>
            <LoadMoreButton
              hasMore={!!hasNextPage}
              loading={isFetchingNextPage}
              onClick={() => fetchNextPage()}
            />
          </>
        )}
      </LoadingView>

      {!inWorkspace && <RunDetailSheet />}

      {triggerOpen && (
        <TriggerDialog onClose={() => setTriggerOpen(false)} workflowId={workflowId} />
      )}
    </div>
  )
}

function RunRow({
  run,
  workflowId,
  asLink,
}: {
  run: RunRowData
  workflowId: string
  asLink: boolean
}) {
  const openRunSheet = useSheetStore((s) => s.openRunSheet)
  const links = useWorkflowLinks(workflowId)
  const content = (
    <>
      <div className="flex items-center gap-3">
        <RunStatusBadge status={run.status} />
        <span className="font-mono text-xs text-foreground/60">{run.instanceId}</span>
      </div>
      <div className="flex items-center gap-4 font-mono text-2xs tabular-nums text-muted-foreground">
        <span>{duration(run.createdAt, run.updatedAt, run.status)}</span>
        <span>{timeAgo(run.createdAt)}</span>
      </div>
    </>
  )

  function handleOpen() {
    openRunSheet({ runId: run.id, workflowId })
  }

  if (asLink) {
    return (
      <RouterShellLink href={links.run(run.id)} className={ROW_CLASS}>
        {content}
      </RouterShellLink>
    )
  }
  return (
    <button type="button" onClick={handleOpen} className={ROW_CLASS}>
      {content}
    </button>
  )
}
