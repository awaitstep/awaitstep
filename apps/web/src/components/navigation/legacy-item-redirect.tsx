import { Navigate, useLocation } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { useShallow } from 'zustand/react/shallow'
import { useWorkspaces } from '../../data/dashboard/workspaces'
import { ApiError } from '../../lib/api-client'
import { queries } from '../../lib/queries'
import {
  dashboardPath,
  itemPagePath,
  itemPath,
  runPath,
  type WorkspaceSlugs,
} from '../../lib/dashboard-paths'
import type { EditorSearch } from '../../lib/workflows/surfaces'
import { useOrgReady, useOrgStore } from '../../stores/org-store'
import { LoadError } from '../ui/load-error'
import { NotFoundView } from '../ui/not-found-view'
import { routerTarget } from './router-shell-link'

function isNotFound(error: unknown): boolean {
  return error instanceof ApiError && error.status === 404
}

/** Which of a workflow's old `/workflows/{id}/…` pages was opened. */
export type LegacyItemPage =
  | { kind: 'overview' | 'runs' | 'deployments' }
  | { kind: 'deploy'; version?: string }
  | { kind: 'editor'; search: EditorSearch }
  | { kind: 'run'; runId: string }

function queryString(params: Record<string, string | undefined>): string {
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) if (value) search.set(key, value)
  const qs = search.toString()
  return qs ? `?${qs}` : ''
}

/** The workspace URL that replaced an old workflow page. */
export function legacyItemTarget(
  slugs: WorkspaceSlugs,
  workflowId: string,
  page: LegacyItemPage,
): string {
  const item = { id: workflowId }
  switch (page.kind) {
    case 'editor': {
      const { view, version, file, node } = page.search
      return `${itemPath(slugs, item)}${queryString({ view, version, file, node })}`
    }
    case 'deploy':
      return `${itemPagePath(slugs, item, 'deploy')}${queryString({ version: page.version })}`
    case 'run':
      return runPath(slugs, item, page.runId)
    default:
      return itemPagePath(slugs, item, page.kind)
  }
}

/**
 * An old `/workflows/{id}/…` link, sent to the same page at the workflow's
 * workspace URL. The old pages read the workflow through the switcher's
 * project, so this does too: a link that opened before still opens, and one
 * that didn't gets the not-found page.
 */
export function LegacyItemRedirect({
  workflowId,
  page,
}: {
  workflowId: string
  page: LegacyItemPage
}) {
  const { pathname } = useLocation()
  const ready = useOrgReady()
  const { org, project, projectsLoaded } = useOrgStore(
    useShallow((s) => ({
      org: s.organizations.find((o) => o.id === s.activeOrganizationId)?.slug,
      project: s.projects.find((p) => p.id === s.activeProjectId)?.slug,
      projectsLoaded: s.appReady && s.projectsFetchState !== 'loading',
    })),
  )
  const workflow = useQuery({
    ...queries.workflows.detail(workflowId),
    enabled: ready,
    // A network blip retries; a 404 is an answer.
    retry: (failures, error) => !isNotFound(error) && failures < 2,
  })
  const workspaces = useWorkspaces(org ?? '', project ?? '', {
    enabled: ready && !!org && !!project && !!workflow.data,
  })
  const workspace = workspaces.data?.find((w) => w.id === workflow.data?.workspaceId)

  function handleRetry() {
    void workflow.refetch()
  }

  if (org && project && workspace) {
    const slugs = { org, project, workspace: workspace.slug }
    const target = routerTarget(legacyItemTarget(slugs, workflowId, page))
    if (target.kind === 'router') {
      return <Navigate to={target.to} search={target.search} replace />
    }
  }
  if (workflow.isError && !isNotFound(workflow.error)) {
    return (
      <LoadError
        title="We couldn’t open this workflow"
        detail="Something went wrong while looking it up. Nothing was changed."
        onRetry={handleRetry}
        retrying={workflow.isFetching}
      />
    )
  }
  // No project to look in, the workflow isn't in it, or its workspace isn't one you can open.
  const missing =
    (projectsLoaded && !ready) ||
    workflow.isError ||
    workspaces.isError ||
    (workspaces.data !== undefined && !workspace)
  if (missing) {
    return (
      <NotFoundView
        kind="page"
        name={workflowId}
        path={pathname}
        primary={{ label: 'Back to your organizations', href: dashboardPath() }}
      />
    )
  }
  return (
    <p role="status" className="px-6 py-20 text-center text-sm text-muted-foreground">
      Opening…
    </p>
  )
}
