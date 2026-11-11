import { useState } from 'react'
import { Lock } from 'lucide-react'
import { useSetShared, useSharedWithWorkspace, useWorkspaceItems } from '../../data/dashboard/items'
import { itemPagePath, type WorkspaceSlugs } from '../../lib/dashboard-paths'
import { Banner } from '../ui/banner'
import { ListCard } from '../ui/list-card'
import { SegmentedFilter, type FilterOption } from '../ui/segmented-filter'
import { PageBody, PageIntro } from '../shell/page-intro'
import { TopBarContent } from '../navigation/top-bar-slot'
import { useWorkspaceScope } from '../workspaces/use-workspace-scope'
import { useEmptyView } from '../workspaces/workspace-empty-view'
import { WorkspaceLoadError } from '../workspaces/workspace-load-error'
import { WorkspaceWelcome } from '../workspaces/workspace-welcome'
import { ItemActions, NewItemButton } from './item-actions'
import { filterCounts, matchesFilter, type WorkflowFilter } from './item-format'
import { FunctionRow } from './parts/function-row'
import { ItemLinkRow } from './parts/item-link-row'
import { ItemsPageSkeleton } from './parts/items-page-skeleton'
import { SharedWithSection } from './shared-with-section'

interface FunctionsPageProps {
  slugs: WorkspaceSlugs
}

/** `/{org}/{project}/{workspace}/functions`: the same list as Workflows, for functions. */
export function FunctionsPage({ slugs }: FunctionsPageProps) {
  const scope = useWorkspaceScope(slugs)
  const items = useWorkspaceItems(slugs, 'script')
  const shared = useSharedWithWorkspace(slugs)
  const setShared = useSetShared(slugs)
  const [filter, setFilter] = useState<WorkflowFilter>('all')
  const emptyView = useEmptyView(slugs)

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
    counts.all === 0 ? `No functions in ${workspace.name} yet.` : 'No functions match this filter.'
  const retrying = items.isFetching || shared.isFetching

  let body
  if (failed) {
    body = (
      <WorkspaceLoadError
        what="functions"
        error={items.error ?? shared.error}
        onRetry={handleRetry}
        retrying={retrying}
      />
    )
  } else if (loading) {
    body = <ItemsPageSkeleton label="Loading functions" />
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
          <ListCard label={`Functions in ${workspace.name}`} empty={empty}>
            {visible.map((item) => (
              <FunctionRow
                key={item.id}
                item={item}
                href={itemPagePath(slugs, item, 'overview')}
                projectName={projectName}
                onShareChange={shareHandler(item.id)}
              />
            ))}
          </ListCard>
        </div>
        <div className="md:hidden">
          <ListCard label={`Functions in ${workspace.name}`} empty={empty}>
            {visible.map((item) => (
              <ItemLinkRow key={item.id} item={item} href={itemPagePath(slugs, item, 'overview')} />
            ))}
          </ListCard>
        </div>
        {setShared.error && (
          <p role="alert" className="text-xs text-status-error">
            {setShared.error.message}
          </p>
        )}
        <p className="text-2xs leading-relaxed text-muted-foreground md:hidden">
          Editing a function needs a bigger screen. On a phone you can open it and read its
          overview.
        </p>
        <SharedWithSection slugs={slugs} workspaceName={workspace.name} items={shared.data ?? []} />
      </>
    )
  }

  const description = readOnly
    ? 'You can open functions and read their overview. Building, deploying and sharing need an Editor.'
    : 'Only people with access to this workspace see these. Share one to let other workspaces call it.'

  if (emptyView && !failed) {
    return (
      <PageBody>
        <WorkspaceWelcome slugs={slugs} project={scope.project} workspace={scope.workspace} />
      </PageBody>
    )
  }

  const phoneNew = readOnly ? null : (
    <span className="md:hidden">
      <NewItemButton slugs={slugs} kind="script" disabled={loading} compact />
    </span>
  )
  const filterPills =
    loading || failed ? null : (
      <SegmentedFilter
        label="Filter functions"
        options={options}
        value={filter}
        onChange={setFilter}
      />
    )

  return (
    <>
      <TopBarContent>
        <ItemActions slugs={slugs} kind="script" readOnly={readOnly} loading={loading} />
      </TopBarContent>
      <PageBody>
        <PageIntro
          title="Functions"
          description={description}
          action={phoneNew}
          aside={filterPills}
        />
        {body}
      </PageBody>
    </>
  )
}
