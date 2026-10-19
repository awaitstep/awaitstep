import { eq, and, asc, sql } from 'drizzle-orm'
import type { UpsertWorkflowFileData, WorkflowFile } from '../types.js'

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

  async getByPath(workflowId: string, path: string): Promise<WorkflowFile | null> {
    const rows = await this.db
      .select()
      .from(this.table)
      .where(and(eq(this.table.workflowId, workflowId), eq(this.table.path, path)))
      .limit(1)
    return rows[0] ?? null
  }

  /**
   * Create-or-replace on the (workflowId, path) identity, one statement for
   * the whole batch: stored ids and createdAt survive conflicts, everything
   * else is the incoming write.
   */
  async upsertMany(rows: UpsertWorkflowFileData[]): Promise<WorkflowFile[]> {
    if (rows.length === 0) return []
    const now = new Date().toISOString()
    return this.db
      .insert(this.table)
      .values(
        rows.map((data) => ({
          id: data.id,
          workflowId: data.workflowId,
          path: data.path,
          source: data.source,
          hash: data.hash,
          size: data.size,
          createdAt: now,
          updatedAt: now,
        })),
      )
      .onConflictDoUpdate({
        target: [this.table.workflowId, this.table.path],
        set: {
          source: sql`excluded.source`,
          hash: sql`excluded.hash`,
          size: sql`excluded.size`,
          updatedAt: sql`excluded.updated_at`,
        },
      })
      .returning()
  }

  async upsert(data: UpsertWorkflowFileData): Promise<WorkflowFile> {
    const [row] = await this.upsertMany([data])
    return row!
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

  /** Makes `rows` the workflow's entire file set (a version revert). */
  async replaceAll(workflowId: string, rows: UpsertWorkflowFileData[]): Promise<WorkflowFile[]> {
    await this.db.delete(this.table).where(eq(this.table.workflowId, workflowId))
    return this.upsertMany(rows)
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
