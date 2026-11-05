import type { ReactNode } from 'react'
import { useLocation } from '@tanstack/react-router'
import { ApiError, type WorkflowSummary } from '../../lib/api-client'
import { useDataSource } from '../../data/dashboard/source'
import { workspacePath, type WorkspaceSlugs } from '../../lib/dashboard-paths'
import { useWorkflowLinks } from '../../lib/workflows/detail-links'
import { useInOtherWorkspace, useRouteScopeReady } from '../../lib/workflows/route-scope'
import type { ItemDetailPage } from '../navigation/dashboard-page'
import { ItemPlaceholder } from '../navigation/item-placeholder'
import { EditableDescription, EditableName } from '../overview/editable-field'
import { PageBody } from '../shell/page-intro'
import { Badge } from '../ui/badge'
import { LinkTabs, type LinkTab } from '../ui/link-tabs'
import { NotFoundView } from '../ui/not-found-view'
import { DetailSkeleton, LoadingRegion } from '../ui/skeletons'
import { FUNCTION_BADGE_TITLE } from '../workflows/function-copy'
import { useWorkflowOverview, type WorkflowOverview } from './use-workflow-overview'
import { WorkspaceLoadError } from '../workspaces/workspace-load-error'
import { WorkflowActions } from './workflow-actions'

const PAGES_WITHOUT_ACTIONS: ReadonlySet<ItemDetailPage> = new Set(['deploy', 'run'])

/** Gone, or never this project's: the API says 404 for both. */
function isMissing(error: Error): boolean {
  return error instanceof ApiError && error.status === 404
}

interface ItemPageProps {
  slugs: WorkspaceSlugs
  workflowId: string
  page: ItemDetailPage
  children: (props: { workflow: WorkflowSummary; overview: WorkflowOverview }) => ReactNode
}

/**
 * A workflow or function's own page in its workspace: its name, actions and
 * tabs over the page's body. Nothing loads until API calls follow the URL's
 * project; sample data has no real item to show.
 */
export function ItemPage({ slugs, workflowId, page, children }: ItemPageProps) {
  const source = useDataSource()
  const ready = useRouteScopeReady(slugs) && source === 'api'
  const overview = useWorkflowOverview(workflowId, ready)
  const { workflow } = overview
  const inOtherWorkspace = useInOtherWorkspace(workflow)
  const { pathname } = useLocation()

  if (source !== 'api') return <ItemPlaceholder slugs={slugs} itemId={workflowId} />

  let body: ReactNode
  if (overview.isLoading) {
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
    body = (
      <NotFoundView
        kind="page"
        name={workflowId}
        path={pathname}
        primary={{ label: 'Back to the workspace', href: workspacePath(slugs) }}
      />
    )
  } else {
    body = (
      <>
        <ItemHeader workflow={workflow} overview={overview} page={page} />
        {children({ workflow, overview })}
      </>
    )
  }

  return <PageBody>{body}</PageBody>
}

interface ItemHeaderProps {
  workflow: WorkflowSummary
  overview: WorkflowOverview
  page: ItemDetailPage
}

function ItemHeader({ workflow, overview, page }: ItemHeaderProps) {
  const links = useWorkflowLinks(workflow.id)
  const isFunction = workflow.kind === 'script'
  const tabs: LinkTab[] = [
    { key: 'overview', label: 'Overview', href: links.overview },
    // A function answers straight away: it has no runs to list.
    ...(isFunction ? [] : [{ key: 'runs', label: 'Runs', href: links.runs }]),
    { key: 'deployments', label: 'Deployments', href: links.deployments },
  ]
  // A run is one of the Runs tab's; Deploy is none of them.
  const activeKey = page === 'run' ? 'runs' : page

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <div className="flex min-w-0 items-center gap-2">
            <EditableName workflowId={workflow.id} initialValue={workflow.name} />
            {isFunction && (
              <Badge
                variant="outline"
                className="shrink-0 uppercase tracking-wide"
                title={FUNCTION_BADGE_TITLE}
              >
                Function
              </Badge>
            )}
          </div>
          {page === 'overview' && (
            <EditableDescription
              workflowId={workflow.id}
              initialValue={workflow.description ?? ''}
            />
          )}
        </div>
        {/* Deploy is the action itself; a run has its own (pause, resume, stop). */}
        {!PAGES_WITHOUT_ACTIONS.has(page) && (
          <WorkflowActions workflow={workflow} overview={overview} />
        )}
      </div>
      <LinkTabs label="Workflow pages" tabs={tabs} activeKey={activeKey} />
    </div>
  )
}
