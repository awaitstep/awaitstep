import { useState } from 'react'
import { Lock } from 'lucide-react'
import { useSetShared, useSharedWithWorkspace, useWorkspaceItems } from '../../data/dashboard/items'
import type { WorkspaceSlugs } from '../../lib/dashboard-paths'
import { Banner } from '../ui/banner'
import { ListCard } from '../ui/list-card'
import { SegmentedFilter, type FilterOption } from '../ui/segmented-filter'
import { Bone, FilterSkeleton, ListCardSkeleton, LoadingRegion } from '../ui/skeletons'
import { PageBody, PageIntro } from '../shell/page-intro'
import { TopBarContent } from '../navigation/top-bar-slot'
import { useWorkspaceScope } from '../workspaces/use-workspace-scope'
import { useEmptyView } from '../workspaces/workspace-empty-view'
import { WorkspaceLoadError } from '../workspaces/workspace-load-error'
import { WorkspaceWelcome } from '../workspaces/workspace-welcome'
import { ImportItemDialog } from './import-item-dialog'
import { ItemActions, NewItemButton } from './item-actions'
import { filterCounts, itemHref, matchesFilter, type WorkflowFilter } from './item-format'
import { ItemLinkRow } from './parts/item-link-row'
import { WorkflowRow } from './parts/workflow-row'
import { SharedWithSection } from './shared-with-section'

interface WorkflowsPageProps {
  slugs: WorkspaceSlugs
  /** `?new=import` opens the import dialog (the top bar's Import, or P1's New project → Import). */
  dialog: string | undefined
  onCloseDialog: () => void
}

function WorkflowsSkeleton() {
  return (
    <LoadingRegion label="Loading workflows">
      <div className="flex justify-end">
        <FilterSkeleton />
      </div>
      <ListCardSkeleton />
      <div className="flex flex-col gap-3.5">
        <Bone className="h-5 w-48" />
        <div className="grid grid-cols-1 gap-3.5 md:grid-cols-2">
          <Bone className="h-[78px] rounded-2xl" />
          <Bone className="h-[78px] rounded-2xl" />
        </div>
      </div>
    </LoadingRegion>
  )
}

/** `/{org}/{project}/{workspace}/workflows`: the `Workflows` and `ViewerWorkflows` boards. */
export function WorkflowsPage({ slugs, dialog, onCloseDialog }: WorkflowsPageProps) {
  const scope = useWorkspaceScope(slugs)
  const items = useWorkspaceItems(slugs, 'workflow')
  const shared = useSharedWithWorkspace(slugs)
  const setShared = useSetShared(slugs)
  const [filter, setFilter] = useState<WorkflowFilter>('all')
  const emptyView = useEmptyView(slugs, scope?.project.project.workspaces.length ?? 0)

  if (!scope) return null
  const workspace = scope.workspace.workspace
  const projectName = scope.project.project.name
  const readOnly = !scope.workspace.viewerCan.edit.allowed
  const loading = !items.data || !shared.data
  const failed = items.isError || shared.isError

  function handleRetry() {
    for (const query of [items, shared]) {
      if (query.isError) void query.refetch()
    }
  }

  function handleDialogChange(open: boolean) {
    if (!open) onCloseDialog()
  }

  function shareHandler(itemId: string) {
    return (next: boolean) => setShared.mutate({ itemId, shared: next })
  }

  const counts = filterCounts(items.data ?? [])
  const options: FilterOption<WorkflowFilter>[] = [
    { id: 'all', label: 'All', count: counts.all },
    { id: 'deployed', label: 'Deployed', count: counts.deployed },
    { id: 'draft', label: 'Drafts', count: counts.draft },
    { id: 'failing', label: 'Failing', count: counts.failing, tone: 'danger' },
  ]
  const visible = (items.data ?? []).filter((item) => matchesFilter(item, filter))
  const empty =
    counts.all === 0 ? `No workflows in ${workspace.name} yet.` : 'No workflows match this filter.'

  const retrying = items.isFetching || shared.isFetching

  let body
  if (failed) {
    body = (
      <WorkspaceLoadError
        what="workflows"
        error={items.error ?? shared.error}
        onRetry={handleRetry}
        retrying={retrying}
      />
    )
  } else if (loading) {
    body = <WorkflowsSkeleton />
  } else {
    body = (
      <>
        {readOnly && (
          <Banner tone="info" icon={Lock}>
            Read-only in {workspace.name}. Buttons you can’t use are hidden or greyed out, never
            broken.
          </Banner>
        )}
        <div className="hidden md:block">
          <ListCard label={`Workflows in ${workspace.name}`} empty={empty}>
            {visible.map((item) => (
              <WorkflowRow
                key={item.id}
                item={item}
                href={itemHref(item.id)}
                projectName={projectName}
                onShareChange={shareHandler(item.id)}
              />
            ))}
          </ListCard>
        </div>
        <div className="md:hidden">
          <ListCard label={`Workflows in ${workspace.name}`} empty={empty}>
            {visible.map((item) => (
              <ItemLinkRow key={item.id} item={item} href={itemHref(item.id)} />
            ))}
          </ListCard>
        </div>
        {setShared.error && (
          <p role="alert" className="text-xs text-status-error">
            {setShared.error.message}
          </p>
        )}
        <p className="text-2xs leading-relaxed text-muted-foreground md:hidden">
          Editing a workflow’s graph needs a bigger screen. On a phone you can read runs, retry, and
          deploy or roll back.
        </p>
        <SharedWithSection
          workspaceName={workspace.name}
          projectName={projectName}
          items={shared.data ?? []}
        />
      </>
    )
  }

  const description = readOnly
    ? 'You can open workflows and read their runs. Building, deploying and sharing need an Editor.'
    : `Only people with access to ${workspace.name} see these. Share one to let other workspaces call it.`

  const importDialog = dialog === 'import' && !readOnly && (
    <ImportItemDialog
      open
      onOpenChange={handleDialogChange}
      slugs={slugs}
      workspaceName={workspace.name}
    />
  )

  if (emptyView && !failed) {
    return (
      <>
        <PageBody>
          <WorkspaceWelcome view={emptyView} slugs={slugs} {...scope} />
        </PageBody>
        {importDialog}
      </>
    )
  }

  const phoneNew = readOnly ? null : (
    <span className="md:hidden">
      <NewItemButton slugs={slugs} kind="workflow" disabled={loading} compact />
    </span>
  )
  const filterPills =
    loading || failed ? null : (
      <SegmentedFilter
        label="Filter workflows"
        options={options}
        value={filter}
        onChange={setFilter}
      />
    )

  return (
    <>
      <TopBarContent>
        <ItemActions slugs={slugs} kind="workflow" readOnly={readOnly} loading={loading} />
      </TopBarContent>
      <PageBody>
        <PageIntro
          title="Workflows"
          description={description}
          action={phoneNew}
          aside={filterPills}
        />
        {body}
      </PageBody>
      {importDialog}
    </>
  )
}
