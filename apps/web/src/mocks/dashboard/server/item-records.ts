import type { SharedItem, WorkspaceItem, WorkspaceRef } from '../../../types/dashboard/items'
import type { RunResult, WorkspaceRun } from '../../../types/dashboard/runs'
import type { Allowed } from '../../../types/dashboard/scope'
import type { RunHour, WorkspaceCounts } from '../../../types/dashboard/workspaces'
import type { ItemRow, MockDb, RunRow, WorkspaceRow } from '../db'
import { notFoundError } from '../scenario'

// Row → record joins for workflows, functions and runs.

const HOUR_MS = 60 * 60 * 1000
const DAY_MS = 24 * HOUR_MS
const RECENT_RUNS = 10

export function workspaceRef(row: WorkspaceRow): WorkspaceRef {
  return { id: row.id, slug: row.slug, name: row.name, colour: row.colour }
}

function workspaceById(db: MockDb, id: string): WorkspaceRow {
  const row = db.workspaces.find((w) => w.id === id)
  if (!row) throw notFoundError()
  return row
}

function itemById(db: MockDb, id: string): ItemRow {
  const row = db.items.find((i) => i.id === id)
  if (!row) throw notFoundError()
  return row
}

/** Runs of an item, newest first. */
function runsOf(db: MockDb, itemId: string): RunRow[] {
  return db.runs
    .filter((r) => r.itemId === itemId)
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt))
}

/** Finished runs only: a run still waiting doesn't change the bars or "Last run". */
function finishedRunsOf(db: MockDb, itemId: string): RunRow[] {
  return runsOf(db, itemId).filter((r) => r.result !== 'running')
}

/** Other workspaces that call a shared item. */
export function callersOf(db: MockDb, item: ItemRow): WorkspaceRow[] {
  return db.calls
    .filter((c) => c.itemId === item.id && c.callerWorkspaceId !== item.workspaceId)
    .map((c) => workspaceById(db, c.callerWorkspaceId))
}

export function isFailing(db: MockDb, item: ItemRow): boolean {
  return finishedRunsOf(db, item.id)[0]?.result === 'failed'
}

export function runRecord(db: MockDb, row: RunRow): WorkspaceRun {
  const item = itemById(db, row.itemId)
  return {
    id: row.id,
    workflowId: row.itemId,
    createdAt: row.startedAt,
    workflowName: item.name,
    kind: item.kind,
    result: row.result,
    trigger: row.trigger,
    durationMs: row.durationMs,
    waitingOn: row.waitingOn,
    httpStatus: row.httpStatus,
    failure: row.failure,
  }
}

function sharingRecord(db: MockDb, item: ItemRow) {
  if (!item.sharing) return null
  const by = db.people.find((p) => p.id === item.sharing!.sharedBy)
  return {
    sharedAt: item.sharing.sharedAt,
    sharedBy: { id: item.sharing.sharedBy, name: by?.name ?? 'Someone' },
  }
}

/**
 * Why an item's share switch is blocked, if it is: unsharing while others call
 * it. Callers the viewer can't open are counted, never named (O9).
 */
export function unshareBlock(db: MockDb, item: ItemRow, visible: Set<string>): string | null {
  if (!item.sharing) return null
  const callers = callersOf(db, item)
  if (callers.length === 0) return null
  const named = callers.filter((w) => visible.has(w.id)).map((w) => w.name)
  const hidden = callers.length - named.length
  if (hidden > 0) {
    named.push(hidden === 1 ? '1 other workspace' : `${hidden} other workspaces`)
  }
  return `Called by ${named.join(', ')}. Unshare is blocked while another workspace uses it`
}

/**
 * `share` is the viewer's share capability in the item's workspace; `visible`
 * the workspaces they can open, so "used by" never names a hidden one (O9).
 */
export function itemRecord(
  db: MockDb,
  row: ItemRow,
  share: Allowed,
  visible: Set<string>,
): WorkspaceItem {
  const finished = finishedRunsOf(db, row.id)
  const blocked = unshareBlock(db, row, visible)
  const recentRuns: RunResult[] = finished
    .slice(0, RECENT_RUNS)
    .reverse()
    .map((r) => r.result)
  return {
    id: row.id,
    name: row.name,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    kind: row.kind,
    workspaceId: row.workspaceId,
    description: row.description,
    status: row.status,
    version: row.version,
    route: row.route,
    recentRuns,
    lastRun: finished[0] ? { result: finished[0].result, at: finished[0].startedAt } : null,
    traffic: row.traffic,
    sharing: sharingRecord(db, row),
    usedBy: callersOf(db, row)
      .filter((w) => visible.has(w.id))
      .map(workspaceRef),
    shareToggle: !share.allowed ? share : blocked ? { allowed: false, reason: blocked } : share,
  }
}

/**
 * `unshare` is whether the viewer may unshare it now (see `unshareOf` in the
 * items server); `visible` the workspaces the viewer can open, so "Called by"
 * never names a hidden one (O9), and `canOpen` whether the item's own one is
 * among them. Sharing publishes `from` to the whole project.
 */
export function sharedItemRecord(
  db: MockDb,
  row: ItemRow,
  unshare: Allowed,
  visible: Set<string>,
): SharedItem {
  const sharing = sharingRecord(db, row)
  if (!sharing) throw notFoundError()
  return {
    ...sharing,
    id: row.id,
    name: row.name,
    kind: row.kind,
    version: row.version,
    from: workspaceRef(workspaceById(db, row.workspaceId)),
    usedBy: callersOf(db, row)
      .filter((w) => visible.has(w.id))
      .map(workspaceRef),
    canOpen: visible.has(row.workspaceId),
    unshare,
  }
}

export function workspaceCounts(db: MockDb, workspace: WorkspaceRow): WorkspaceCounts {
  const items = db.items.filter((i) => i.workspaceId === workspace.id)
  const ids = new Set(items.map((i) => i.id))
  const runs = db.runs.filter((r) => ids.has(r.itemId))
  const since = new Date(Date.now() - DAY_MS).toISOString()
  const lastRunAt = runs.reduce<string | null>(
    (latest, r) => (latest === null || r.startedAt > latest ? r.startedAt : latest),
    null,
  )
  return {
    workflows: items.filter((i) => i.kind === 'workflow').length,
    deployed: items.filter((i) => i.kind === 'workflow' && i.status === 'deployed').length,
    functions: items.filter((i) => i.kind === 'script').length,
    sharedOut: items.filter((i) => i.sharing).length,
    runs24h: runs.filter((r) => r.startedAt >= since).length,
    failing: items.filter((i) => isFailing(db, i)).length,
    lastRunAt,
  }
}

/** The workspace's runs in each of the last 24 hours, oldest first (the API's `runsByHour`). */
export function workspaceRunsByHour(db: MockDb, workspace: WorkspaceRow): RunHour[] {
  const ids = new Set(db.items.filter((i) => i.workspaceId === workspace.id).map((i) => i.id))
  const now = Date.now()
  const hours = Array.from({ length: 24 }, (): RunHour => ({ runs: 0, complete: 0, failed: 0 }))
  for (const run of db.runs) {
    const ago = Math.floor((now - Date.parse(run.startedAt)) / HOUR_MS)
    if (!ids.has(run.itemId) || ago < 0 || ago > 23) continue
    const hour = hours[23 - ago]!
    hour.runs++
    if (run.result === 'succeeded') hour.complete++
    if (run.result === 'failed') hour.failed++
  }
  return hours
}

/**
 * Removes workspaces and everything in them: members, items, their runs,
 * calls made to or from them, edit requests for them, and their keys and
 * variables. Projects and workspaces delete through this.
 */
export function deleteWorkspaces(db: MockDb, workspaceIds: Set<string>): void {
  const itemIds = new Set(db.items.filter((i) => workspaceIds.has(i.workspaceId)).map((i) => i.id))
  db.workspaces = db.workspaces.filter((w) => !workspaceIds.has(w.id))
  db.workspaceMembers = db.workspaceMembers.filter((m) => !workspaceIds.has(m.workspaceId))
  db.items = db.items.filter((i) => !itemIds.has(i.id))
  db.runs = db.runs.filter((r) => !itemIds.has(r.itemId))
  db.calls = db.calls.filter(
    (c) => !itemIds.has(c.itemId) && !workspaceIds.has(c.callerWorkspaceId),
  )
  db.editRequests = db.editRequests.filter((r) => !workspaceIds.has(r.workspaceId))
  db.keys = db.keys.filter((k) => !k.workspaceId || !workspaceIds.has(k.workspaceId))
  db.variables = db.variables.filter((v) => v.level !== 'workspace' || !workspaceIds.has(v.scopeId))
}
