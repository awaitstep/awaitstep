import { useMemo } from 'react'
import { useInfiniteQuery } from '@tanstack/react-query'
import { ExternalLink, Rocket } from 'lucide-react'
import type { DeploymentSummary, WorkflowSummary } from '../../lib/api-client'
import { CardEmpty } from './parts/card-empty'
import { DeployFor } from './deploy-for'
import { flatPages, queries } from '../../lib/queries'
import { timeAgo } from '../../lib/time'
import { useWorkflowLinks } from '../../lib/workflows/detail-links'
import { workerUrl } from '../../lib/workflows/worker-url'
import { Badge } from '../ui/badge'
import { buttonVariants } from '../ui/button'
import { plural } from '../../lib/plural'
import { DeployLink, deployBlockedReason } from './parts/deploy-link'
import { DataTable, type DataColumn } from '../ui/data-table'
import { LoadMoreButton } from '../ui/load-more-button'
import { ListCardSkeleton, LoadingRegion } from '../ui/skeletons'
import { Tile } from '../ui/tile'

interface DeploymentsTabProps {
  workflow: WorkflowSummary
  /** Names of the accounts deployments went out on. */
  accounts: Map<string, string>
  /** The deployed version is locked: nothing else can go out. */
  deployBlocked: boolean
  /** Never deployed (24f); else it was, and was taken down (its rows went with it). */
  neverDeployed: boolean
}

/** A workflow's Deployments (`WorkflowDeployments`): what is live, the history, Roll back. */
export function DeploymentsTab({
  workflow,
  accounts,
  deployBlocked,
  neverDeployed,
}: DeploymentsTabProps) {
  const workflowId = workflow.id
  const links = useWorkflowLinks(workflowId)
  const query = useInfiniteQuery(queries.deployments.byWorkflow(workflowId))
  const deployments = flatPages(query.data)
  const live = deployments.find((d) => d.status === 'success')
  const columns = useMemo(
    () =>
      historyColumns({
        liveId: live?.id,
        accounts,
        rollBackHref: links.deployVersion,
        deployBlocked,
      }),
    [live?.id, accounts, links, deployBlocked],
  )

  if (query.isPending) {
    return (
      <LoadingRegion label="Loading deployments">
        <ListCardSkeleton rows={4} trailing={3} tile={false} />
      </LoadingRegion>
    )
  }

  if (deployments.length === 0) {
    return (
      <div className="rounded-2xl border border-border bg-card">
        <CardEmpty
          icon={<Rocket />}
          title={neverDeployed ? 'Never deployed' : 'Not deployed'}
          body={
            neverDeployed
              ? 'The live URL, who deployed what, and rollback all appear here after the first deploy.'
              : 'It was taken down. Deploy it again to see the live URL, who deployed what, and rollback here.'
          }
          action={<DeployFor workflow={workflow} />}
        />
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      {live && (
        <LiveCard
          deployment={live}
          version={live.version ?? undefined}
          account={live.connectionId ? accounts.get(live.connectionId) : undefined}
        />
      )}
      <section className="flex flex-col gap-3">
        <div className="flex items-baseline gap-2.5">
          <h2 className="text-sm font-semibold text-foreground">History</h2>
          <span className="text-xs text-muted-foreground">
            {query.hasNextPage ? 'Newest first' : plural(deployments.length, 'deploy')}
          </span>
        </div>
        <DataTable
          caption="Deployments of this workflow"
          columns={columns}
          rows={deployments}
          getRowKey={(d) => d.id}
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
        <p className="text-xs text-muted-foreground">
          Rolling back redeploys that version. Nothing is deleted from Cloudflare.
        </p>
      </section>
    </div>
  )
}

interface LiveCardProps {
  deployment: DeploymentSummary
  version: number | undefined
  account: string | undefined
}

function LiveCard({ deployment, version, account }: LiveCardProps) {
  const title = [version !== undefined ? `v${version}` : 'Live version', account && `on ${account}`]
    .filter(Boolean)
    .join(' ')
  const by = deployment.createdByName ? `deployed by ${deployment.createdByName}, ` : 'deployed '
  const url = workerUrl(deployment.serviceUrl)
  return (
    <section className="flex flex-wrap items-center gap-4 rounded-2xl border border-status-success/30 bg-card px-5 py-4">
      <Tile tone="ok">
        <Rocket />
      </Tile>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="flex items-center gap-2 text-sm font-semibold text-foreground">
          {title}
          <Badge variant="success">Live</Badge>
        </span>
        <span className="truncate text-xs text-muted-foreground">
          {[url?.replace(/^https:\/\//, ''), `${by}${timeAgo(deployment.createdAt)}`]
            .filter(Boolean)
            .join(' · ')}
        </span>
      </div>
      {url && (
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className={buttonVariants({ variant: 'outline', size: 'sm', className: 'gap-1.5' })}
        >
          <ExternalLink aria-hidden="true" className="size-3.5" />
          Open
        </a>
      )}
    </section>
  )
}

interface HistoryColumnsOptions {
  liveId: string | undefined
  accounts: Map<string, string>
  rollBackHref: (versionId: string) => string
  deployBlocked: boolean
}

function historyColumns({
  liveId,
  accounts,
  rollBackHref,
  deployBlocked,
}: HistoryColumnsOptions): DataColumn<DeploymentSummary>[] {
  return [
    {
      id: 'version',
      header: 'Version',
      width: '150px',
      cell: (d) => {
        // The row carries its version's number, however far back it is.
        const version = d.version ?? undefined
        return (
          <span className="flex items-center gap-2">
            <span className="font-mono text-sm text-foreground">
              {version !== undefined ? `v${version}` : '—'}
            </span>
            {d.id === liveId && <Badge variant="success">live</Badge>}
            {d.status === 'failed' && <Badge variant="error">failed</Badge>}
          </span>
        )
      },
    },
    {
      id: 'account',
      header: 'Account',
      cell: (d) => (
        <span className="truncate text-muted-foreground">
          {(d.connectionId && accounts.get(d.connectionId)) ?? '—'}
        </span>
      ),
    },
    {
      id: 'by',
      header: 'By',
      width: '150px',
      cell: (d) => <span className="truncate text-muted-foreground">{d.createdByName ?? '—'}</span>,
    },
    {
      id: 'when',
      header: 'When',
      width: '110px',
      cell: (d) => <span className="text-muted-foreground">{timeAgo(d.createdAt)}</span>,
    },
    {
      id: 'action',
      header: '',
      width: '110px',
      cell: (d) => {
        // Only a version that went out and still exists can go out again.
        if (d.id === liveId || d.status === 'failed' || !d.versionId || d.version == null) {
          return null
        }
        return (
          <DeployLink
            href={rollBackHref(d.versionId)}
            label="Roll back"
            blockedReason={deployBlockedReason(d.versionLocked === 1, deployBlocked)}
          />
        )
      },
    },
  ]
}
