import { useInfiniteQuery } from '@tanstack/react-query'
import type { WorkflowSummary } from '../../lib/api-client'
import { flatPages, queries } from '../../lib/queries'
import { timeAgo } from '../../lib/time'
import { useWorkflowLinks } from '../../lib/workflows/detail-links'
import { workerUrl } from '../../lib/workflows/worker-url'
import { RecentRunsCard } from './parts/recent-runs-card'
import { StatCard } from './parts/stat-card'
import { TriggerCard } from './parts/trigger-card'
import { VersionsCard } from './parts/versions-card'
import type { WorkflowOverview } from './use-workflow-overview'

interface OverviewBodyProps {
  workflow: WorkflowSummary
  overview: WorkflowOverview
  /** Names of the accounts deployments went out on. */
  accounts: Map<string, string>
  /** Runs in the last 24 hours, by result, when known. */
  runs24h?: { all: number; failed: number }
}

/** A workflow's Overview (`WorkflowDetail`): three stats, Versions, Recent runs and Trigger. */
export function OverviewBody({ workflow, overview, accounts, runs24h }: OverviewBodyProps) {
  const { data: runs } = useInfiniteQuery({
    ...queries.runs.byWorkflow(workflow.id),
    select: (data) => flatPages(data),
  })
  const links = useWorkflowLinks(workflow.id)
  const latest = overview.versions[0]
  const live = overview.activeDeployment
  const account = live?.connectionId ? accounts.get(live.connectionId) : undefined

  return (
    <>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatCard
          label="Version"
          value={latest ? `v${latest.version}` : '—'}
          detail={
            latest
              ? `Updated ${timeAgo(latest.createdAt)}${latest.createdByName ? ` by ${latest.createdByName}` : ''}`
              : 'Nothing saved yet'
          }
        />
        <StatCard
          label="Deployment"
          value={live ? 'Live' : 'Not deployed'}
          detail={
            live
              ? [account, timeAgo(live.createdAt)].filter(Boolean).join(' · ')
              : 'Deploy it to run it'
          }
        />
        <StatCard
          label="Runs, 24h"
          value={runs24h ? runs24h.all : '—'}
          detail={runs24h ? failedLine(runs24h.failed) : ' '}
        />
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <VersionsCard
            versionHref={(versionId) => links.editor('canvas', { version: versionId })}
            deployHref={links.deployVersion}
            versions={overview.versions}
            deployedVersionId={live?.versionId}
            deployBlocked={overview.deployBlocked}
            hasMore={overview.versionsHasMore}
            loadingMore={overview.versionsLoadingMore}
            onLoadMore={overview.loadMoreVersions}
          />
        </div>
        <div className="flex flex-col gap-4">
          <RecentRunsCard runs={runs ?? []} runsHref={links.runs} runHref={links.run} />
          <TriggerCard url={workerUrl(live?.serviceUrl)} />
        </div>
      </div>
    </>
  )
}

function failedLine(failed: number): string {
  return failed === 0 ? 'None failed' : `${failed} failed`
}
