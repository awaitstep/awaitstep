import { eq, desc, and, or, lt, asc, exists, sql, aliasedTable } from 'drizzle-orm'
import type { Workflow } from '../types.js'
import { boundFields } from './insert-where.js'
import { aliasedFrom } from './json-array.js'
import type { PaginationParams, PaginatedResult } from '../pagination.js'
import { clampLimit, decodeCursor, paginateResults } from '../pagination.js'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyTable = any

export class WorkflowsAdapter {
  constructor(
    private db: AnyTable,
    private table: AnyTable,
    private workspacesTable: AnyTable,
  ) {}

  /**
   * Writes the workflow into `workspaceId` if that workspace is the
   * project's, or into the project's oldest workspace when none is named —
   * an `INSERT … SELECT` over the workspaces table, so the check or the
   * choice and the write are one statement. Null when the named workspace is
   * not the project's.
   */
  async create(data: {
    id: string
    projectId: string
    workspaceId?: string | null
    createdBy: string
    name: string
    description?: string
    kind?: 'workflow' | 'script'
  }): Promise<Workflow | null> {
    const now = new Date().toISOString()
    const row = {
      id: data.id,
      projectId: data.projectId,
      createdBy: data.createdBy,
      name: data.name,
      description: data.description ?? null,
      kind: data.kind ?? 'workflow',
      currentVersionId: null,
      envVars: null,
      triggerCode: null,
      dependencies: null,
      deployConfig: null,
      createdAt: now,
      updatedAt: now,
    }
    const ws = this.workspacesTable
    const fields = { ...boundFields(this.table, row), workspaceId: ws.id }
    const pick = data.workspaceId
      ? and(eq(ws.projectId, data.projectId), eq(ws.id, data.workspaceId))
      : eq(ws.projectId, data.projectId)
    const rows = await this.db
      .insert(this.table)
      .select(
        this.db.select(fields).from(ws).where(pick).orderBy(asc(ws.createdAt), asc(ws.id)).limit(1),
      )
      .returning()
    return (rows[0] as Workflow | undefined) ?? null
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

  /**
   * Moves the workflow to another project and into that project's oldest
   * workspace, in one statement, leaving its share behind: a workflow left pointing at a workspace of
   * its old project would be read, counted and cascade-deleted there. Null
   * when the target has no workspace (every project has one) or the
   * workflow is gone.
   */
  async moveToProject(id: string, targetProjectId: string): Promise<Workflow | null> {
    const home = aliasedTable(this.workspacesTable, 'home')
    const oldest = sql`(select ${home.id} from ${aliasedFrom(home)} where ${home.projectId} = ${targetProjectId} order by ${home.createdAt}, ${home.id} limit 1)`
    const rows = await this.db
      .update(this.table)
      .set({
        projectId: targetProjectId,
        workspaceId: oldest,
        // A share is to one project: it does not follow the workflow out.
        sharedBy: null,
        sharedAt: null,
        updatedAt: new Date().toISOString(),
      })
      .where(
        and(
          eq(this.table.id, id),
          exists(
            this.db.select({ id: home.id }).from(home).where(eq(home.projectId, targetProjectId)),
          ),
        ),
      )
      .returning()
    return (rows[0] as Workflow | undefined) ?? null
  }
}
