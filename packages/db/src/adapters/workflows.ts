import { eq, desc, and, or, lt } from 'drizzle-orm'
import type { Workflow } from '../types.js'
import type { PaginationParams, PaginatedResult } from '../pagination.js'
import { clampLimit, decodeCursor, paginateResults } from '../pagination.js'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyTable = any

export class WorkflowsAdapter {
  constructor(
    private db: AnyTable,
    private table: AnyTable,
  ) {}

  async create(data: {
    id: string
    projectId: string
    createdBy: string
    name: string
    description?: string
  }): Promise<Workflow> {
    const now = new Date().toISOString()
    const row = {
      id: data.id,
      projectId: data.projectId,
      createdBy: data.createdBy,
      name: data.name,
      description: data.description ?? null,
      currentVersionId: null,
      envVars: null,
      triggerCode: null,
      dependencies: null,
      deployConfig: null,
      createdAt: now,
      updatedAt: now,
    }
    await this.db.insert(this.table).values(row)
    return row
  }

  async getById(id: string): Promise<Workflow | null> {
    const rows = await this.db.select().from(this.table).where(eq(this.table.id, id)).limit(1)
    return rows[0] ?? null
  }

  async listByProject(
    projectId: string,
    pagination?: PaginationParams,
  ): Promise<PaginatedResult<Workflow>> {
    const limit = clampLimit(pagination?.limit)
    const conditions = [eq(this.table.projectId, projectId)]
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

  async update(
    id: string,
    data: {
      name?: string
      description?: string
      currentVersionId?: string | null
      envVars?: string | null
      triggerCode?: string | null
      dependencies?: string | null
      deployConfig?: string | null
      projectId?: string
    },
  ): Promise<Workflow> {
    const now = new Date().toISOString()
    await this.db
      .update(this.table)
      .set({ ...data, updatedAt: now })
      .where(eq(this.table.id, id))
    const updated = await this.getById(id)
    if (!updated) throw new Error(`Workflow ${id} not found`)
    return updated
  }

  async delete(id: string): Promise<void> {
    await this.db.delete(this.table).where(eq(this.table.id, id))
  }
}
