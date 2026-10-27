import { useSharedWithWorkspace, useWorkspaceItems } from '../../data/dashboard/items'
import { useWorkspaceRuns } from '../../data/dashboard/runs'
import { useWorkspacePeople } from '../../data/dashboard/workspaces'
import type { WorkspaceSlugs } from '../../lib/dashboard-paths'
import { plural } from '../../lib/plural'
import { Bone, ListCardSkeleton, LoadingRegion } from '../ui/skeletons'
import { PageBody, PageIntro } from '../shell/page-intro'
import { TopBarContent } from '../navigation/top-bar-slot'
import { EditAccessRequest, NewItemButton } from '../items/item-actions'
import { useWorkspaceScope } from './use-workspace-scope'
import { latestRunPerItem } from './overview-summary'
import { emptyViewFor } from './workspace-empty-view'
import { WorkspaceLoadError } from './workspace-load-error'
import { WorkspaceOverview } from './workspace-overview'
import { WorkspaceWelcome } from './workspace-welcome'

// One page of the latest runs is enough to find each item's latest finished one.
const RECENT = { limit: 50 }
const RECENT_ROWS = 4
const FAILED = { result: 'failed' as const, limit: 20 }

function OverviewSkeleton() {
  return (
    <LoadingRegion label="Loading the overview">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <Bone key={i} className="h-16 rounded-xl" />
        ))}
      </div>
      <ListCardSkeleton rows={1} trailing={2} />
      <ListCardSkeleton rows={4} trailing={3} tile={false} />
    </LoadingRegion>
  )
}

interface WorkspaceOverviewPageProps {
  slugs: WorkspaceSlugs
}

/** `/{org}/{project}/{workspace}/overview`: `WsOverview`, or the welcome for an empty workspace. */
export function WorkspaceOverviewPage({ slugs }: WorkspaceOverviewPageProps) {
  const scope = useWorkspaceScope(slugs)
  const workflows = useWorkspaceItems(slugs, 'workflow')
  const functions = useWorkspaceItems(slugs, 'script')
  const recent = useWorkspaceRuns(slugs, RECENT)
  const failed = useWorkspaceRuns(slugs, FAILED)
  const people = useWorkspacePeople(slugs)
  const shared = useSharedWithWorkspace(slugs)

  if (!scope) return null
  const queries = [workflows, functions, recent, failed, people, shared]
  const workspace = scope.workspace.workspace
  const readOnly = !scope.workspace.viewerCan.edit.allowed

  function handleRetry() {
    for (const query of queries) {
      if (query.isError) void query.refetch()
    }
  }

  const topBar = (
    <TopBarContent>
      {readOnly ? (
        <EditAccessRequest slugs={slugs} />
      ) : (
        <NewItemButton slugs={slugs} kind="workflow" disabled={!workflows.data} />
      )}
    </TopBarContent>
  )

  const failedQuery = queries.find((query) => query.isError)
  if (failedQuery) {
    return (
      <>
        {topBar}
        <PageBody>
          <PageIntro title={workspace.name} />
          <WorkspaceLoadError
            what="this workspace"
            error={failedQuery.error}
            onRetry={handleRetry}
            retrying={queries.some((query) => query.isFetching)}
          />
        </PageBody>
      </>
    )
  }

  const items =
    workflows.data && functions.data ? [...workflows.data, ...functions.data] : undefined
  const view = items
    ? emptyViewFor({
        workflows: workflows.data!.length,
        functions: functions.data!.length,
        workspacesInProject: scope.project.project.workspaces.length,
      })
    : undefined
  if (view) {
    return (
      <PageBody>
        <WorkspaceWelcome view={view} slugs={slugs} {...scope} />
      </PageBody>
    )
  }

  const ready = items && recent.data && failed.data && people.data && shared.data
  const description = [
    workspace.description,
    `${plural(workspace.people.length, 'person', 'people')} can open this workspace`,
  ]
    .filter(Boolean)
    .join(' · ')

  return (
    <>
      {topBar}
      <PageBody>
        <PageIntro title={workspace.name} description={description} />
        {ready ? (
          <WorkspaceOverview
            slugs={slugs}
            workspace={workspace}
            items={items}
            recentRuns={latestRunPerItem(recent.data!.data, RECENT_ROWS)}
            failedRuns={failed.data!.data}
            people={people.data!}
            sharedIn={shared.data!}
          />
        ) : (
          <OverviewSkeleton />
        )}
      </PageBody>
    </>
  )
}
