import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { defineToast } from '../../lib/action-toast'
import { dashboardApi } from '../../lib/dashboard-api'
import { parseImportFile } from '../../lib/workflows/import-file'
import { mockServer } from '../../mocks/dashboard/server'
import type {
  ImportItemInput,
  ItemKind,
  MoveItemsInput,
  NewItemInput,
  WorkspaceItem,
} from '../../types/dashboard/items'
import type { Allowed, ScopeSlugs } from '../../types/dashboard/scope'
import { useApi } from '../../contexts/api-client-context'
import { toWorkspaceItem } from './api/runs'
import { toSharedItem } from './api/sharing'
import { collectPages } from './export-pages'
import { dashKeys, invalidateAll } from './keys'
import { useProjectId } from './projects'
import { useMockContext } from './scenario-context'
import { useDashKey, useDataSource } from './source'
import { useScope, useWorkspaceId, useWorkspaces } from './workspaces'

type WorkspaceSlugs = Required<ScopeSlugs>

const UNTITLED: Record<ItemKind, string> = {
  workflow: 'Untitled workflow',
  script: 'Untitled function',
}

// The switch stays off until the workspace's scope says whether the viewer may share.
const SHARE_PENDING: Allowed = { allowed: false }

/** The viewer's `share` capability in the workspace, from the scope the page already resolved. */
function useShareCapability(slugs: WorkspaceSlugs): Allowed {
  const scope = useScope(slugs)
  return (scope.data?.found ? scope.data.workspace?.viewerCan.share : undefined) ?? SHARE_PENDING
}

/** A workspace's own workflows (`'workflow'`) or functions (`'script'`), each with its share switch state. */
export function useWorkspaceItems(slugs: WorkspaceSlugs, kind: ItemKind) {
  const source = useDataSource()
  const ctx = useMockContext()
  const key = useDashKey()
  const share = useShareCapability(slugs)
  return useQuery({
    queryKey: key(dashKeys.itemsOf(slugs, kind)),
    queryFn: () =>
      source === 'api'
        ? collectPages((cursor, limit) =>
            dashboardApi.listWorkflows(slugs, { kind, cursor, limit }),
          ).then((rows) => rows.map((row) => toWorkspaceItem(row, SHARE_PENDING)))
        : mockServer.items.listItems(ctx, slugs, kind),
    // The API's rows carry no capability: the switch's state is the scope's.
    select:
      source === 'api'
        ? (items: WorkspaceItem[]) => items.map((item) => ({ ...item, shareToggle: share }))
        : undefined,
  })
}

/** A workflow page's current version, deploys and runs, in one request. */
export function useWorkflowPageSummary(workflowId: string, ready: boolean) {
  const key = useDashKey()
  const api = useApi()
  return useQuery({
    queryKey: key(dashKeys.workflowSummary(workflowId)),
    queryFn: () => api.getWorkflowPageSummary(workflowId),
    enabled: ready,
    staleTime: 30_000,
  })
}

/** "Shared with Sales": the project's other workspaces' shared items; `kind` omitted = both. */
export function useSharedWithWorkspace(slugs: WorkspaceSlugs, kind?: ItemKind) {
  const source = useDataSource()
  const ctx = useMockContext()
  const key = useDashKey()
  const workspaceId = useWorkspaceId(slugs)
  return useQuery({
    queryKey: key(dashKeys.sharedWith(slugs, kind ?? null)),
    queryFn: () =>
      source === 'api'
        ? collectPages((cursor, limit) =>
            dashboardApi.listSharedWith(workspaceId!, { kind, cursor, limit }),
          ).then((rows) => rows.map(toSharedItem))
        : mockServer.items.listSharedWith(ctx, slugs, kind),
    enabled: source !== 'api' || workspaceId !== null,
  })
}

/** Project settings → Shared library. */
export function useProjectShared(org: string, project: string) {
  const source = useDataSource()
  const ctx = useMockContext()
  const key = useDashKey()
  const projectId = useProjectId(org, project)
  return useQuery({
    queryKey: key(dashKeys.projectShared(org, project)),
    queryFn: () =>
      source === 'api'
        ? collectPages((cursor, limit) =>
            dashboardApi.listProjectShared(org, projectId!, { cursor, limit }),
          ).then((rows) => rows.map(toSharedItem))
        : mockServer.items.listProjectShared(ctx, org, project),
    enabled: source !== 'api' || projectId !== null,
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
    dashKeys.setup(slugs.org, slugs.project),
    dashKeys.workspaceOverview(slugs),
    dashKeys.scope(),
  ]
}

/** Shares or unshares one item in `slugs`' workspace, on either source. */
function useShareWrite() {
  const source = useDataSource()
  const ctx = useMockContext()
  return async (slugs: WorkspaceSlugs, itemId: string, shared: boolean): Promise<void> => {
    if (source === 'api') await dashboardApi.setWorkflowShared(slugs, itemId, shared)
    else await mockServer.items.setShared(ctx, slugs, itemId, shared)
  }
}

/** The row's "Shared to project" switch. The dummy server refuses unsharing while another workspace calls it. */
export function useSetShared(slugs: WorkspaceSlugs) {
  const write = useShareWrite()
  const client = useQueryClient()
  return useMutation({
    meta: {
      toast: defineToast<{ itemId: string; shared: boolean }>({
        success: (v) => (v.shared ? 'Shared to the project' : 'Unshared'),
        error: (v) => (v.shared ? 'Couldn’t share it' : 'Couldn’t unshare it'),
      }),
    },
    mutationFn: ({ itemId, shared }: { itemId: string; shared: boolean }) =>
      write(slugs, itemId, shared),
    onSuccess: () => invalidateAll(client, itemKeys(slugs)),
  })
}

/** Project settings → Shared library: Unshare on any workspace's item, as its own workspace would. */
export function useUnshareItem(org: string, project: string) {
  const write = useShareWrite()
  const client = useQueryClient()
  return useMutation({
    meta: { toast: { success: 'Unshared', error: 'Couldn’t unshare it' } },
    mutationFn: ({ workspace, itemId }: { workspace: string; itemId: string }) =>
      write({ org, project, workspace }, itemId, false),
    onSuccess: (_result, { workspace }) =>
      invalidateAll(client, itemKeys({ org, project, workspace })),
  })
}

function movedLine(moved: number): string {
  if (moved === 0) return 'No workflows moved'
  return moved === 1 ? 'Workflow moved' : `${moved} workflows moved`
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
    meta: {
      toast: defineToast<MoveItemsInput, { moved: number }>({
        success: (_, data) => movedLine(data.moved),
        error: 'Couldn’t move the workflows',
      }),
    },
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

interface CreateItemOptions {
  /**
   * Runs once it exists, before the lists refetch. It runs even if the
   * button that asked has gone: the refetch can end the empty state it sat in.
   */
  onCreated?: (item: WorkspaceItem) => void
}

/** New workflow / New function: adds a draft at the top of its list. */
export function useCreateItem(slugs: WorkspaceSlugs, { onCreated }: CreateItemOptions = {}) {
  const source = useDataSource()
  const ctx = useMockContext()
  const client = useQueryClient()
  const share = useShareCapability(slugs)
  return useMutation({
    meta: {
      toast: defineToast<NewItemInput>({
        success: (v) => (v.kind === 'script' ? 'Function created' : 'Workflow created'),
        error: (v) => `Couldn’t create the ${v.kind === 'script' ? 'function' : 'workflow'}`,
      }),
    },
    mutationFn: (input: NewItemInput): Promise<WorkspaceItem> =>
      source === 'api'
        ? dashboardApi
            .createWorkflow(slugs, {
              name: input.name?.trim() || UNTITLED[input.kind],
              description: input.description?.trim() || undefined,
              kind: input.kind,
            })
            .then((row) => toWorkspaceItem(newDraftRow(row), share))
        : mockServer.items.createItem(ctx, slugs, input),
    onSuccess: (item) => {
      onCreated?.(item)
      return invalidateAll(client, itemKeys(slugs))
    },
  })
}

/** The row a create answers, as the lists show a never-deployed draft. */
function newDraftRow(row: Awaited<ReturnType<typeof dashboardApi.createWorkflow>>) {
  return {
    ...row,
    deployStatus: null,
    deployVersionId: null,
    deployedVersion: null,
    sharing: null,
    lastRunStatus: null,
    lastRunAt: null,
    recentRunStatuses: [],
  }
}

/**
 * Import: an exported workflow file becomes an item in this workspace, its
 * graph saved as the first version. A file that isn't a valid export is
 * refused before anything is created; if the version can't be saved, the
 * empty item is removed again (best effort). `onImported` runs from the
 * hook, so it still fires when the dialog has gone.
 */
export function useImportItem(
  slugs: WorkspaceSlugs,
  { onImported }: { onImported?: (item: WorkspaceItem) => void } = {},
) {
  const source = useDataSource()
  const ctx = useMockContext()
  const client = useQueryClient()
  const share = useShareCapability(slugs)
  return useMutation({
    meta: { toast: { success: 'Workflow imported', error: 'Couldn’t import the workflow' } },
    mutationFn: async (input: ImportItemInput): Promise<WorkspaceItem> => {
      if (source !== 'api') return mockServer.items.importItem(ctx, slugs, input)
      const file = parseImportFile(input.content, input.fileName)
      const row = await dashboardApi.createWorkflow(slugs, {
        name: file.name,
        description: file.description,
        kind: file.kind,
      })
      try {
        await dashboardApi.createVersion(slugs, row.id, file.ir)
      } catch (error) {
        await dashboardApi.deleteWorkflow(slugs, row.id).catch(() => undefined)
        throw error
      }
      return toWorkspaceItem(newDraftRow(row), share)
    },
    onSuccess: (item) => {
      onImported?.(item)
      return invalidateAll(client, itemKeys(slugs))
    },
  })
}
