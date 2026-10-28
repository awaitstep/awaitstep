import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { dashboardApi } from '../../lib/dashboard-api'
import { mockServer } from '../../mocks/dashboard/server'
import type {
  ImportItemInput,
  ItemKind,
  MoveItemsInput,
  NewItemInput,
  WorkspaceItem,
} from '../../types/dashboard/items'
import type { ScopeSlugs } from '../../types/dashboard/scope'
import { toWorkspaceItem } from './api/runs'
import { collectPages } from './export-pages'
import { dashKeys, invalidateAll, withMockContext } from './keys'
import { useMockContext } from './scenario-context'
import { useDashKey, useDataSource } from './source'
import { useWorkspaceId, useWorkspaces } from './workspaces'

type WorkspaceSlugs = Required<ScopeSlugs>

const UNTITLED: Record<ItemKind, string> = {
  workflow: 'Untitled workflow',
  script: 'Untitled function',
}

/** A workspace's own workflows (`'workflow'`) or functions (`'script'`), each with its share switch state. */
export function useWorkspaceItems(slugs: WorkspaceSlugs, kind: ItemKind) {
  const source = useDataSource()
  const ctx = useMockContext()
  const key = useDashKey()
  return useQuery({
    queryKey: key(dashKeys.itemsOf(slugs, kind)),
    queryFn: () =>
      source === 'api'
        ? collectPages((cursor, limit) =>
            dashboardApi.listWorkflows(slugs, { kind, cursor, limit }),
          ).then((rows) => rows.map(toWorkspaceItem))
        : mockServer.items.listItems(ctx, slugs, kind),
  })
}

/** "Shared with Sales": the project's other workspaces' shared items; `kind` omitted = both. */
export function useSharedWithWorkspace(slugs: WorkspaceSlugs, kind?: ItemKind) {
  const ctx = useMockContext()
  return useQuery({
    queryKey: withMockContext(dashKeys.sharedWith(slugs, kind ?? null), ctx),
    queryFn: () => mockServer.items.listSharedWith(ctx, slugs, kind),
  })
}

/** Project settings → Shared library. */
export function useProjectShared(org: string, project: string) {
  const ctx = useMockContext()
  return useQuery({
    queryKey: withMockContext(dashKeys.projectShared(org, project), ctx),
    queryFn: () => mockServer.items.listProjectShared(ctx, org, project),
  })
}

/** What sharing or moving changes: lists, shares, runs, and the counts on cards and scope. */
function itemKeys(slugs: WorkspaceSlugs) {
  return [
    dashKeys.items(slugs.org, slugs.project),
    dashKeys.shared(slugs.org, slugs.project),
    dashKeys.runs(slugs.org, slugs.project),
    dashKeys.inProject('workspaces', slugs.org, slugs.project),
    dashKeys.projects(slugs.org),
    dashKeys.failing(slugs.org),
    dashKeys.activity(slugs.org),
    dashKeys.scope(),
  ]
}

/** The row's "Shared to project" switch. Rejects unsharing while another workspace calls the item. */
export function useSetShared(slugs: WorkspaceSlugs) {
  const ctx = useMockContext()
  const client = useQueryClient()
  return useMutation({
    mutationFn: ({ itemId, shared }: { itemId: string; shared: boolean }) =>
      mockServer.items.setShared(ctx, slugs, itemId, shared),
    onSuccess: () => invalidateAll(client, itemKeys(slugs)),
  })
}

/** Project settings → Shared library: Unshare on any workspace's item. Refused while others call it. */
export function useUnshareItem(org: string, project: string) {
  const ctx = useMockContext()
  const client = useQueryClient()
  return useMutation({
    mutationFn: ({ workspace, itemId }: { workspace: string; itemId: string }) =>
      mockServer.items.setShared(ctx, { org, project, workspace }, itemId, false),
    onSuccess: (_item, { workspace }) =>
      invalidateAll(client, itemKeys({ org, project, workspace })),
  })
}

/** Move workflows: sends items (and their runs) to another workspace in the project. */
export function useMoveWorkflows(slugs: WorkspaceSlugs) {
  const source = useDataSource()
  const ctx = useMockContext()
  const client = useQueryClient()
  const workspaceId = useWorkspaceId(slugs)
  // The dialog that moves lists the project's workspaces, so the target's id is at hand.
  const workspaces = useWorkspaces(slugs.org, slugs.project, { enabled: source === 'api' })
  return useMutation({
    mutationFn: async (input: MoveItemsInput): Promise<{ moved: number }> => {
      if (source !== 'api') return mockServer.items.moveItems(ctx, slugs, input)
      const target = workspaces.data?.find((w) => w.slug === input.to)
      if (!workspaceId || !target) throw new Error('The workspaces have not loaded yet')
      const result = await dashboardApi.moveWorkflows(workspaceId, {
        workflowIds: input.itemIds,
        targetWorkspaceId: target.id,
      })
      return { moved: result.moved.length }
    },
    onSuccess: () => invalidateAll(client, itemKeys(slugs)),
  })
}

/** New workflow / New function: adds a draft at the top of its list. */
export function useCreateItem(slugs: WorkspaceSlugs) {
  const source = useDataSource()
  const ctx = useMockContext()
  const client = useQueryClient()
  return useMutation({
    mutationFn: (input: NewItemInput): Promise<WorkspaceItem> =>
      source === 'api'
        ? dashboardApi
            .createWorkflow(slugs, {
              name: input.name?.trim() || UNTITLED[input.kind],
              kind: input.kind,
            })
            .then((row) =>
              toWorkspaceItem({
                ...row,
                deployStatus: null,
                deployVersionId: null,
                deployedVersion: null,
                lastRunStatus: null,
                lastRunAt: null,
                recentRunStatuses: [],
              }),
            )
        : mockServer.items.createItem(ctx, slugs, input),
    onSuccess: () => invalidateAll(client, itemKeys(slugs)),
  })
}

/** Import: an exported workflow file becomes a draft. Rejects files that aren't exports. */
export function useImportItem(slugs: WorkspaceSlugs) {
  const ctx = useMockContext()
  const client = useQueryClient()
  return useMutation({
    mutationFn: (input: ImportItemInput) => mockServer.items.importItem(ctx, slugs, input),
    onSuccess: () => invalidateAll(client, itemKeys(slugs)),
  })
}
