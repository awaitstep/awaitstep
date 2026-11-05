import type { WorkflowSummary } from '../../lib/api-client'
import { timeAgo } from '../../lib/time'
import { useWorkflowLinks } from '../../lib/workflows/detail-links'
import { workerUrl } from '../../lib/workflows/worker-url'
import { StatCard } from './parts/stat-card'
import { UrlCard } from './parts/url-card'
import { VersionsCard } from './parts/versions-card'
import type { WorkflowOverview } from './use-workflow-overview'

interface FunctionBodyProps {
  workflow: WorkflowSummary
  overview: WorkflowOverview
  /** Names of the accounts deployments went out on. */
  accounts: Map<string, string>
  /** Never published: "1 so far" (`FunctionDraft`, 24g). */
  neverDeployed: boolean
}

/**
 * A function's page (`FunctionDetail`): its version and where it's live, and
 * its versions. Who calls it and how often aren't recorded, so those cards
 * aren't drawn; its URL is, since a function is called by POSTing to it.
 */
export function FunctionBody({ workflow, overview, accounts, neverDeployed }: FunctionBodyProps) {
  const links = useWorkflowLinks(workflow.id)
  const latest = overview.versions[0]
  const live = overview.activeDeployment
  const account = live?.connectionId ? accounts.get(live.connectionId) : undefined

  return (
    <>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <StatCard
          label="Version"
          value={latest ? `v${latest.version}` : '—'}
          detail={versionDetail(latest, !!live)}
        />
        <StatCard
          label="Deployment"
          value={live ? 'Live' : 'Not published'}
          detail={
            live
              ? [account, timeAgo(live.createdAt)].filter(Boolean).join(' · ')
              : 'Publish it to call it'
          }
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
            draft={neverDeployed}
          />
        </div>
        <UrlCard url={workerUrl(live?.serviceUrl)} />
      </div>
    </>
  )
}

/** "Updated 2h ago by Ama" once it's out; "Not published" before (`FunctionDraft`, 24g). */
function versionDetail(
  latest: { createdAt: string; createdByName?: string | null } | undefined,
  published: boolean,
): string {
  if (!latest) return 'Nothing saved yet'
  if (!published) return 'Not published'
  const by = latest.createdByName ? ` by ${latest.createdByName}` : ''
  return `Updated ${timeAgo(latest.createdAt)}${by}`
}
