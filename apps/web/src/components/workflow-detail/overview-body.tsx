import { useInfiniteQuery } from '@tanstack/react-query'
import type { WorkflowSummary } from '../../lib/api-client'
import { flatPages } from '../../lib/queries'
import { useWorkflowLinks } from '../../lib/workflows/detail-links'
import { workerUrl } from '../../lib/workflows/worker-url'
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
 * 24f): the band, then Versions and Recent runs. A function looks the same; it
 * is published and called, and its requests aren't recorded.
 */
export function OverviewBody({ workflow, overview, runs24h, neverDeployed }: OverviewBodyProps) {
  const queries = useQueries()
  const links = useWorkflowLinks(workflow.id)
  const { canDeploy } = useEditorAccess()
  const isFunction = workflow.kind === 'script'
  const { data: runs } = useInfiniteQuery({
    ...queries.runs.byWorkflow(workflow.id),
    select: (data) => flatPages(data),
    // A function has no runs.
    enabled: !isFunction,
  })
  const latest = overview.versions[0]
  const live = overview.live.map((l) => ({
    accountId: l.id,
    version: l.version ?? undefined,
    account: l.name,
    at: l.deployedAt,
    url: workerUrl(l.serviceUrl),
  }))
  const liveVersionIds = new Set(overview.live.flatMap((l) => (l.versionId ? [l.versionId] : [])))

  return (
    <>
      <StatusBand
        live={live}
        latest={latest && { version: latest.version, at: latest.createdAt }}
        runs24h={runs24h}
        isFunction={isFunction}
      />
      <div className="flex flex-wrap items-stretch gap-4">
        <div className="flex min-w-0 basis-[420px] grow-[1.3] flex-col [&>*]:flex-1">
          <VersionsCard
            versionHref={(versionId) => links.editor('canvas', { version: versionId })}
            deployHref={canDeploy ? links.deployVersion : undefined}
            versions={overview.versions}
            liveVersionIds={liveVersionIds}
            deployBlocked={overview.deployBlocked}
            hasMore={overview.versionsHasMore}
            loadingMore={overview.versionsLoadingMore}
            onLoadMore={overview.loadMoreVersions}
            draft={neverDeployed}
            isFunction={isFunction}
          />
        </div>
        <div className="flex min-w-0 basis-[320px] grow flex-col [&>*]:flex-1">
          <RecentRunsCard
            runs={runs ?? []}
            neverDeployed={neverDeployed}
            runsHref={links.runs}
            runHref={links.run}
            isFunction={isFunction}
          />
        </div>
      </div>
    </>
  )
}
