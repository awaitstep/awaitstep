import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { mockServer } from '../../mocks/dashboard/server'
import type {
  ImportItemInput,
  ItemKind,
  MoveItemsInput,
  NewItemInput,
} from '../../types/dashboard/items'
import type { ScopeSlugs } from '../../types/dashboard/scope'
import { dashKeys, invalidateAll, withMockContext } from './keys'
import { useMockContext } from './scenario-context'

type WorkspaceSlugs = Required<ScopeSlugs>

/** A workspace's own workflows (`'workflow'`) or functions (`'script'`), each with its share switch state. */
export function useWorkspaceItems(slugs: WorkspaceSlugs, kind: ItemKind) {
  const ctx = useMockContext()
  return useQuery({
    queryKey: withMockContext(dashKeys.itemsOf(slugs, kind), ctx),
    queryFn: () => mockServer.items.listItems(ctx, slugs, kind),
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
    dashKeys.workspaces(slugs.org, slugs.project),
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

/** Move workflows: sends items (and their runs) to another workspace in the project. */
export function useMoveWorkflows(slugs: WorkspaceSlugs) {
  const ctx = useMockContext()
  const client = useQueryClient()
  return useMutation({
    mutationFn: (input: MoveItemsInput) => mockServer.items.moveItems(ctx, slugs, input),
    onSuccess: () => invalidateAll(client, itemKeys(slugs)),
  })
}

/** New workflow / New function: adds a draft at the top of its list. */
export function useCreateItem(slugs: WorkspaceSlugs) {
  const ctx = useMockContext()
  const client = useQueryClient()
  return useMutation({
    mutationFn: (input: NewItemInput) => mockServer.items.createItem(ctx, slugs, input),
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
