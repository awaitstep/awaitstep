import { eq, desc, and, or, lt } from 'drizzle-orm'
import type { Project } from '../types.js'
import type { PaginationParams, PaginatedResult } from '../pagination.js'
import { clampLimit, decodeCursor, paginateResults } from '../pagination.js'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyTable = any

export class ProjectsAdapter {
  constructor(
    private db: AnyTable,
    private table: AnyTable,
  ) {}

  async create(data: {
    id: string
    organizationId: string
    name: string
    slug: string
    description?: string
  }): Promise<Project> {
    const now = new Date().toISOString()
    const row = {
      id: data.id,
      organizationId: data.organizationId,
      name: data.name,
      slug: data.slug,
      description: data.description ?? null,
      createdAt: now,
      updatedAt: now,
    }
    await this.db.insert(this.table).values(row)
    return row
  }

  async getById(id: string): Promise<Project | null> {
    const rows = await this.db.select().from(this.table).where(eq(this.table.id, id)).limit(1)
    return rows[0] ?? null
  }

  async listByOrganization(
    organizationId: string,
    pagination?: PaginationParams,
  ): Promise<PaginatedResult<Project>> {
    const limit = clampLimit(pagination?.limit)
    const conditions = [eq(this.table.organizationId, organizationId)]
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

  /** The organization check rides in the WHERE — one statement, no prior read. */
  async update(
    id: string,
    organizationId: string,
    data: { name?: string; slug?: string; description?: string },
  ): Promise<Project | null> {
    const now = new Date().toISOString()
    const rows = await this.db
      .update(this.table)
      .set({ ...data, updatedAt: now })
      .where(and(eq(this.table.id, id), eq(this.table.organizationId, organizationId)))
      .returning()
    return rows[0] ?? null
  }

  async delete(id: string, organizationId: string): Promise<boolean> {
    const rows = await this.db
      .delete(this.table)
      .where(and(eq(this.table.id, id), eq(this.table.organizationId, organizationId)))
      .returning({ id: this.table.id })
    return rows.length > 0
  }
}
