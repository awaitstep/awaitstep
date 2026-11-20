import type { WorkflowSummary } from '../../../lib/api-client'
import type { ApiSharedItem, ApiWorkflowRow } from '../../../lib/dashboard-api'
import type { ItemRow, RunRow, SeedDb } from '../seed/rows'

// Workflows and functions as the API lists them, projected from the seed: the
// same names, versions and run history the boards (and the old dummy data)
// show, in the API's own JSON.

const STATUS_OF: Record<RunRow['result'], string> = {
  succeeded: 'complete',
  failed: 'errored',
  running: 'running',
}

function runsOf(seed: SeedDb, itemId: string): RunRow[] {
  return seed.runs
    .filter((run) => run.itemId === itemId)
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt))
}

function personRef(seed: SeedDb, id: string): { id: string; name: string } {
  return { id, name: seed.people.find((p) => p.id === id)?.name ?? 'Someone' }
}

/** One `GET /workflows` row. */
export function workflowRow(seed: SeedDb, item: ItemRow): ApiWorkflowRow {
  const runs = runsOf(seed, item.id)
  const finished = runs.filter((run) => run.result !== 'running')
  return {
    id: item.id,
    name: item.name,
    description: item.description,
    kind: item.kind,
    workspaceId: item.workspaceId,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
    deployStatus: item.status === 'deployed' ? 'success' : null,
    deployedVersion: item.version,
    lastRunStatus: runs[0] ? STATUS_OF[runs[0].result] : null,
    lastRunAt: runs[0]?.startedAt ?? null,
    sharing: item.sharing
      ? { sharedAt: item.sharing.sharedAt, sharedBy: personRef(seed, item.sharing.sharedBy) }
      : null,
    recentRunStatuses: finished.slice(0, 10).map((run) => STATUS_OF[run.result]),
  }
}

/** The workspace the slugs name, or undefined. */
export function workspaceBySlugs(
  seed: SeedDb,
  slugs: { org?: string; project?: string; workspace?: string },
) {
  const org = seed.orgs.find((o) => o.slug === slugs.org)
  const project = seed.projects.find((p) => p.orgId === org?.id && p.slug === slugs.project)
  return seed.workspaces.find((w) => w.projectId === project?.id && w.slug === slugs.workspace)
}

/** An item shared to its project, as "Shared with" and Project settings list it. */
export function sharedItem(
  seed: SeedDb,
  item: ItemRow,
  unshare: ApiSharedItem['unshare'],
): ApiSharedItem {
  const from = seed.workspaces.find((w) => w.id === item.workspaceId)!
  const chip = (w: typeof from) => ({ id: w.id, slug: w.slug, name: w.name, colour: w.colour })
  return {
    id: item.id,
    name: item.name,
    kind: item.kind,
    version: item.version,
    from: chip(from),
    usedBy: seed.calls
      .filter((call) => call.itemId === item.id)
      .map((call) => chip(seed.workspaces.find((w) => w.id === call.callerWorkspaceId)!)),
    canOpen: true,
    unshare,
    sharedAt: item.sharing!.sharedAt,
    sharedBy: personRef(seed, item.sharing!.sharedBy),
  }
}

/** What `POST /workflows` answers: the row as stored, without the listing's status fields. */
export function createdWorkflow(
  workspaceId: string,
  body: { name: string; description?: string; kind?: 'workflow' | 'script' },
  now: Date,
): WorkflowSummary & { workspaceId: string } {
  return {
    id: `itm_new_${body.name.toLowerCase().replace(/[^a-z0-9]+/g, '_')}`,
    name: body.name,
    description: body.description ?? null,
    kind: body.kind ?? 'workflow',
    workspaceId,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
  }
}

const DAY_MS = 24 * 60 * 60 * 1000

/** Whether the item's latest finished run failed. */
function isFailing(seed: SeedDb, item: ItemRow): boolean {
  const latest = runsOf(seed, item.id).find((run) => run.result !== 'running')
  return latest?.result === 'failed'
}

/** A workspace's `counts`, as `GET /scope` carries them, from its items and their runs. */
export function workspaceCounts(seed: SeedDb, workspaceId: string, now: Date) {
  const items = seed.items.filter((i) => i.workspaceId === workspaceId)
  const ids = new Set(items.map((i) => i.id))
  const runs = seed.runs.filter((r) => ids.has(r.itemId))
  const since = new Date(now.getTime() - DAY_MS).toISOString()
  return {
    workflows: items.filter((i) => i.kind === 'workflow').length,
    deployed: items.filter((i) => i.kind === 'workflow' && i.status === 'deployed').length,
    functions: items.filter((i) => i.kind === 'script').length,
    sharedOut: items.filter((i) => i.sharing).length,
    runs24h: runs.filter((r) => r.startedAt >= since).length,
    failing: items.filter((i) => isFailing(seed, i)).length,
    lastRunAt: runs.reduce<string | null>(
      (latest, r) => (latest === null || r.startedAt > latest ? r.startedAt : latest),
      null,
    ),
  }
}
