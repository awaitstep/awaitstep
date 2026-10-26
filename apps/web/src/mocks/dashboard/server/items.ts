import type {
  ItemKind,
  MoveItemsInput,
  SharedItem,
  WorkspaceItem,
} from '../../../types/dashboard/items'
import type { LibraryEntry } from '../../../types/dashboard/library'
import type { ScopeSlugs } from '../../../types/dashboard/scope'
import { getDb, type ItemRow, type MockDb, type ProjectRow, type WorkspaceRow } from '../db'
import {
  type MockContext,
  conflictError,
  endpoint,
  forbiddenError,
  invalidError,
  mutation,
  notFoundError,
  rows,
} from '../scenario'
import { itemRecord, sharedItemRecord, unshareBlock } from './item-records'
import { workspaceScope } from './records'
import { requireScope, resolveWorkspace } from './resolve'

type WorkspaceSlugs = Required<ScopeSlugs>

function requireWorkspace(db: MockDb, ctx: MockContext, slugs: WorkspaceSlugs) {
  const { project, workspace } = requireScope(db, ctx, slugs)
  return { project: project!, workspace: workspace! }
}

function itemIn(db: MockDb, workspace: WorkspaceRow, itemId: string): ItemRow {
  const item = db.items.find((i) => i.id === itemId && i.workspaceId === workspace.id)
  if (!item) throw notFoundError()
  return item
}

function records(
  db: MockDb,
  ctx: MockContext,
  project: ProjectRow,
  workspace: WorkspaceRow,
  items: ItemRow[],
): WorkspaceItem[] {
  const share = workspaceScope(db, ctx, project, workspace).viewerCan.share
  return items.map((i) => itemRecord(db, i, share))
}

/** A workspace's own workflows (`kind: 'workflow'`) or functions (`'script'`). */
export const listItems = endpoint((ctx, slugs: WorkspaceSlugs, kind: ItemKind): WorkspaceItem[] => {
  const db = getDb()
  const { project, workspace } = requireWorkspace(db, ctx, slugs)
  const own = db.items.filter((i) => i.workspaceId === workspace.id && i.kind === kind)
  return rows(ctx, records(db, ctx, project, workspace, own))
})

/** "Shared with Sales": what the project's other workspaces shared, read-only here. */
export const listSharedWith = endpoint(
  (ctx, slugs: WorkspaceSlugs, kind?: ItemKind): SharedItem[] => {
    const db = getDb()
    const { project, workspace } = requireWorkspace(db, ctx, slugs)
    const siblings = new Set(
      db.workspaces
        .filter((w) => w.projectId === project.id && w.id !== workspace.id)
        .map((w) => w.id),
    )
    const shared = db.items.filter(
      (i) => i.sharing && siblings.has(i.workspaceId) && (kind === undefined || i.kind === kind),
    )
    return rows(
      ctx,
      shared.map((i) => sharedItemRecord(db, i)),
    )
  },
)

/** Project settings → Shared library: everything shared in the project, with who uses it. */
export const listProjectShared = endpoint(
  (ctx, orgSlug: string, projectSlug: string): SharedItem[] => {
    const db = getDb()
    const { project } = requireScope(db, ctx, { org: orgSlug, project: projectSlug })
    const workspaceIds = new Set(
      db.workspaces.filter((w) => w.projectId === project!.id).map((w) => w.id),
    )
    const shared = db.items.filter((i) => i.sharing && workspaceIds.has(i.workspaceId))
    return rows(
      ctx,
      shared.map((i) => sharedItemRecord(db, i)),
    )
  },
)

/** The row's "Shared to project" switch. Unsharing is refused while another workspace calls it. */
export const setShared = mutation(
  (ctx, slugs: WorkspaceSlugs, itemId: string, shared: boolean): WorkspaceItem => {
    const db = getDb()
    const { project, workspace } = requireWorkspace(db, ctx, slugs)
    const can = workspaceScope(db, ctx, project, workspace).viewerCan.share
    if (!can.allowed) throw forbiddenError(can.reason!)
    const item = itemIn(db, workspace, itemId)
    if (!shared) {
      const blocked = unshareBlock(db, item)
      if (blocked) throw conflictError(blocked)
      item.sharing = null
    } else {
      item.sharing ??= { sharedAt: new Date().toISOString(), sharedBy: ctx.userId }
    }
    return records(db, ctx, project, workspace, [item])[0]!
  },
)

/**
 * Moves workflows and functions to another workspace in the project; their
 * runs go with them. Needs settings rights here and edit rights there.
 */
export const moveItems = mutation(
  (ctx, slugs: WorkspaceSlugs, input: MoveItemsInput): { moved: number } => {
    const db = getDb()
    const { project, workspace } = requireWorkspace(db, ctx, slugs)
    const here = workspaceScope(db, ctx, project, workspace).viewerCan.manageSettings
    if (!here.allowed) throw forbiddenError(here.reason!)
    if (input.itemIds.length === 0) throw invalidError('Pick at least one workflow to move')
    const target = resolveWorkspace(db, ctx, project, input.to)
    if ('notFound' in target || target.row.id === workspace.id) throw notFoundError()
    const there = workspaceScope(db, ctx, project, target.row).viewerCan.edit
    if (!there.allowed) throw forbiddenError(there.reason!)
    const items = input.itemIds.map((id) => itemIn(db, workspace, id))
    const moved = new Set(items.map((i) => i.id))
    for (const item of items) item.workspaceId = target.row.id
    // The target calling an item it now owns is no longer a cross-workspace call.
    db.calls = db.calls.filter(
      (c) => !(moved.has(c.itemId) && c.callerWorkspaceId === target.row.id),
    )
    return { moved: items.length }
  },
)

/** Modules and resource nodes arrive with W2; until then every Library is empty. */
export const listLibrary = endpoint((ctx, slugs: WorkspaceSlugs): LibraryEntry[] => {
  requireWorkspace(getDb(), ctx, slugs)
  return []
})
