import { eq, desc, max, and, or, lt, sql, aliasedTable, getTableColumns } from 'drizzle-orm'
import type {
  CreateVersionData,
  LatestVersionForSave,
  UpdateVersionData,
  VersionDeleteCheck,
  WorkflowVersion,
  WorkflowVersionListItem,
} from '../types.js'
import type { PaginationParams, PaginatedResult } from '../pagination.js'
import { clampLimit, decodeCursor, paginateResults } from '../pagination.js'
import { aliasedFrom } from './json-array.js'
import { liveOnItsAccount } from './live-deployment.js'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyTable = any

/** A driver's boolean: pg's own, sqlite's 0/1. */
function truthy(value: unknown): boolean {
  return value === true || value === 1 || value === '1' || value === 't'
}

export class VersionsAdapter {
  constructor(
    private db: AnyTable,
    private table: AnyTable,
    private user: AnyTable,
    private workflows: AnyTable,
    private deployments: AnyTable,
  ) {}

  async create(data: CreateVersionData): Promise<WorkflowVersion> {
    const now = new Date().toISOString()
    const row = {
      id: data.id,
      workflowId: data.workflowId,
      ir: data.ir,
      // The four dead source columns, written as what they now permanently
      // mean. W0 removed the stored-source mode they belonged to and no
      // caller can ask for anything else; they are spelled out here rather
      // than left to the column defaults because the row this returns has to
      // match what the insert left in the table. The Phase 2 cleanup
      // migration drops them, and this block goes with it. `manifest` has no
      // writer at all — a deploy pins the step manifest it shipped in its own
      // `deployments.config_snapshot`, which is what run telemetry reads.
      sourceMode: 'generated',
      source: null,
      manifest: null,
      baseGeneratedHash: null,
      locked: 0,
      createdBy: data.createdBy ?? null,
      createdAt: now,
    }
    if (data.version !== undefined) {
      const explicit = { ...row, version: data.version }
      await this.db.insert(this.table).values(explicit)
      return explicit
    }
    // Assign MAX(version)+1 in the INSERT itself. SQLite serializes writers
    // so this is fully atomic; Postgres can still collide under concurrency
    // (two INSERTs reading the same MAX), so the unique-index loser retries.
    const versionExpr = sql`(SELECT COALESCE(MAX(${sql.raw('version')}), 0) + 1 FROM ${this.table} WHERE ${sql.raw('workflow_id')} = ${data.workflowId})`
    for (let attempt = 0; ; attempt++) {
      try {
        const inserted = await this.db
          .insert(this.table)
          .values({ ...row, version: versionExpr })
          .returning({ version: this.table.version })
        return { ...row, version: inserted[0]!.version }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        if (attempt < 2 && /unique/i.test(message)) continue
        throw err
      }
    }
  }

  async getById(id: string): Promise<WorkflowVersion | null> {
    const rows = await this.db.select().from(this.table).where(eq(this.table.id, id)).limit(1)
    return rows[0] ?? null
  }

  /**
   * The workflow's latest version (highest number), with whether it has ever
   * gone out on any account — live there now or since taken down. A save
   * starts a new version after that one, else it saves over it. One statement.
   */
  async latestForSave(workflowId: string): Promise<LatestVersionForSave | null> {
    const d = aliasedTable(this.deployments, 'lsd')
    // Select-list columns go unqualified: the outer version is named outright.
    const outerId = sql.raw('"workflow_versions"."id"')
    const rows = await this.db
      .select({
        ...getTableColumns(this.table),
        everDeployed: sql<unknown>`exists (select 1 from ${aliasedFrom(d)} where ${d.workflowId} = ${workflowId} and ${d.versionId} = ${outerId} and ${d.status} in ('success', 'taken_down'))`,
      })
      .from(this.table)
      .where(eq(this.table.workflowId, workflowId))
      .orderBy(desc(this.table.version))
      .limit(1)
    const row = rows[0] as (WorkflowVersion & { everDeployed: unknown }) | undefined
    if (!row) return null
    const { everDeployed, ...version } = row
    return { version, everDeployed: truthy(everDeployed) }
  }

  async getMaxVersionNumber(workflowId: string): Promise<number> {
    const rows = await this.db
      .select({ max: max(this.table.version) })
      .from(this.table)
      .where(eq(this.table.workflowId, workflowId))
    return rows[0]?.max ?? 0
  }

  async listByWorkflow(
    workflowId: string,
    pagination?: PaginationParams,
  ): Promise<PaginatedResult<WorkflowVersionListItem>> {
    const limit = clampLimit(pagination?.limit)
    const conditions = [eq(this.table.workflowId, workflowId)]
    if (pagination?.cursor) {
      const { id: cursorId, timestamp } = decodeCursor(pagination.cursor)
      conditions.push(
        or(
          lt(this.table.createdAt, timestamp),
          and(eq(this.table.createdAt, timestamp), lt(this.table.id, cursorId)),
        )!,
      )
    }
    // The author's name in the same statement.
    const rows: WorkflowVersionListItem[] = await this.db
      .select({ ...getTableColumns(this.table), createdByName: this.user.name })
      .from(this.table)
      .leftJoin(this.user, eq(this.user.id, this.table.createdBy))
      .where(and(...conditions))
      .orderBy(desc(this.table.createdAt), desc(this.table.id))
      .limit(limit + 1)
    return paginateResults(rows, limit, (r) => r.createdAt)
  }

  async update(id: string, data: UpdateVersionData): Promise<void> {
    await this.db.update(this.table).set(data).where(eq(this.table.id, id))
  }

  /**
   * What decides whether a version may be deleted, in one statement: its
   * number and lock, how many newer versions the workflow has, whether it is
   * the workflow's current version, and whether it is live on any of the
   * workflow's accounts. Null when it isn't that workflow's version.
   */
  async deleteCheck(versionId: string, workflowId: string): Promise<VersionDeleteCheck | null> {
    const t = this.table
    const w = this.workflows
    const d = aliasedTable(this.deployments, 'dcd')
    const newer = aliasedTable(this.deployments, 'dcn')
    // Select-list columns go unqualified: the outer version is named outright.
    const outerVersion = sql.raw('"workflow_versions"."version"')
    const rows = await this.db
      .select({
        version: t.version,
        locked: t.locked,
        newerVersions: sql<
          number | string
        >`(select count(*) from ${t} newer where newer.workflow_id = ${workflowId} and newer.version > ${outerVersion})`,
        isCurrent: sql<unknown>`exists (select 1 from ${w} where ${w.id} = ${workflowId} and ${w.currentVersionId} = ${versionId})`,
        isLive: sql<unknown>`exists (select 1 from ${aliasedFrom(d)} where ${d.workflowId} = ${workflowId} and ${d.versionId} = ${versionId} and ${liveOnItsAccount(d, newer)})`,
      })
      .from(t)
      .where(and(eq(t.id, versionId), eq(t.workflowId, workflowId)))
      .limit(1)
    const row = rows[0]
    if (!row) return null
    return {
      version: row.version,
      locked: row.locked === 1,
      newerVersions: Number(row.newerVersions),
      isCurrent: truthy(row.isCurrent),
      isLive: truthy(row.isLive),
    }
  }

  async delete(id: string): Promise<void> {
    await this.db.delete(this.table).where(eq(this.table.id, id))
  }
}
