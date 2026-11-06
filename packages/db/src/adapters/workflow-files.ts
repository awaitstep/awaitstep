import { eq, and, asc, sql } from 'drizzle-orm'
import type { UpsertWorkflowFileData, WorkflowFile, WorkflowFileSummary } from '../types.js'
import { atomicallyReturning } from './atomic.js'
import { chunked, rowsPerInsert } from './statement-params.js'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyTable = any

/**
 * Project-owned files. Rows are scoped by workflowId only — the route layer
 * has already resolved the workflow inside the caller's project, so no
 * second ownership lookup is needed here.
 */
export class WorkflowFilesAdapter {
  constructor(
    private db: AnyTable,
    private table: AnyTable,
  ) {}

  async listByWorkflow(workflowId: string): Promise<WorkflowFile[]> {
    return this.db
      .select()
      .from(this.table)
      .where(eq(this.table.workflowId, workflowId))
      .orderBy(asc(this.table.path))
  }

  /** Every file's metadata, no text — a listing must not pull 2 MB of source. */
  async listSummariesByWorkflow(workflowId: string): Promise<WorkflowFileSummary[]> {
    return this.db
      .select({
        id: this.table.id,
        workflowId: this.table.workflowId,
        path: this.table.path,
        hash: this.table.hash,
        size: this.table.size,
        createdAt: this.table.createdAt,
        updatedAt: this.table.updatedAt,
      })
      .from(this.table)
      .where(eq(this.table.workflowId, workflowId))
      .orderBy(asc(this.table.path))
  }

  async getByPath(workflowId: string, path: string): Promise<WorkflowFile | null> {
    const rows = await this.db
      .select()
      .from(this.table)
      .where(and(eq(this.table.workflowId, workflowId), eq(this.table.path, path)))
      .limit(1)
    return rows[0] ?? null
  }

  /**
   * Create-or-replace on the (workflowId, path) identity, as one unit: stored
   * ids and createdAt survive conflicts, everything else is the incoming
   * write. A few rows per statement — D1 binds at most 100 parameters.
   */
  async upsertMany(rows: UpsertWorkflowFileData[]): Promise<WorkflowFile[]> {
    if (rows.length === 0) return []
    const results = await atomicallyReturning<WorkflowFile>(this.db, (tx) =>
      this.upsertStatements(tx, rows),
    )
    return results.flat()
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private upsertStatements(tx: any, rows: UpsertWorkflowFileData[]) {
    const now = new Date().toISOString()
    // One row per path, the last one winning: a path twice in one statement
    // is an error on Postgres, and across chunks it would come back twice.
    const byPath = new Map(rows.map((data) => [`${data.workflowId}\u0000${data.path}`, data]))
    const values = [...byPath.values()].map((data) => ({
      id: data.id,
      workflowId: data.workflowId,
      path: data.path,
      source: data.source,
      hash: data.hash,
      size: data.size,
      createdAt: now,
      updatedAt: now,
    }))
    return chunked(values, rowsPerInsert(this.table)).map((some) =>
      tx
        .insert(this.table)
        .values(some)
        .onConflictDoUpdate({
          target: [this.table.workflowId, this.table.path],
          set: {
            source: sql`excluded.source`,
            hash: sql`excluded.hash`,
            size: sql`excluded.size`,
            updatedAt: sql`excluded.updated_at`,
          },
        })
        .returning(),
    )
  }

  async upsert(data: UpsertWorkflowFileData): Promise<WorkflowFile> {
    const [row] = await this.upsertMany([data])
    return row!
  }

  /**
   * Insert only: the "must not exist" precondition rides in the INSERT's
   * conflict clause, so two writers creating the same path cannot both
   * succeed. Null when the path was already taken.
   */
  /**
   * Insert-only for a set, as one unit: paths already stored are left as
   * they are (a writer who got there first wins), the rest are created.
   * Returns only the rows this call wrote. A few rows per statement, as
   * `upsertMany`.
   */
  async createManyIfAbsent(rows: UpsertWorkflowFileData[]): Promise<WorkflowFile[]> {
    if (rows.length === 0) return []
    const now = new Date().toISOString()
    const byPath = new Map(rows.map((data) => [`${data.workflowId}\u0000${data.path}`, data]))
    const values = [...byPath.values()].map((data) => ({
      id: data.id,
      workflowId: data.workflowId,
      path: data.path,
      source: data.source,
      hash: data.hash,
      size: data.size,
      createdAt: now,
      updatedAt: now,
    }))
    const results = await atomicallyReturning<WorkflowFile>(this.db, (tx) =>
      chunked(values, rowsPerInsert(this.table)).map((some) =>
        tx
          .insert(this.table)
          .values(some)
          .onConflictDoNothing({ target: [this.table.workflowId, this.table.path] })
          .returning(),
      ),
    )
    return results.flat()
  }

  async createIfAbsent(data: UpsertWorkflowFileData): Promise<WorkflowFile | null> {
    const now = new Date().toISOString()
    const rows = await this.db
      .insert(this.table)
      .values({
        id: data.id,
        workflowId: data.workflowId,
        path: data.path,
        source: data.source,
        hash: data.hash,
        size: data.size,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoNothing({ target: [this.table.workflowId, this.table.path] })
      .returning()
    return rows[0] ?? null
  }

  /**
   * Conditional replace for optimistic concurrency: the precondition rides
   * in the UPDATE's own WHERE clause, so two writers racing on the same
   * file cannot both succeed. `expectedHash` of `'*'` only requires the
   * file to exist. Null when nothing matched (missing or changed).
   */
  async updateIfMatches(
    data: UpsertWorkflowFileData,
    expectedHash: string,
  ): Promise<WorkflowFile | null> {
    const rows = await this.db
      .update(this.table)
      .set({
        source: data.source,
        hash: data.hash,
        size: data.size,
        updatedAt: new Date().toISOString(),
      })
      .where(
        and(
          eq(this.table.workflowId, data.workflowId),
          eq(this.table.path, data.path),
          ...(expectedHash !== '*' ? [eq(this.table.hash, expectedHash)] : []),
        ),
      )
      .returning()
    return rows[0] ?? null
  }

  /**
   * Makes `rows` the workflow's entire file set (a version revert), as one
   * unit: a failed write never leaves the workflow with its files deleted.
   */
  async replaceAll(workflowId: string, rows: UpsertWorkflowFileData[]): Promise<WorkflowFile[]> {
    const [, ...written] = await atomicallyReturning<WorkflowFile>(this.db, (tx) => [
      // Every statement of the unit returns rows, so the delete names what it
      // removed too; its ids are dropped.
      tx
        .delete(this.table)
        .where(eq(this.table.workflowId, workflowId))
        .returning({ id: this.table.id }),
      ...(rows.length > 0 ? this.upsertStatements(tx, rows) : []),
    ])
    return written.flat()
  }

  /**
   * True when a row was removed. With `expectedHash` the delete is
   * conditional in the same statement (optimistic concurrency), so a stale
   * caller removes nothing instead of racing a newer write.
   */
  async deleteByPath(workflowId: string, path: string, expectedHash?: string): Promise<boolean> {
    const rows = await this.db
      .delete(this.table)
      .where(
        and(
          eq(this.table.workflowId, workflowId),
          eq(this.table.path, path),
          ...(expectedHash !== undefined ? [eq(this.table.hash, expectedHash)] : []),
        ),
      )
      .returning({ id: this.table.id })
    return rows.length > 0
  }
}
