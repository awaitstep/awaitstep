import type { ReactNode } from 'react'
import { useDataSource } from '../../data/dashboard/source'
import { ApiError, type WorkflowSummary } from '../../lib/api-client'
import type { RunHour } from '../../types/dashboard/workspaces'
import type { WorkspaceSlugs } from '../../lib/dashboard-paths'
import { useInOtherWorkspace, useItemScopeReady } from '../../lib/workflows/route-scope'
import type { ItemDetailPage } from '../navigation/dashboard-page'
import { PageBody } from '../shell/page-intro'
import { DetailSkeleton, LoadingRegion } from '../ui/skeletons'
import { useWorkspaceScope } from '../workspaces/use-workspace-scope'
import { WorkspaceLoadError } from '../workspaces/workspace-load-error'
import { ItemHeader } from './item-header'
import { ItemNotFound } from './item-not-found'
import { useDeploymentAccounts } from './use-deployment-accounts'
import { useWorkflowOverview, type WorkflowOverview } from './use-workflow-overview'

/** Gone, or never this project's: the API says 404 for both. */
function isMissing(error: Error): boolean {
  return error instanceof ApiError && error.status === 404
}

/**
 * Never deployed, as far as can be told: no deployment rows, and for a
 * workflow no runs either — takedowns before rows were kept deleted them,
 * but their runs stay.
 * Undefined until both have loaded.
 */
function draftState(
  deployments: number | undefined,
  isFunction: boolean,
  ranEver: boolean | undefined,
): boolean | undefined {
  if (deployments === undefined) return undefined
  if (deployments > 0) return false
  if (isFunction) return true
  return ranEver === undefined ? undefined : !ranEver
}

/** What every one of an item's pages has to hand. */
export interface ItemPageData {
  workflow: WorkflowSummary
  overview: WorkflowOverview
  /** Names of the accounts its deployments went out on. */
  accounts: Map<string, string>
  /** Runs in the last 24 hours, by result and hour by hour, and whether it ever ran; when known. */
  runs24h?: { all: number; failed: number; byHour: RunHour[]; ranEver?: boolean }
  /** Never deployed (no deployment at all): the boards' draft state (24f, 24g). */
  neverDeployed: boolean
}

interface ItemPageProps {
  slugs: WorkspaceSlugs
  workflowId: string
  page: ItemDetailPage
  children: (data: ItemPageData) => ReactNode
}

/**
 * A workflow or function's own page in its workspace (`WorkflowDetail`,
 * `FunctionDetail`): its head over the page's body. Its calls go to the URL's
 * project; sample data has no real item to show.
 */
export function ItemPage({ slugs, workflowId, page, children }: ItemPageProps) {
  const source = useDataSource()
  const ready = useItemScopeReady() && source === 'api'
  const overview = useWorkflowOverview(workflowId, ready)
  const { workflow, summary } = overview
  const inOtherWorkspace = useInOtherWorkspace(workflow)
  const accounts = useDeploymentAccounts(workflowId, ready)
  // Edit in place only where the API would take it (a Viewer would get a 403).
  const canEdit = useWorkspaceScope(slugs)?.workspace.viewerCan.edit.allowed ?? false

  if (source !== 'api') {
    return (
      <PageBody>
        <ItemNotFound slugs={slugs} workflowId={workflowId} />
      </PageBody>
    )
  }

  let body: ReactNode
  // A cached read naming another workspace may be from before a move: wait for the fresh one.
  if (overview.isLoading || (inOtherWorkspace && overview.isFetching)) {
    body = (
      <LoadingRegion label="Loading">
        <DetailSkeleton />
      </LoadingRegion>
    )
  } else if (overview.error && !isMissing(overview.error)) {
    body = (
      <WorkspaceLoadError
        what="this workflow"
        error={overview.error}
        onRetry={overview.refetch}
        retrying={overview.isFetching}
      />
    )
  } else if (!workflow || inOtherWorkspace) {
    body = <ItemNotFound slugs={slugs} workflowId={workflowId} />
  } else {
    const ranEver = summary ? summary.runs.total > 0 : undefined
    const runs24h = summary
      ? {
          all: summary.runs.counts.all,
          failed: summary.runs.counts.failed,
          byHour: summary.runs.byHour,
          ranEver,
        }
      : undefined
    const draft = draftState(summary?.deployCount, workflow.kind === 'script', ranEver)
    const neverDeployed = draft === true
    body = (
      <>
        <ItemHeader
          slugs={slugs}
          workflow={workflow}
          overview={overview}
          page={page}
          neverDeployed={neverDeployed}
          canEdit={canEdit}
          // A draft's tabs carry no counts (24f), nor do they until that's known; a partial
          // deploy count would read as the total.
          counts={
            draft !== false
              ? undefined
              : {
                  runs: summary?.runs.total,
                  deployments: summary?.deployCount,
                }
          }
        />
        {children({ workflow, overview, accounts, runs24h, neverDeployed })}
      </>
    )
  }

  return <PageBody>{body}</PageBody>
}
