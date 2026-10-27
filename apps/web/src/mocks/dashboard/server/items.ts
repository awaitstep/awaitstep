import type {
  ImportItemInput,
  ItemKind,
  MoveItemsInput,
  NewItemInput,
  SharedItem,
  WorkspaceItem,
} from '../../../types/dashboard/items'
import type { LibraryEntry } from '../../../types/dashboard/library'
import type { Allowed, ScopeSlugs } from '../../../types/dashboard/scope'
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
import { workspaceRoleOf } from '../access'
import { itemRecord, sharedItemRecord, unshareBlock } from './item-records'
import { visibleWorkspaces, workspaceScope } from './records'
import { newId, requireScope, resolveWorkspace } from './resolve'

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
  const visible = visibleIds(db, ctx, project)
  return items.map((i) => itemRecord(db, i, share, visible))
}

/**
 * Whether the viewer may unshare a shared item: they need share rights in
 * the item's own workspace, and nobody else may be calling it.
 */
function unshareOf(db: MockDb, ctx: MockContext, project: ProjectRow, item: ItemRow): Allowed {
  const from = db.workspaces.find((w) => w.id === item.workspaceId)!
  if (!workspaceRoleOf(db, ctx, project, from)) {
    return { allowed: false, reason: `Only people in ${from.name} can unshare it` }
  }
  const share = workspaceScope(db, ctx, project, from).viewerCan.share
  if (!share.allowed) return share
  const blocked = unshareBlock(db, item, visibleIds(db, ctx, project))
  return blocked ? { allowed: false, reason: blocked } : share
}

// "Shared with Sales" is read-only: unsharing happens in the item's own workspace
// or Project settings, so the workspace views don't work out whether it could.
const UNSHARE_ELSEWHERE: Allowed = {
  allowed: false,
  reason: 'Unshare it from its own workspace',
}

function visibleIds(db: MockDb, ctx: MockContext, project: ProjectRow): Set<string> {
  return new Set(visibleWorkspaces(db, ctx, project).map((w) => w.id))
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
    const visible = visibleIds(db, ctx, project)
    return rows(
      ctx,
      shared.map((i) => sharedItemRecord(db, i, UNSHARE_ELSEWHERE, visible)),
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
    const visible = visibleIds(db, ctx, project!)
    return rows(
      ctx,
      shared.map((i) => sharedItemRecord(db, i, unshareOf(db, ctx, project!, i), visible)),
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
      const blocked = unshareBlock(db, item, visibleIds(db, ctx, project))
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

const UNTITLED: Record<ItemKind, string> = {
  workflow: 'Untitled workflow',
  script: 'Untitled function',
}

/** "Untitled workflow", then "Untitled workflow 2", … within the workspace. */
function untitledName(db: MockDb, workspace: WorkspaceRow, kind: ItemKind): string {
  const taken = new Set(db.items.filter((i) => i.workspaceId === workspace.id).map((i) => i.name))
  const base = UNTITLED[kind]
  let name = base
  for (let n = 2; taken.has(name); n++) name = `${base} ${n}`
  return name
}

function addDraft(
  db: MockDb,
  ctx: MockContext,
  slugs: WorkspaceSlugs,
  draft: { kind: ItemKind; name: string | null; description: string | null },
): WorkspaceItem {
  const { project, workspace } = requireWorkspace(db, ctx, slugs)
  const can = workspaceScope(db, ctx, project, workspace).viewerCan.edit
  if (!can.allowed) throw forbiddenError(can.reason!)
  const now = new Date().toISOString()
  const row: ItemRow = {
    id: newId('itm'),
    workspaceId: workspace.id,
    kind: draft.kind,
    name: draft.name ?? untitledName(db, workspace, draft.kind),
    description: draft.description,
    status: 'draft',
    version: null,
    route: null,
    createdAt: now,
    updatedAt: now,
    sharing: null,
    traffic: null,
  }
  // Newest first: the list shows it at the top.
  db.items.unshift(row)
  return records(db, ctx, project, workspace, [row])[0]!
}

/** New workflow / New function: an empty draft in the workspace. */
export const createItem = mutation(
  (ctx, slugs: WorkspaceSlugs, input: NewItemInput): WorkspaceItem =>
    addDraft(getDb(), ctx, slugs, {
      kind: input.kind,
      name: input.name?.trim() || null,
      description: null,
    }),
)

export const NOT_AN_EXPORT =
  'That file isn’t a workflow export. Pick a .json file with a "nodes" list.'

function parseExport(content: string): Record<string, unknown> {
  let parsed: unknown
  try {
    parsed = JSON.parse(content)
  } catch {
    throw invalidError(NOT_AN_EXPORT)
  }
  const isObject = typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)
  if (!isObject || !Array.isArray((parsed as { nodes?: unknown }).nodes)) {
    throw invalidError(NOT_AN_EXPORT)
  }
  return parsed as Record<string, unknown>
}

const text = (value: unknown) => (typeof value === 'string' && value.trim() ? value.trim() : null)

/**
 * Import: a draft named after the export's `metadata.name` (or the file,
 * `lead-enrichment.ir.json` → "lead-enrichment"), as the old Import dialog
 * reads it. Dummy data only checks the shape; IR validation comes with the backend.
 */
export const importItem = mutation(
  (ctx, slugs: WorkspaceSlugs, input: ImportItemInput): WorkspaceItem => {
    const parsed = parseExport(input.content)
    const metadata =
      typeof parsed.metadata === 'object' && parsed.metadata !== null
        ? (parsed.metadata as Record<string, unknown>)
        : {}
    return addDraft(getDb(), ctx, slugs, {
      kind: parsed.kind === 'script' ? 'script' : 'workflow',
      name: text(metadata.name) ?? text(input.fileName.replace(/(\.ir)?\.json$/i, '')),
      description: text(metadata.description),
    })
  },
)

/** Modules and resource nodes arrive with W2; until then every Library is empty. */
export const listLibrary = endpoint((ctx, slugs: WorkspaceSlugs): LibraryEntry[] => {
  requireWorkspace(getDb(), ctx, slugs)
  return []
})
