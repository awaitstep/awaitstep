import type { ApiRunPage, ApiRunFilter, ApiWorkspaceRun } from '../../../lib/dashboard-api'
import type { RunRow, SeedDb } from '../seed/rows'

// A workspace's runs as `GET /runs` lists them, projected from the seed:
// newest first, narrowed by result and search, a page at a time.

const STATUS_OF: Record<RunRow['result'], string> = {
  succeeded: 'complete',
  failed: 'errored',
  running: 'running',
}

function runRow(seed: SeedDb, run: RunRow): ApiWorkspaceRun {
  const item = seed.items.find((i) => i.id === run.itemId)!
  const ended =
    run.durationMs === null
      ? run.startedAt
      : new Date(Date.parse(run.startedAt) + run.durationMs).toISOString()
  return {
    id: run.id,
    workflowId: run.itemId,
    versionId: null,
    versionNumber: item.version,
    connectionId: null,
    instanceId: run.id,
    status: STATUS_OF[run.result],
    output: null,
    error: run.failure?.message ?? null,
    createdAt: run.startedAt,
    updatedAt: run.result === 'running' ? run.startedAt : ended,
    workflowName: item.name,
    kind: item.kind,
  }
}

export function workspaceRuns(seed: SeedDb, workspaceId: string, filter: ApiRunFilter): ApiRunPage {
  const itemIds = new Set(seed.items.filter((i) => i.workspaceId === workspaceId).map((i) => i.id))
  const all = seed.runs
    .filter((r) => itemIds.has(r.itemId))
    .filter((r) => !filter.workflowId || r.itemId === filter.workflowId)
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt))
  const search = filter.search?.toLowerCase()
  const matching = all
    .filter((r) => !filter.result || r.result === filter.result)
    .filter((r) => {
      if (!search) return true
      const name = seed.items.find((i) => i.id === r.itemId)?.name.toLowerCase() ?? ''
      return r.id.toLowerCase().includes(search) || name.includes(search)
    })
  const limit = Number(filter.limit ?? 25)
  const start = Number(filter.cursor ?? 0)
  const page = matching.slice(start, start + limit)
  return {
    data: page.map((r) => runRow(seed, r)),
    nextCursor: start + limit < matching.length ? String(start + limit) : null,
    counts: {
      all: all.length,
      succeeded: all.filter((r) => r.result === 'succeeded').length,
      failed: all.filter((r) => r.result === 'failed').length,
      running: all.filter((r) => r.result === 'running').length,
    },
  }
}
