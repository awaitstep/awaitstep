import { useMemo } from 'react'
import { useInfiniteQuery } from '@tanstack/react-query'
import { useActiveRunSync } from '../../hooks/use-active-run-sync'
import { CircleCheck, Play } from 'lucide-react'
import type { RunSummary, WorkflowSummary } from '../../lib/api-client'
import { CardEmpty } from './parts/card-empty'
import { DeployFor } from './deploy-for'
import { flatPages } from '../../lib/queries'
import { timeAgo } from '../../lib/time'
import { useWorkflowLinks } from '../../lib/workflows/detail-links'
import { RouterShellLink } from '../navigation/router-shell-link'
import { tookLabel } from '../runs/run-format'
import { DataTable, type DataColumn } from '../ui/data-table'
import { LoadMoreButton } from '../ui/load-more-button'
import { ListCardSkeleton, LoadingRegion } from '../ui/skeletons'
import {
  SegmentedTab,
  SegmentedTabList,
  SegmentedTabPanel,
  SegmentedTabs,
} from '../ui/segmented-tabs'
import { StatusPill } from '../ui/status-pill'
import { runDurationMs, runResult } from './run-result'
import { useQueries } from '../../contexts/api-client-context'

interface RunsTabProps {
  workflow: WorkflowSummary
  /** Never deployed: the empty state offers Deploy (24f). */
  neverDeployed: boolean
  /** Runs in the last 24 hours, by result, when known. */
  runs24h?: { all: number; failed: number }
}

/**
 * A workflow's Runs tab (`WorkflowDetail`): All or Failed, each Result · Run ·
 * Version · Took · Started, newest first.
 */
export function RunsTab({ workflow, neverDeployed, runs24h }: RunsTabProps) {
  const queries = useQueries()
  // Whether it ever ran; the All list reads the same, so it is one request.
  const query = useInfiniteQuery(queries.runs.byWorkflow(workflow.id))
  const runs = flatPages(query.data)

  if (query.isPending) {
    return (
      <LoadingRegion label="Loading runs">
        <ListCardSkeleton rows={6} trailing={4} tile={false} />
      </LoadingRegion>
    )
  }

  if (runs.length === 0) {
    return (
      <section className="flex flex-col gap-3">
        <div className="flex items-baseline gap-2.5">
          <h2 className="text-sm font-semibold text-foreground">Runs</h2>
          <span className="text-xs text-muted-foreground">None yet</span>
        </div>
        <div className="rounded border border-border bg-card">
          <CardEmpty
            className="max-w-xs mx-auto"
            icon={<Play />}
            title="No runs yet"
            body="A run shows up here when it’s started from AwaitStep or the API."
            action={neverDeployed ? <DeployFor workflow={workflow} /> : undefined}
          />
        </div>
      </section>
    )
  }

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-baseline gap-2.5">
        <h2 className="text-sm font-semibold text-foreground">Runs</h2>
        {runs24h && (
          <span className="text-xs text-muted-foreground">
            {runs24h.all} in the last 24h · {runs24h.failed} failed
          </span>
        )}
      </div>
      <SegmentedTabs defaultValue="all" className="flex flex-col gap-3">
        <SegmentedTabList aria-label="Which runs">
          <SegmentedTab value="all">All</SegmentedTab>
          <SegmentedTab value="failed">Failed</SegmentedTab>
        </SegmentedTabList>
        {/* An inactive panel is not drawn: Failed is read when it opens. */}
        <SegmentedTabPanel value="all">
          <RunsTable workflowId={workflow.id} />
        </SegmentedTabPanel>
        <SegmentedTabPanel value="failed">
          <RunsTable workflowId={workflow.id} failed />
        </SegmentedTabPanel>
      </SegmentedTabs>
    </section>
  )
}

/** One tab's runs: all of them, or only those that failed. */
function RunsTable({ workflowId, failed }: { workflowId: string; failed?: boolean }) {
  const queries = useQueries()
  const links = useWorkflowLinks(workflowId)
  const query = useInfiniteQuery(
    queries.runs.byWorkflow(workflowId, failed ? { failed } : undefined),
  )
  const runs = flatPages(query.data)
  // Each run's version; the list is this tab's own read.
  const versionsQuery = useInfiniteQuery(queries.versions.byWorkflow(workflowId))
  const versions = flatPages(versionsQuery.data)
  const versionNumbers = useMemo(() => new Map(versions.map((v) => [v.id, v.version])), [versions])
  const columns = useMemo(() => runColumns(links.run, versionNumbers), [links, versionNumbers])

  // Running rows follow their run until it ends.
  useActiveRunSync(
    runs.map((r) => ({ id: r.id, workflowId: r.workflowId ?? workflowId, status: r.status })),
    ['workflow-runs', workflowId],
  )

  if (query.isPending) {
    return (
      <LoadingRegion label={failed ? 'Loading failed runs' : 'Loading runs'}>
        <ListCardSkeleton rows={6} trailing={4} tile={false} />
      </LoadingRegion>
    )
  }

  if (failed && runs.length === 0) {
    return (
      <div className="rounded border border-border bg-card">
        <CardEmpty
          className="max-w-xs mx-auto"
          icon={<CircleCheck />}
          title="No failed runs"
          body="A run that errors or is stopped shows up here."
        />
      </div>
    )
  }

  return (
    <DataTable
      caption={failed ? 'Failed runs of this workflow' : 'Runs of this workflow'}
      columns={columns}
      rows={runs}
      getRowKey={(run) => run.id}
      minWidth="640px"
      footer={
        query.hasNextPage ? (
          <LoadMoreButton
            hasMore
            loading={query.isFetchingNextPage}
            onClick={() => void query.fetchNextPage()}
          />
        ) : undefined
      }
    />
  )
}

function runColumns(
  runHref: (runId: string) => string,
  versionNumbers: Map<string, number>,
): DataColumn<RunSummary>[] {
  return [
    {
      id: 'result',
      header: 'Result',
      width: '120px',
      cell: (run) => <StatusPill status={runResult(run.status)} />,
    },
    {
      id: 'run',
      header: 'Run',
      cell: (run) => (
        <RouterShellLink
          href={runHref(run.id)}
          className="truncate font-mono text-xs text-foreground "
        >
          {run.id}
        </RouterShellLink>
      ),
    },
    {
      id: 'version',
      header: 'Version',
      width: '100px',
      cell: (run) => {
        // The run keeps its number once the version is deleted.
        const version = run.versionNumber ?? (run.versionId && versionNumbers.get(run.versionId))
        return <span className="text-muted-foreground">{version ? `v${version}` : '—'}</span>
      },
    },
    {
      id: 'took',
      header: 'Took',
      width: '90px',
      cell: (run) => <span className="text-muted-foreground">{tookLabel(runDurationMs(run))}</span>,
    },
    {
      id: 'started',
      header: 'Started',
      width: '150px',
      cell: (run) => <span className="text-muted-foreground">{timeAgo(run.createdAt)}</span>,
    },
  ]
}
