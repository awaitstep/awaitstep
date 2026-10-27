import type {
  FailingItem,
  RunFilter,
  RunPage,
  RunPeriod,
  RunResult,
} from '../../../types/dashboard/runs'
import type { ScopeSlugs } from '../../../types/dashboard/scope'
import { canSeeProject } from '../access'
import { getDb, type RunRow } from '../db'
import { endpoint, rows } from '../scenario'
import { isFailing, runRecord } from './item-records'
import { pageOf } from './paging'
import { visibleWorkspaces } from './records'
import { requireScope } from './resolve'

const PERIOD_MS: Record<RunPeriod, number> = {
  '24h': 24 * 60 * 60 * 1000,
  '7d': 7 * 24 * 60 * 60 * 1000,
  '30d': 30 * 24 * 60 * 60 * 1000,
}
const RESULTS: RunResult[] = ['succeeded', 'failed', 'running']

/**
 * A workspace's runs, newest first: its own workflows' and functions'. Runs
 * of shared workflows stay with the workspace that owns them (WsRuns copy).
 */
export const listRuns = endpoint(
  (ctx, slugs: Required<ScopeSlugs>, filter: RunFilter = {}): RunPage => {
    const db = getDb()
    const { workspace } = requireScope(db, ctx, slugs)
    const items = new Map(
      db.items.filter((i) => i.workspaceId === workspace!.id).map((i) => [i.id, i]),
    )
    const since = new Date(Date.now() - PERIOD_MS[filter.period ?? '24h']).toISOString()
    const search = filter.search?.trim().toLowerCase()
    const matching = rows(
      ctx,
      db.runs.filter(
        (r) =>
          items.has(r.itemId) &&
          r.startedAt >= since &&
          (!search ||
            r.id.toLowerCase().includes(search) ||
            items.get(r.itemId)!.name.toLowerCase().includes(search)),
      ),
    ).sort((a, b) => b.startedAt.localeCompare(a.startedAt))

    const count = (result: RunResult) => matching.filter((r) => r.result === result).length
    const counts = {
      all: matching.length,
      ...Object.fromEntries(RESULTS.map((result) => [result, count(result)])),
    } as RunPage['counts']

    const filtered: RunRow[] = filter.result
      ? matching.filter((r) => r.result === filter.result)
      : matching
    const { page, nextCursor } = pageOf(filtered, filter)
    return { data: page.map((r) => runRecord(db, r)), nextCursor, counts }
  },
)

/** Org home "Failing now": workflows whose latest finished run failed, across what the viewer can open. */
export const listFailingNow = endpoint((ctx, orgSlug: string): FailingItem[] => {
  const db = getDb()
  const { org } = requireScope(db, ctx, { org: orgSlug })
  const failing: FailingItem[] = []
  for (const project of db.projects.filter(
    (p) => p.orgId === org.id && canSeeProject(db, ctx, p),
  )) {
    for (const workspace of visibleWorkspaces(db, ctx, project)) {
      for (const item of db.items.filter(
        (i) => i.workspaceId === workspace.id && isFailing(db, i),
      )) {
        const latest = db.runs
          .filter((r) => r.itemId === item.id && r.result === 'failed')
          .sort((a, b) => b.startedAt.localeCompare(a.startedAt))[0]!
        failing.push({
          item: { id: item.id, name: item.name, kind: item.kind },
          project: { slug: project.slug, name: project.name },
          workspace: { slug: workspace.slug, name: workspace.name },
          run: runRecord(db, latest),
        })
      }
    }
  }
  return rows(ctx, failing)
})
