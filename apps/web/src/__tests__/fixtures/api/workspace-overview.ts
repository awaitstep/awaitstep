import type { ApiWorkspaceOverview } from '../../../lib/dashboard-api'
import type { RunRow, SeedDb } from '../seed/rows'
import { sharedItem, workspaceCounts } from './workflows'

// A workspace's Overview in one answer (`GET /workspaces/:id/overview`),
// projected from the seed: counts, the failing items, each item's latest
// finished run, and what is shared out and in.

const STATUS_OF: Record<RunRow['result'], string> = {
  succeeded: 'complete',
  failed: 'errored',
  running: 'running',
}

export function workspaceOverview(
  seed: SeedDb,
  workspaceId: string,
  now: Date,
): ApiWorkspaceOverview {
  const workspace = seed.workspaces.find((w) => w.id === workspaceId)!
  const items = seed.items.filter((i) => i.workspaceId === workspaceId)
  const runsOf = (itemId: string) =>
    seed.runs
      .filter((r) => r.itemId === itemId)
      .sort((a, b) => b.startedAt.localeCompare(a.startedAt))
  const runJson = (run: RunRow) => ({
    id: run.id,
    workflowId: run.itemId,
    status: STATUS_OF[run.result],
    createdAt: run.startedAt,
    updatedAt: new Date(Date.parse(run.startedAt) + (run.durationMs ?? 0)).toISOString(),
  })
  const latestFinished = items.flatMap((item) => {
    const run = runsOf(item.id).find((r) => r.result !== 'running')
    return run ? [{ item, run }] : []
  })
  const siblings = new Set(
    seed.workspaces
      .filter((w) => w.projectId === workspace.projectId && w.id !== workspaceId)
      .map((w) => w.id),
  )
  return {
    counts: workspaceCounts(seed, workspaceId, now),
    needsAttention: latestFinished
      .filter(({ run }) => run.result === 'failed')
      .map(({ item, run }) => {
        const finished = runsOf(item.id)
          .filter((r) => r.result !== 'running')
          .slice(0, 10)
        return {
          item: { id: item.id, name: item.name, kind: item.kind },
          run: { ...runJson(run), error: run.failure?.message ?? null },
          failures: finished.filter((r) => r.result === 'failed').length,
          total: finished.length,
        }
      }),
    recent: latestFinished
      .sort((a, b) => b.run.startedAt.localeCompare(a.run.startedAt))
      .slice(0, 4)
      .map(({ item, run }) => ({ ...runJson(run), workflowName: item.name, kind: item.kind })),
    shared: {
      out: items.filter((i) => i.sharing).map((i) => ({ id: i.id, name: i.name })),
      in: seed.items
        .filter((i) => i.sharing && siblings.has(i.workspaceId))
        .map((i) => sharedItem(seed, i, { allowed: false })),
    },
  }
}
