import { and, desc, eq, gte, inArray, lt, or, sql, aliasedTable, type SQL } from 'drizzle-orm'
import type {
  FailingWorkflow,
  WorkspaceRunFilter,
  WorkspaceRunPage,
  WorkspaceRunRow,
} from '../types.js'
import { clampLimit, decodeCursor, paginateResults } from '../pagination.js'
import { aliasedFrom } from './json-array.js'
import { FAILED_RUN_STATUSES, type OverviewTables } from './overview-fields.js'

const FAILED_LIST = sql.raw(FAILED_RUN_STATUSES.map((s) => `'${s}'`).join(', '))
const FAILING_NOW_LIMIT = 50

/** A page row joined to the counts row; the run columns are null on the counts-only row. */
type MatchingRow = WorkspaceRunRow & {
  all: number
  succeeded: number
  failed: number
}

/** `%` and `_` in a search term are letters, not wildcards. */
function likePattern(term: string): string {
  return `%${term.replace(/[\\%_]/g, (c) => `\\${c}`)}%`
}

/** The runs a workspace's Runs page and the org home's "Failing now" read. */
export class WorkspaceRunsAdapter {
  constructor(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    private db: any,
    private t: OverviewTables,
  ) {}

  /**
   * One page of a workspace's runs, newest first, with the counts per result
   * over the period and search (not the result filter: those are the filter
   * pills, which must keep showing the other results). One statement: the
   * matching runs are a CTE, the counts aggregate it, the page filters and
   * cuts it, and the counts row left-joins the page — so a filter or cursor
   * that matches nothing still comes back with its counts.
   */
  async listByWorkspace(
    workspaceId: string,
    filter: WorkspaceRunFilter,
  ): Promise<WorkspaceRunPage> {
    const r = aliasedTable(this.t.workflowRuns, 'r')
    const wf = aliasedTable(this.t.workflows, 'wf')
    const limit = clampLimit(filter.limit)

    const scope: SQL[] = [eq(wf.workspaceId, workspaceId)]
    if (filter.since) scope.push(gte(r.createdAt, filter.since))
    const term = filter.search?.trim().toLowerCase()
    if (term) {
      const pattern = likePattern(term)
      scope.push(
        or(
          sql`lower(${wf.name}) like ${pattern} escape '\\'`,
          sql`lower(${r.id}) like ${pattern} escape '\\'`,
        )!,
      )
    }
    const failed = sql`${r.status} in (${FAILED_LIST})`
    const matching = this.db.$with('matching').as(
      this.db
        .select({
          id: r.id,
          workflowId: r.workflowId,
          versionId: r.versionId,
          connectionId: r.connectionId,
          instanceId: r.instanceId,
          status: r.status,
          output: r.output,
          error: r.error,
          createdAt: r.createdAt,
          updatedAt: r.updatedAt,
          workflowName: wf.name,
          kind: wf.kind,
          result:
            sql<string>`case when ${r.status} = 'complete' then 'succeeded' when ${failed} then 'failed' else 'running' end`.as(
              'result',
            ),
        })
        .from(r)
        .innerJoin(wf, eq(wf.id, r.workflowId))
        .where(and(...scope)),
    )
    const counts = this.db.$with('counts').as(
      this.db
        .select({
          all: sql<number>`count(*)`.mapWith(Number).as('all_count'),
          succeeded:
            sql<number>`coalesce(sum(case when ${matching.result} = 'succeeded' then 1 else 0 end), 0)`
              .mapWith(Number)
              .as('succeeded_count'),
          failed:
            sql<number>`coalesce(sum(case when ${matching.result} = 'failed' then 1 else 0 end), 0)`
              .mapWith(Number)
              .as('failed_count'),
        })
        .from(matching),
    )

    const pageConditions: SQL[] = []
    if (filter.result) pageConditions.push(eq(matching.result, filter.result))
    if (filter.cursor) {
      const { id: cursorId, timestamp } = decodeCursor(filter.cursor)
      pageConditions.push(
        or(
          lt(matching.createdAt, timestamp),
          and(eq(matching.createdAt, timestamp), lt(matching.id, cursorId)),
        )!,
      )
    }
    const page = this.db.$with('page').as(
      this.db
        .select()
        .from(matching)
        .where(pageConditions.length > 0 ? and(...pageConditions) : undefined)
        .orderBy(desc(matching.createdAt), desc(matching.id))
        .limit(limit + 1),
    )

    const rows: MatchingRow[] = await this.db
      .with(matching, counts, page)
      .select({
        id: page.id,
        workflowId: page.workflowId,
        versionId: page.versionId,
        connectionId: page.connectionId,
        instanceId: page.instanceId,
        status: page.status,
        output: page.output,
        error: page.error,
        createdAt: page.createdAt,
        updatedAt: page.updatedAt,
        workflowName: page.workflowName,
        kind: page.kind,
        all: counts.all,
        succeeded: counts.succeeded,
        failed: counts.failed,
      })
      .from(counts)
      // The counts row anchors the result: with an empty page it comes back alone.
      .leftJoin(page, sql`1 = 1`)
      .orderBy(desc(page.createdAt), desc(page.id))

    const first = rows[0]
    const totals = first
      ? { all: first.all, succeeded: first.succeeded, failed: first.failed }
      : { all: 0, succeeded: 0, failed: 0 }
    const present = rows.filter((row) => row.id !== null)
    const { data, nextCursor } = paginateResults(present, limit, (row) => row.createdAt)
    return {
      data: data.map(({ all: _all, succeeded: _s, failed: _f, ...run }) => run),
      nextCursor,
      counts: { ...totals, running: totals.all - totals.succeeded - totals.failed },
    }
  }

  /** Workflows whose latest run failed, across the organization, most recent failure first. */
  async listFailing(organizationId: string): Promise<FailingWorkflow[]> {
    const wf = aliasedTable(this.t.workflows, 'fw')
    const w = aliasedTable(this.t.workspaces, 'fs')
    const p = aliasedTable(this.t.projects, 'fp')
    const r = aliasedTable(this.t.workflowRuns, 'fr')
    const latest = aliasedTable(this.t.workflowRuns, 'latest')
    const latestRunId = sql`(select ${latest.id} from ${aliasedFrom(latest)} where ${latest.workflowId} = ${wf.id} order by ${latest.createdAt} desc limit 1)`
    return this.db
      .select({
        workflow: { id: wf.id, name: wf.name, kind: wf.kind },
        project: { slug: p.slug, name: p.name },
        workspace: { slug: w.slug, name: w.name, colour: w.colour },
        run: r,
      })
      .from(wf)
      .innerJoin(w, eq(w.id, wf.workspaceId))
      .innerJoin(p, eq(p.id, wf.projectId))
      .innerJoin(r, eq(r.id, latestRunId))
      .where(and(eq(p.organizationId, organizationId), inArray(r.status, [...FAILED_RUN_STATUSES])))
      .orderBy(desc(r.createdAt), desc(r.id))
      .limit(FAILING_NOW_LIMIT)
  }
}
