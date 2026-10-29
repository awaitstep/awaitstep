import { useState } from 'react'
import { Plus } from 'lucide-react'
import { useProjectShared, useUnshareItem } from '../../data/dashboard/items'
import { itemPath, type ProjectSlugs } from '../../lib/dashboard-paths'
import { cn } from '../../lib/utils'
import { timeAgoOrDay } from '../../lib/time'
import type { SharedItem } from '../../types/dashboard/items'
import { Banner } from '../ui/banner'
import { BlockedAction } from '../ui/blocked-action'
import { Button } from '../ui/button'
import { DataTable, type DataColumn } from '../ui/data-table'
import { ShellLink } from '../ui/shell-link'
import { ListCardSkeleton, LoadingRegion } from '../ui/skeletons'
import { WORKSPACE_TILE_CLASS } from '../ui/workspace-colour'
import { ScopeChip } from '../ui/workspace-dot'
import { PageBody, PageIntro } from '../shell/page-intro'
import { TopBarContent } from '../navigation/top-bar-slot'
import { ITEM_KIND_LABEL } from '../items/item-kind'
import { LibraryExplainerDialog } from '../library/library-explainer-dialog'
import { WorkspaceLoadError } from '../workspaces/workspace-load-error'
import { OverviewCard } from '../workspaces/parts/overview-card'
import { useProjectScope } from './use-project-scope'

interface SharedLibraryPageProps {
  slugs: ProjectSlugs
}

function firstName(name: string): string {
  return name.split(' ')[0] ?? name
}

function usedByLabel(item: SharedItem): string {
  if (item.usedBy.length === 0) return `Not used outside ${item.from.name} yet`
  return `Called by ${item.usedBy.map((w) => w.name).join(', ')}`
}

/** Why Unshare is blocked, or nothing when it isn't. */
function unshareReason(item: SharedItem): string | undefined {
  return item.unshare.allowed ? undefined : item.unshare.reason
}

function ItemCell({ item, org }: { item: SharedItem; org: string }) {
  const version = item.version === null ? 'Draft' : `v${item.version}`
  return (
    <span className="flex min-w-0 items-center gap-3">
      <span
        aria-hidden="true"
        className={cn(
          'flex size-8 shrink-0 items-center justify-center rounded-lg text-xs font-semibold',
          WORKSPACE_TILE_CLASS[item.from.colour],
        )}
      >
        {item.kind === 'script' ? 'ƒ' : 'W'}
      </span>
      <span className="flex min-w-0 flex-col gap-0.5">
        {item.canOpen ? (
          <ShellLink
            href={itemPath(org, item)}
            className="truncate text-sm font-semibold text-foreground hover:underline"
          >
            {item.name}
          </ShellLink>
        ) : (
          <span className="truncate text-sm font-semibold text-foreground">{item.name}</span>
        )}
        <span className="text-2xs text-muted-foreground">
          {ITEM_KIND_LABEL[item.kind]} · {version}
        </span>
      </span>
    </span>
  )
}

/** `/{org}/{project}/settings/shared` (`ProjectShared`): what workspaces shared, and what the project owns. */
export function SharedLibraryPage({ slugs }: SharedLibraryPageProps) {
  const scope = useProjectScope(slugs)
  const shared = useProjectShared(slugs.org, slugs.project)
  const unshare = useUnshareItem(slugs.org, slugs.project)
  const [explainerOpen, setExplainerOpen] = useState(false)

  if (!scope) return null
  const project = scope.project.project
  const canManage = scope.project.viewerCan.manageSettings.allowed

  function handleUnshare(item: SharedItem) {
    unshare.mutate({ workspace: item.from.slug, itemId: item.id })
  }

  function handleNewModule() {
    setExplainerOpen(true)
  }

  function handleCloseExplainer() {
    setExplainerOpen(false)
  }

  function handleRetry() {
    void shared.refetch()
  }

  const columns: DataColumn<SharedItem>[] = [
    { id: 'item', header: 'Item', cell: (item) => <ItemCell item={item} org={slugs.org} /> },
    {
      id: 'from',
      header: 'From',
      width: '120px',
      cell: (item) => <ScopeChip colour={item.from.colour}>{item.from.name}</ScopeChip>,
    },
    {
      id: 'used',
      header: 'Used by',
      cell: (item) => <span className="text-xs text-muted-foreground">{usedByLabel(item)}</span>,
    },
    {
      id: 'shared',
      header: 'Shared',
      width: '180px',
      cell: (item) => (
        <span className="text-xs text-muted-foreground">
          Shared {timeAgoOrDay(item.sharedAt)} by {firstName(item.sharedBy.name)}
        </span>
      ),
    },
    {
      id: 'action',
      header: '',
      width: '200px',
      cell: (item) => (
        <span className="flex flex-col items-start gap-1">
          <BlockedAction reason={unshareReason(item)}>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={unshare.isPending}
              onClick={() => handleUnshare(item)}
            >
              Unshare
            </Button>
          </BlockedAction>
        </span>
      ),
    },
  ]

  let body
  if (shared.isError) {
    body = (
      <WorkspaceLoadError
        what="the shared library"
        error={shared.error}
        onRetry={handleRetry}
        retrying={shared.isFetching}
      />
    )
  } else if (!shared.data) {
    body = (
      <LoadingRegion label="Loading the shared library">
        <ListCardSkeleton rows={3} trailing={3} />
      </LoadingRegion>
    )
  } else {
    body = (
      <>
        {unshare.error && <Banner tone="warn">{unshare.error.message}</Banner>}
        <OverviewCard
          title="Shared by workspaces"
          caption="Unshare is blocked while another workspace uses the item"
        >
          <DataTable
            caption={`Items shared by workspaces in ${project.name}`}
            columns={columns}
            rows={shared.data}
            getRowKey={(item) => item.id}
            empty={`No workspace in ${project.name} has shared anything yet.`}
            minWidth="880px"
            framed={false}
          />
        </OverviewCard>
        <OverviewCard
          title={`Owned by ${project.name}`}
          caption="Shared with every workspace by definition"
        >
          <p className="px-5 py-8 text-center text-xs text-muted-foreground">
            Project modules arrive with modules, coming soon.
          </p>
        </OverviewCard>
      </>
    )
  }

  return (
    <>
      {canManage && (
        <TopBarContent>
          <Button type="button" size="sm" onClick={handleNewModule}>
            <Plus aria-hidden="true" />
            New project module
          </Button>
        </TopBarContent>
      )}
      <PageBody>
        <PageIntro
          title="Shared library"
          description={`Everything any workspace in ${project.name} can use: items workspaces shared, and the project’s own.`}
        />
        {body}
      </PageBody>
      {explainerOpen && (
        <LibraryExplainerDialog
          kind="module"
          title="New project module"
          onClose={handleCloseExplainer}
        />
      )}
    </>
  )
}
