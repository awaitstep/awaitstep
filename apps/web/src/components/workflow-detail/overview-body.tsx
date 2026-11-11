import { useInfiniteQuery } from '@tanstack/react-query'
import type { WorkflowSummary } from '../../lib/api-client'
import { flatPages } from '../../lib/queries'
import { useWorkflowLinks } from '../../lib/workflows/detail-links'
import type { RunHour } from '../../types/dashboard/workspaces'
import { RecentRunsCard } from './parts/recent-runs-card'
import { StatusBand } from './parts/status-band'
import { VersionsCard } from './parts/versions-card'
import type { WorkflowOverview } from './use-workflow-overview'
import { useQueries } from '../../contexts/api-client-context'
import { useEditorAccess } from '../../contexts/editor-scope-context'

interface OverviewBodyProps {
  workflow: WorkflowSummary
  overview: WorkflowOverview
  /** Runs in the last 24 hours, by result and hour by hour, when known. */
  runs24h?: { all: number; failed: number; byHour: RunHour[]; ranEver?: boolean }
  /** Never deployed: the draft state (24f). */
  neverDeployed: boolean
}

/**
 * A workflow's or function's Overview (`WorkflowDetail` 24a, `WorkflowDraft`
 * 24f): the band, then Versions and Recent runs. Both kinds read the same.
 */
export function OverviewBody({ workflow, overview, runs24h, neverDeployed }: OverviewBodyProps) {
  const queries = useQueries()
  const links = useWorkflowLinks(workflow.id)
  const { canDeploy } = useEditorAccess()
  const { data: runs } = useInfiniteQuery({
    // The card shows six runs; the Runs tab keeps its own paged list.
    ...queries.runs.byWorkflow(workflow.id, { limit: 6 }),
    select: (data) => flatPages(data),
  })
  // The Versions card is Overview's own list; other subpages never load it.
  const versionsQuery = useInfiniteQuery({
    ...queries.versions.byWorkflow(workflow.id),
    enabled: true,
  })
  const versions = flatPages(versionsQuery.data)
  const latest = versions[0]
    ? { version: versions[0].version, at: versions[0].createdAt }
    : overview.summary?.currentVersion
      ? {
          version: overview.summary.currentVersion.version,
          at: overview.summary.currentVersion.createdAt,
        }
      : undefined
  const live = overview.live.map((l) => ({
    accountId: l.id,
    version: l.version ?? undefined,
    account: l.name,
    at: l.deployedAt,
  }))
  // The API calls the newest live deploy when no account is named.
  const notCallable = workflow.kind === 'script' && overview.live[0]?.callable === false
  const liveVersionIds = new Set(overview.live.flatMap((l) => (l.versionId ? [l.versionId] : [])))

  return (
    <>
      <StatusBand
        workflowId={workflow.id}
        notCallable={notCallable}
        live={live}
        latest={latest}
        runs24h={runs24h}
      />
      <div className="flex flex-wrap items-stretch gap-4">
        <div className="flex min-w-0 basis-[420px] grow-[1.3] flex-col [&>*]:flex-1">
          <VersionsCard
            versionHref={(versionId) => links.editor('canvas', { version: versionId })}
            deployHref={canDeploy ? links.deployVersion : undefined}
            versions={versions}
            liveVersionIds={liveVersionIds}
            deployBlocked={overview.deployBlocked}
            hasMore={!!versionsQuery.hasNextPage}
            loadingMore={versionsQuery.isFetchingNextPage}
            onLoadMore={() => void versionsQuery.fetchNextPage()}
            draft={neverDeployed}
          />
        </div>
        <div className="flex min-w-0 basis-[320px] grow flex-col [&>*]:flex-1">
          <RecentRunsCard
            runs={runs ?? []}
            neverDeployed={neverDeployed}
            runsHref={links.runs}
            runHref={links.run}
          />
        </div>
      </div>
    </>
  )
}
