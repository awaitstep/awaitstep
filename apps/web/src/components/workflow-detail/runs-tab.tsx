import { useMemo } from 'react'
import { useInfiniteQuery } from '@tanstack/react-query'
import { useActiveRunSync } from '../../hooks/use-active-run-sync'
import { Play } from 'lucide-react'
import type { RunSummary, VersionSummary, WorkflowSummary } from '../../lib/api-client'
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
import { StatusPill } from '../ui/status-pill'
import { runDurationMs, runResult } from './run-result'
import { useQueries } from '../../contexts/api-client-context'

interface RunsTabProps {
  workflow: WorkflowSummary
  versions: VersionSummary[]
  /** Never deployed: the empty state offers Deploy (24f). */
  neverDeployed: boolean
  /** Runs in the last 24 hours, by result, when known. */
  runs24h?: { all: number; failed: number }
}

/** A workflow's Runs tab (`WorkflowDetail`): Result · Run · Version · Took · Started, newest first. */
export function RunsTab({ workflow, versions, neverDeployed, runs24h }: RunsTabProps) {
  const queries = useQueries()
  const workflowId = workflow.id
  const links = useWorkflowLinks(workflowId)
  const query = useInfiniteQuery(queries.runs.byWorkflow(workflowId))
  const runs = flatPages(query.data)
  const versionNumbers = useMemo(() => new Map(versions.map((v) => [v.id, v.version])), [versions])
  const columns = useMemo(() => runColumns(links.run, versionNumbers), [links, versionNumbers])

  // Running rows follow their run until it ends.
  useActiveRunSync(
    runs.map((r) => ({ id: r.id, workflowId: r.workflowId ?? workflowId, status: r.status })),
    ['workflow-runs', workflowId],
  )

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
        <div className="rounded-2xl border border-border bg-card">
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
      <DataTable
        caption="Runs of this workflow"
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
    </section>
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
          className="truncate font-mono text-xs text-foreground hover:underline"
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
        const version = versionNumbers.get(run.versionId)
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
      width: '120px',
      cell: (run) => <span className="text-muted-foreground">{timeAgo(run.createdAt)}</span>,
    },
  ]
}
