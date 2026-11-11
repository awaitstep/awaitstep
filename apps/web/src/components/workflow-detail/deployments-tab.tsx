import { useMemo, useState } from 'react'
import { useInfiniteQuery } from '@tanstack/react-query'
import { ChevronRight, ExternalLink, Rocket } from 'lucide-react'
import type { LiveDeployment } from '@awaitstep/ir'
import type { DeploymentSummary, WorkflowSummary } from '../../lib/api-client'
import { CardEmpty } from './parts/card-empty'
import { useEditorAccess } from '../../contexts/editor-scope-context'
import { DeployFor } from './deploy-for'
import { flatPages } from '../../lib/queries'
import { timeAgo } from '../../lib/time'
import { useWorkflowLinks } from '../../lib/workflows/detail-links'
import { workerUrl } from '../../lib/workflows/worker-url'
import { Badge } from '../ui/badge'
import { Button, buttonVariants } from '../ui/button'
import { plural } from '../../lib/plural'
import { DeployLink } from './parts/deploy-link'
import { DeploymentDrawer } from './deployment-drawer'
import { deploymentState, rollBackFor, type RollBackRules } from './deployment-rollback'
import { ABOVE_LINK, STRETCHED_LINK } from '../ui/linked-row'
import { DataTable, type DataColumn } from '../ui/data-table'
import { LoadMoreButton } from '../ui/load-more-button'
import { ListCardSkeleton, LoadingRegion } from '../ui/skeletons'
import { Tile } from '../ui/tile'
import { useQueries } from '../../contexts/api-client-context'
import type { WorkflowOverview } from './use-workflow-overview'

interface DeploymentsTabProps {
  workflow: WorkflowSummary
  /** Names of the accounts deployments went out on. */
  accounts: Map<string, string>
  /** What is live on each account, which accounts Deploy offers, and their locks. */
  overview: Pick<WorkflowOverview, 'live' | 'offeredIds' | 'lockedOn'>
  /** Never deployed (24f); else its earlier rows went with a takedown from before they were kept. */
  neverDeployed: boolean
}

/**
 * A workflow's Deployments (`WorkflowDeployments`): what is live on each
 * account, the history (taken-down rows included), Roll back to a row's account.
 */
export function DeploymentsTab({
  workflow,
  accounts,
  overview,
  neverDeployed,
}: DeploymentsTabProps) {
  const queries = useQueries()
  const workflowId = workflow.id
  const links = useWorkflowLinks(workflowId)
  const { canDeploy } = useEditorAccess()
  const query = useInfiniteQuery(queries.deployments.byWorkflow(workflowId))
  const deployments = flatPages(query.data)
  const { live, offeredIds, lockedOn } = overview
  const [openId, setOpenId] = useState<string | null>(null)
  // The last row opened stays in the drawer while it slides shut.
  const [shownId, setShownId] = useState<string | null>(null)
  const rules = useMemo<RollBackRules>(
    () => ({
      liveIds: new Set(live.map((l) => l.deploymentId)),
      rollBackHref: canDeploy ? links.deployVersion : undefined,
      lockedOn,
      offeredIds,
    }),
    [live, links, lockedOn, offeredIds, canDeploy],
  )
  const columns = useMemo(
    () =>
      historyColumns({
        rules,
        accounts,
        // State setters are stable: the columns needn't change with them.
        onOpen: (deploymentId) => {
          setOpenId(deploymentId)
          setShownId(deploymentId)
        },
      }),
    [rules, accounts],
  )
  const shown = deployments.find((d) => d.id === shownId) ?? null
  const shownState = shown ? deploymentState(shown, rules.liveIds) : null
  const shownAccount = shown?.connectionId ? (accounts.get(shown.connectionId) ?? null) : null
  const shownRollBack = shown ? rollBackFor(shown, rules) : null

  function handleCloseDrawer() {
    setOpenId(null)
  }

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
      {live.map((l) => (
        <LiveCard
          key={l.id}
          live={l}
          // A dropped account still runs it; it just can't be deployed to again.
          dropped={!offeredIds.has(l.id)}
        />
      ))}
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
          linkedRows
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
          Rolling back redeploys that version to the same account.
        </p>
      </section>
      <DeploymentDrawer
        open={openId !== null}
        deployment={shown}
        state={shownState}
        accountName={shownAccount}
        rollBack={shownRollBack}
        onClose={handleCloseDrawer}
      />
    </div>
  )
}

interface LiveCardProps {
  live: LiveDeployment
  /** The project no longer deploys to this account. */
  dropped: boolean
}

function LiveCard({ live, dropped }: LiveCardProps) {
  const title = [
    live.version !== null ? `v${live.version}` : 'Live version',
    `on ${live.name}`,
  ].join(' ')
  const by = live.deployedByName ? `deployed by ${live.deployedByName}, ` : 'deployed '
  const url = workerUrl(live.serviceUrl)
  return (
    <section className="flex flex-wrap items-center gap-4 rounded-2xl border border-status-success/30 bg-card px-5 py-4">
      <Tile tone="ok">
        <Rocket />
      </Tile>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="flex flex-wrap items-center gap-2 text-sm font-semibold text-foreground">
          {title}
          <Badge variant="success">Live</Badge>
          {dropped && <Badge variant="neutral">Not this project’s any more</Badge>}
        </span>
        <span className="truncate text-xs text-muted-foreground">
          {[url?.replace(/^https:\/\//, ''), `${by}${timeAgo(live.deployedAt)}`]
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
  rules: RollBackRules
  accounts: Map<string, string>
  /** Opens a row's details (24h). */
  onOpen: (deploymentId: string) => void
}

function historyColumns({
  rules,
  accounts,
  onOpen,
}: HistoryColumnsOptions): DataColumn<DeploymentSummary>[] {
  return [
    {
      id: 'version',
      header: 'Version',
      width: '150px',
      cell: (d) => (
        <VersionCell
          deployment={d}
          live={rules.liveIds.has(d.id)}
          account={d.connectionName ?? (d.connectionId && accounts.get(d.connectionId)) ?? null}
          onOpen={onOpen}
        />
      ),
    },
    {
      id: 'account',
      header: 'Account',
      cell: (d) => (
        <span className="truncate text-muted-foreground">
          {d.connectionName ?? (d.connectionId && accounts.get(d.connectionId)) ?? '—'}
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
      width: '130px',
      cell: (d) => {
        const rollBack = rollBackFor(d, rules)
        return (
          <span className="flex items-center justify-end gap-2">
            {rollBack && (
              <span className={ABOVE_LINK}>
                <DeployLink
                  href={rollBack.href}
                  label={rollBack.label}
                  blockedReason={rollBack.blockedReason}
                />
              </span>
            )}
            <ChevronRight aria-hidden="true" className="size-3.5 text-muted-foreground" />
          </span>
        )
      },
    },
  ]
}

function VersionCell({
  deployment: d,
  live,
  account,
  onOpen,
}: {
  deployment: DeploymentSummary
  live: boolean
  account: string | null
  onOpen: (deploymentId: string) => void
}) {
  // The row carries its version's number, however far back it is.
  const version = d.version != null ? `v${d.version}` : '—'
  // One name a row, even for the same version twice: what, where and when.
  const label = [
    `Details for ${d.version != null ? version : 'a deleted version'}`,
    account ? `on ${account}` : null,
    timeAgo(d.createdAt),
  ]
    .filter(Boolean)
    .join(', ')

  function handleOpen() {
    onOpen(d.id)
  }

  return (
    <span className="flex items-center gap-2">
      <Button
        type="button"
        variant="link"
        onClick={handleOpen}
        aria-label={label}
        className={`h-auto p-0 font-mono text-sm text-foreground ${STRETCHED_LINK}`}
      >
        {version}
      </Button>
      {live && <Badge variant="success">live</Badge>}
      {d.status === 'taken_down' && <Badge variant="neutral">taken down</Badge>}
      {d.status === 'failed' && <Badge variant="error">failed</Badge>}
    </span>
  )
}
