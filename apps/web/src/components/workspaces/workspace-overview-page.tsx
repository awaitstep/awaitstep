import { useWorkspaceOverview } from '../../data/dashboard/workspaces'
import type { WorkspaceSlugs } from '../../lib/dashboard-paths'
import { Bone, ListCardSkeleton, LoadingRegion } from '../ui/skeletons'
import { PageBody, PageIntro } from '../shell/page-intro'
import { TopBarContent } from '../navigation/top-bar-slot'
import { EditAccessRequest, NewItemButton } from '../items/item-actions'
import { useWorkspaceScope } from './use-workspace-scope'
import { WorkspaceLoadError } from './workspace-load-error'
import { WorkspaceOverview } from './workspace-overview'
import { WorkspaceStart } from './workspace-start'
import { emptyViewFor } from './workspace-empty-view'

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

/**
 * `/{org}/{project}/{workspace}/overview`: `WsOverview` in its three states —
 * Empty (nothing built), Built with no runs yet, and Active. One request
 * answers the counts, the failing items, the latest runs and the shares;
 * people come from `/scope`, and an empty workspace asks for nothing else.
 */
export function WorkspaceOverviewPage({ slugs }: WorkspaceOverviewPageProps) {
  const scope = useWorkspaceScope(slugs)
  const overview = useWorkspaceOverview(slugs)

  if (!scope) return null
  const workspace = scope.workspace.workspace
  const counts = workspace.counts
  const readOnly = !scope.workspace.viewerCan.edit.allowed
  const view = emptyViewFor({ workflows: counts.workflows, functions: counts.functions })
  const quiet = view === null && counts.runs24h === 0

  function handleRetry() {
    void overview.refetch()
  }

  const topBar = (
    <TopBarContent>
      {readOnly ? (
        <EditAccessRequest slugs={slugs} />
      ) : (
        <NewItemButton slugs={slugs} kind="workflow" disabled={!overview.data} />
      )}
    </TopBarContent>
  )

  let body
  if (overview.isError) {
    body = (
      <WorkspaceLoadError
        what="the overview"
        error={overview.error}
        onRetry={handleRetry}
        retrying={overview.isFetching}
      />
    )
  } else if (!overview.data) {
    body = <OverviewSkeleton />
  } else if (view) {
    body = (
      <WorkspaceStart
        slugs={slugs}
        workspace={workspace}
        projectName={scope.project.project.name}
        sharedIn={overview.data.shared.in}
        readOnly={readOnly}
        canManageConnections={scope.project.viewerCan.manageSettings.allowed}
      />
    )
  } else {
    body = (
      <WorkspaceOverview
        slugs={slugs}
        workspace={workspace}
        overview={overview.data}
        people={scope.workspace.people}
        projectName={scope.project.project.name}
        quiet={quiet}
      />
    )
  }

  return (
    <>
      {topBar}
      <PageBody>
        <PageIntro title={workspace.name} />
        {body}
      </PageBody>
    </>
  )
}
