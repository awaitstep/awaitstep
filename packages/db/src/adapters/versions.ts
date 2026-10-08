import { eq, desc, max, and, or, lt, sql } from 'drizzle-orm'
import type { CreateVersionData, UpdateVersionData, WorkflowVersion } from '../types.js'
import type { PaginationParams, PaginatedResult } from '../pagination.js'
import { clampLimit, decodeCursor, paginateResults } from '../pagination.js'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyTable = any

export class VersionsAdapter {
  constructor(
    private db: AnyTable,
    private table: AnyTable,
  ) {}

  async create(data: CreateVersionData): Promise<WorkflowVersion> {
    const now = new Date().toISOString()
    const row = {
      id: data.id,
      workflowId: data.workflowId,
      ir: data.ir,
      sourceMode: data.sourceMode ?? 'generated',
      source: data.source ?? null,
      manifest: data.manifest ?? null,
      baseGeneratedHash: data.baseGeneratedHash ?? null,
      locked: 0,
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
  ): Promise<PaginatedResult<WorkflowVersion>> {
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
    const rows = await this.db
      .select()
      .from(this.table)
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
