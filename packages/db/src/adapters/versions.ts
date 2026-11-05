import { eq, desc, max, and, or, lt, sql, getTableColumns } from 'drizzle-orm'
import type {
  CreateVersionData,
  UpdateVersionData,
  WorkflowVersion,
  WorkflowVersionListItem,
} from '../types.js'
import type { PaginationParams, PaginatedResult } from '../pagination.js'
import { clampLimit, decodeCursor, paginateResults } from '../pagination.js'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyTable = any

export class VersionsAdapter {
  constructor(
    private db: AnyTable,
    private table: AnyTable,
    private user: AnyTable,
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

  async delete(id: string): Promise<void> {
    await this.db.delete(this.table).where(eq(this.table.id, id))
  }
}
