import { Activity, GitBranch, Globe } from 'lucide-react'
import type { WorkflowSummary } from '../../lib/api-client'
import { timeAgo } from '../../lib/time'
import { DeployStatusBadge } from '../overview/deployment-card'
import { RecentRuns } from '../overview/recent-runs'
import { VersionList } from '../overview/version-list'
import type { WorkflowOverview } from './use-workflow-overview'

interface OverviewSummaryProps {
  workflow: WorkflowSummary
  overview: WorkflowOverview
}

const TILE = 'rounded-lg border border-border bg-card px-4 py-3'
const TILE_LABEL =
  'flex items-center gap-2 text-2xs font-medium uppercase tracking-wider text-muted-foreground'

/** A workflow's Overview below its title: version, deployment and runs, then versions and recent runs. */
export function OverviewSummary({ workflow, overview }: OverviewSummaryProps) {
  const {
    currentVersion,
    hasActiveDeployment,
    hasUndeployedChanges,
    deployedVersion,
    latestDeployment,
    workflowRuns,
  } = overview

  return (
    <>
      <div className="grid grid-cols-3 gap-3">
        <div className={TILE}>
          <div className={TILE_LABEL}>
            <GitBranch className="h-3.5 w-3.5" />
            Version
          </div>
          <p className="mt-1 font-mono text-lg font-semibold tabular-nums text-foreground">
            {currentVersion > 0 ? `v${currentVersion}` : '—'}
          </p>
          <p className="text-2xs text-muted-foreground/60">Updated {timeAgo(workflow.updatedAt)}</p>
        </div>
        <div className={TILE}>
          <div className={TILE_LABEL}>
            <Globe className="h-3.5 w-3.5" />
            Deployment
          </div>
          <div className="mt-1">
            {hasActiveDeployment ? (
              <>
                <DeployStatusBadge
                  hasActiveDeployment={hasActiveDeployment}
                  hasUndeployedChanges={hasUndeployedChanges}
                  deployedVersion={deployedVersion?.version}
                />
                {latestDeployment?.serviceUrl && (
                  <a
                    href={latestDeployment.serviceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-1.5 flex items-center gap-1 text-xs text-primary hover:underline"
                  >
                    {latestDeployment.serviceUrl.replace(/^https?:\/\//, '')}
                  </a>
                )}
              </>
            ) : (
              <p className="text-sm text-muted-foreground/60">Not deployed</p>
            )}
          </div>
        </div>
        <div className={TILE}>
          <div className={TILE_LABEL}>
            <Activity className="h-3.5 w-3.5" />
            Runs
          </div>
          <p className="mt-1 font-mono text-lg font-semibold tabular-nums text-foreground">
            {workflowRuns.length > 0 ? workflowRuns.length : '—'}
          </p>
          <p className="text-2xs text-muted-foreground/60">Created {timeAgo(workflow.createdAt)}</p>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-5">
        <div className="lg:col-span-3">
          <VersionList
            workflowId={workflow.id}
            workflow={workflow}
            versions={overview.versions}
            activeDeployment={overview.activeDeployment}
            deployBlocked={overview.deployBlocked}
            hasMore={overview.versionsHasMore}
            loadingMore={overview.versionsLoadingMore}
            onLoadMore={overview.loadMoreVersions}
          />
        </div>
        <div className="lg:col-span-2">
          <RecentRuns workflowId={workflow.id} runs={workflowRuns} />
        </div>
      </div>
    </>
  )
}
