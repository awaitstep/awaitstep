import { useState } from 'react'
import { Plus } from 'lucide-react'
import { useLibrarySummary } from '../../data/dashboard/library'
import { libraryCodePath, type LibraryPlaceSlugs } from '../../lib/dashboard-paths'
import type { ApiLibraryRow, LibraryKind } from '../../lib/library-api'
import { Button, buttonVariants } from '../ui/button'
import { SegmentedFilter, type FilterOption } from '../ui/segmented-filter'
import { ShellLink } from '../ui/shell-link'
import { ListCardSkeleton, LoadingRegion } from '../ui/skeletons'
import { useGoTo } from '../navigation/router-shell-link'
import { PageBody, PageIntro } from '../shell/page-intro'
import { TopBarContent } from '../navigation/top-bar-slot'
import { WorkspaceLoadError } from '../workspaces/workspace-load-error'
import { OverviewCard } from '../workspaces/parts/overview-card'
import { LibraryDialogs, type LibraryDialog } from './library-dialogs'
import { matchesKind, type KindFilter } from './library-format'
import { LibraryEmpty } from './parts/library-empty'
import type { LibraryRowAction } from './parts/library-row-menu'
import { LibraryTable } from './parts/library-table'
import { MarketplaceTable } from './parts/marketplace-table'

interface LibraryPageProps {
  place: LibraryPlaceSlugs
  /** "Sales", or the project's name on its own Library. */
  placeName: string
  projectName: string
}

/**
 * A place's Library (28a workspace, 28b project, 28c empty): what it owns,
 * editable, and below it what it may use read-only — the project's items in
 * a workspace, the installed marketplace nodes in the project.
 */
export function LibraryPage({ place, placeName, projectName }: LibraryPageProps) {
  const summary = useLibrarySummary(place)
  const goTo = useGoTo()
  const [filter, setFilter] = useState<KindFilter>('all')
  const [dialog, setDialog] = useState<LibraryDialog | null>(null)
  const inWorkspace = place.workspace !== undefined
  const canCreate = summary.data?.viewerCan.create.allowed ?? false
  const projectPlace = { org: place.org, project: place.project }

  function handleNew(kind: LibraryKind) {
    setDialog({ kind: 'new', itemKind: kind })
  }

  function handleNewModule() {
    handleNew('module')
  }

  function handleNewNode() {
    handleNew('node')
  }

  function handleOpen(row: ApiLibraryRow) {
    goTo(libraryCodePath(place, { item: row.id }))
  }

  function handleAction(action: LibraryRowAction, row: ApiLibraryRow) {
    setDialog({ kind: action, item: row })
  }

  function handleCloseDialog() {
    setDialog(null)
  }

  function handleRetry() {
    void summary.refetch()
  }

  function ownHref(row: ApiLibraryRow) {
    return libraryCodePath(place, { item: row.id })
  }

  function projectHref(row: ApiLibraryRow) {
    return libraryCodePath(projectPlace, { item: row.id })
  }

  let body
  if (summary.isError) {
    body = (
      <WorkspaceLoadError
        what="the library"
        error={summary.error}
        onRetry={handleRetry}
        retrying={summary.isFetching}
      />
    )
  } else if (!summary.data) {
    body = (
      <LoadingRegion label="Loading the library">
        <ListCardSkeleton rows={3} />
      </LoadingRegion>
    )
  } else {
    const data = summary.data
    const own = data.own.filter((row) => matchesKind(row, filter))
    const fromProject = data.fromProject.filter((row) => matchesKind(row, filter))
    // The pills count the place's own items, as the summary does in SQL.
    const options: FilterOption<KindFilter>[] = [
      { id: 'all', label: 'All', count: data.counts.module + data.counts.node },
      { id: 'module', label: 'Modules', count: data.counts.module },
      { id: 'node', label: 'Nodes', count: data.counts.node },
    ]
    const nothing =
      data.own.length === 0 && data.fromProject.length === 0 && data.marketplace.length === 0
    body = nothing ? (
      <LibraryEmpty
        placeName={placeName}
        canCreate={canCreate}
        onNewModule={handleNewModule}
        onNewNode={handleNewNode}
      />
    ) : (
      <>
        <SegmentedFilter label="Kind" options={options} value={filter} onChange={setFilter} />
        <OverviewCard
          title={`In ${placeName}`}
          caption={inWorkspace ? 'Editable here · bundled into what imports them' : 'Editable here'}
        >
          <LibraryTable
            caption={`Library items in ${placeName}`}
            rows={own}
            empty={
              data.own.length === 0 ? `Nothing in ${placeName} yet.` : 'Nothing of this kind here.'
            }
            hrefOf={ownHref}
            canEdit={canCreate}
            onOpen={handleOpen}
            onAction={handleAction}
          />
        </OverviewCard>
        {inWorkspace ? (
          <section className="overflow-hidden rounded-2xl border border-dashed border-border">
            <div className="flex flex-wrap items-center gap-2.5 border-b border-border px-5 py-4">
              <h2 className="text-sm font-semibold text-foreground">From {projectName}</h2>
              <span className="flex-1 text-xs text-muted-foreground">Read-only here</span>
            </div>
            <LibraryTable
              caption={`Library items from ${projectName}`}
              rows={fromProject}
              empty={`Nothing in ${projectName}’s library yet.`}
              hrefOf={projectHref}
              readOnly
            />
          </section>
        ) : (
          <section className="overflow-hidden rounded-2xl border border-dashed border-border">
            <div className="flex flex-wrap items-center gap-2.5 border-b border-border px-5 py-4">
              <h2 className="text-sm font-semibold text-foreground">From the marketplace</h2>
              <span className="flex-1 text-xs text-muted-foreground">Read-only here</span>
            </div>
            <MarketplaceTable rows={filter === 'module' ? [] : data.marketplace} />
          </section>
        )}
        <p className="text-2xs text-muted-foreground">
          Workflows pick up the latest published version on their next deploy.
        </p>
      </>
    )
  }

  return (
    <>
      <TopBarContent>
        <ShellLink
          href={libraryCodePath(place)}
          className={buttonVariants({ variant: 'outline', size: 'sm' })}
        >
          Open IDE
        </ShellLink>
        {canCreate && (
          <>
            <Button type="button" variant="outline" size="sm" onClick={handleNewNode}>
              New node
            </Button>
            <Button type="button" size="sm" onClick={handleNewModule}>
              <Plus aria-hidden="true" />
              New module
            </Button>
          </>
        )}
      </TopBarContent>
      <PageBody>
        <PageIntro
          title="Library"
          description={
            inWorkspace
              ? 'Code this workspace owns, plus the project’s.'
              : 'Code this project owns. Every workspace in it can use these.'
          }
        />
        {body}
      </PageBody>
      {dialog && (
        <LibraryDialogs
          place={place}
          dialog={dialog}
          canEdit={canCreate}
          onClose={handleCloseDialog}
        />
      )}
    </>
  )
}
