import { useState } from 'react'
import { Plus } from 'lucide-react'
import { useWorkspaceLibrary } from '../../data/dashboard/library'
import type { WorkspaceSlugs } from '../../lib/dashboard-paths'
import { Button } from '../ui/button'
import { ListCardSkeleton, LoadingRegion } from '../ui/skeletons'
import { PageBody, PageIntro } from '../shell/page-intro'
import { TopBarContent } from '../navigation/top-bar-slot'
import { useWorkspaceScope } from '../workspaces/use-workspace-scope'
import { WorkspaceLoadError } from '../workspaces/workspace-load-error'
import { OverviewCard } from '../workspaces/parts/overview-card'
import { LibraryExplainerDialog, type LibraryExplainer } from './library-explainer-dialog'

interface LibraryPageProps {
  slugs: WorkspaceSlugs
}

/**
 * `/{org}/{project}/{workspace}/library`: the `WsLibrary` board's frame, empty
 * until modules and resources land (W2). New module / New resource explain
 * what they will make (D-P2-7).
 */
export function LibraryPage({ slugs }: LibraryPageProps) {
  const scope = useWorkspaceScope(slugs)
  const library = useWorkspaceLibrary(slugs)
  const [explainer, setExplainer] = useState<LibraryExplainer | null>(null)

  if (!scope) return null
  const workspace = scope.workspace.workspace
  const projectName = scope.project.project.name
  const readOnly = !scope.workspace.viewerCan.edit.allowed

  function handleNewModule() {
    setExplainer('module')
  }

  function handleNewResource() {
    setExplainer('resource')
  }

  function handleClose() {
    setExplainer(null)
  }

  function handleRetry() {
    void library.refetch()
  }

  let body
  if (library.isError) {
    body = (
      <WorkspaceLoadError
        what="the library"
        error={library.error}
        onRetry={handleRetry}
        retrying={library.isFetching}
      />
    )
  } else if (!library.data) {
    body = (
      <LoadingRegion label="Loading the library">
        <ListCardSkeleton rows={3} />
      </LoadingRegion>
    )
  } else {
    body = (
      <>
        <OverviewCard
          title={`In ${workspace.name}`}
          caption="Modules are bundled into the workflows that import them; resources are nodes you write"
        >
          <p className="px-5 py-8 text-center text-xs text-muted-foreground">
            No modules or resources in {workspace.name} yet. They arrive with modules, coming soon.
          </p>
        </OverviewCard>
        <section className="overflow-hidden rounded-2xl border border-dashed border-border">
          <div className="flex flex-wrap items-center gap-2.5 border-b border-border px-5 py-4">
            <h2 className="text-sm font-semibold text-foreground">From {projectName}</h2>
            <span className="flex-1 text-xs text-muted-foreground">
              Read-only here; their owners publish new versions
            </span>
          </div>
          <p className="px-5 py-8 text-center text-xs text-muted-foreground">
            Nothing shared from {projectName} yet.
          </p>
        </section>
      </>
    )
  }

  return (
    <>
      {!readOnly && (
        <TopBarContent>
          <Button type="button" variant="outline" size="sm" onClick={handleNewResource}>
            New resource
          </Button>
          <Button type="button" size="sm" onClick={handleNewModule}>
            <Plus aria-hidden="true" />
            New module
          </Button>
        </TopBarContent>
      )}
      <PageBody>
        <PageIntro
          title="Library"
          description={`Code and nodes ${workspace.name} builds with: its own, plus what the project shares.`}
        />
        {body}
      </PageBody>
      {explainer && <LibraryExplainerDialog kind={explainer} onClose={handleClose} />}
    </>
  )
}
