import { useMemo } from 'react'
import { Info, Lock } from 'lucide-react'
import { useWorkspaceItems } from '../../data/dashboard/items'
import { itemPath, type WorkspaceSlugs } from '../../lib/dashboard-paths'
import type { WorkspaceItem } from '../../types/dashboard/items'
import { Badge } from '../ui/badge'
import { Banner } from '../ui/banner'
import { DataTable, type DataColumn } from '../ui/data-table'
import { ShellLink } from '../ui/shell-link'
import { ListCardSkeleton, LoadingRegion } from '../ui/skeletons'
import { Tile } from '../ui/tile'
import { PageBody, PageIntro } from '../shell/page-intro'
import { TopBarContent } from '../navigation/top-bar-slot'
import { useWorkspaceScope } from '../workspaces/use-workspace-scope'
import { useEmptyView } from '../workspaces/workspace-empty-view'
import { WorkspaceLoadError } from '../workspaces/workspace-load-error'
import { WorkspaceWelcome } from '../workspaces/workspace-welcome'
import { ItemActions, NewItemButton } from './item-actions'
import { functionSummary, statusLabel, statusVariant, trafficLabel } from './item-format'
import { TrafficBars } from './parts/traffic-bars'

function functionColumns(slugs: WorkspaceSlugs): DataColumn<WorkspaceItem>[] {
  return [
    {
      id: 'function',
      header: 'Function',
      cell: (item) => (
        <span className="flex min-w-0 items-center gap-3">
          <Tile tone="info" size="sm">
            ƒ
          </Tile>
          <span className="flex min-w-0 flex-col gap-0.5">
            <ShellLink
              href={itemPath(slugs, item)}
              className="w-fit truncate text-sm font-semibold text-foreground hover:underline"
            >
              {item.name}
            </ShellLink>
            <span className="truncate text-2xs text-muted-foreground">{functionSummary(item)}</span>
          </span>
        </span>
      ),
    },
    {
      id: 'status',
      header: 'Status',
      width: '130px',
      cell: (item) => <Badge variant={statusVariant(item)}>{statusLabel(item)}</Badge>,
    },
    {
      id: 'last24h',
      header: 'Last 24 h',
      width: '160px',
      cell: (item) =>
        item.traffic ? (
          <TrafficBars buckets={item.traffic.buckets} />
        ) : (
          <span className="text-muted-foreground">No requests yet</span>
        ),
    },
    {
      id: 'traffic',
      header: 'Traffic',
      width: '190px',
      cell: (item) => (
        <span className="text-muted-foreground">
          {item.traffic ? trafficLabel(item.traffic) : '—'}
        </span>
      ),
    },
    {
      id: 'sharing',
      header: 'Sharing',
      width: '110px',
      // The board draws a pill, not a switch (D-P2-9).
      cell: (item) =>
        item.sharing ? (
          <Badge variant="success">Shared</Badge>
        ) : (
          <Badge variant="neutral">Private</Badge>
        ),
    },
  ]
}

interface FunctionsPageProps {
  slugs: WorkspaceSlugs
}

/** `/{org}/{project}/{workspace}/functions`: the `WsFunctions` board. */
export function FunctionsPage({ slugs }: FunctionsPageProps) {
  const scope = useWorkspaceScope(slugs)
  const items = useWorkspaceItems(slugs, 'script')
  const { org: orgSlug, project: projectSlug, workspace: workspaceSlug } = slugs
  // Built once per workspace, so the table keeps the same columns between renders.
  const columns = useMemo(
    () => functionColumns({ org: orgSlug, project: projectSlug, workspace: workspaceSlug }),
    [orgSlug, projectSlug, workspaceSlug],
  )
  const emptyView = useEmptyView(slugs)

  if (!scope) return null
  const workspace = scope.workspace.workspace
  const readOnly = !scope.workspace.viewerCan.edit.allowed
  const loading = !items.data

  if (emptyView && !items.isError) {
    return (
      <PageBody>
        <WorkspaceWelcome slugs={slugs} project={scope.project} workspace={scope.workspace} />
      </PageBody>
    )
  }

  function handleRetry() {
    void items.refetch()
  }

  let body
  if (items.isError) {
    body = (
      <WorkspaceLoadError
        what="functions"
        error={items.error}
        onRetry={handleRetry}
        retrying={items.isFetching}
      />
    )
  } else if (!items.data) {
    body = (
      <LoadingRegion label="Loading functions">
        <ListCardSkeleton rows={2} />
      </LoadingRegion>
    )
  } else {
    body = (
      <>
        {readOnly && (
          <Banner tone="info" icon={Lock}>
            Read-only in {workspace.name}. Buttons you can’t use are hidden or greyed out, never
            broken.
          </Banner>
        )}
        <DataTable
          caption={`Functions in ${workspace.name}`}
          columns={columns}
          rows={items.data}
          getRowKey={(item) => item.id}
          empty={`No functions in ${workspace.name} yet.`}
          minWidth="860px"
        />
        <p className="flex items-center gap-2 text-xs text-muted-foreground">
          <Info className="size-3.5 shrink-0" aria-hidden="true" />
          Functions answer requests straight away. For steps that wait, retry or resume, create a
          workflow instead.
        </p>
      </>
    )
  }

  const phoneNew = readOnly ? null : (
    <span className="md:hidden">
      <NewItemButton slugs={slugs} kind="script" disabled={loading} compact />
    </span>
  )

  return (
    <>
      <TopBarContent>
        <ItemActions slugs={slugs} kind="script" readOnly={readOnly} loading={loading} />
      </TopBarContent>
      <PageBody>
        <PageIntro
          title="Functions"
          description="Request handlers in this workspace."
          action={phoneNew}
        />
        {body}
      </PageBody>
    </>
  )
}
