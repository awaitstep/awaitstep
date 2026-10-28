import { eq, desc, and, or, lt, aliasedTable } from 'drizzle-orm'
import type {
  OrgMemberSummary,
  Project,
  ProjectOverview,
  Workspace,
  WorkspaceChip,
} from '../types.js'
import type { PaginationParams, PaginatedResult } from '../pagination.js'
import { clampLimit, decodeCursor, paginateResults } from '../pagination.js'
import { atomically } from './atomic.js'
import { readJsonArray, type Dialect } from './json-array.js'
import { OverviewFields, type OverviewTables } from './overview-fields.js'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyTable = any

export class ProjectsAdapter {
  private fields: OverviewFields

  constructor(
    private db: AnyTable,
    private t: OverviewTables,
    dialect: Dialect,
  ) {
    this.fields = new OverviewFields(t, dialect)
  }

  private get table(): AnyTable {
    return this.t.projects
  }

  /**
   * A project is never without a workspace: its Default one is written in
   * the same unit of work (`atomically`), so a failure leaves neither row.
   */
  async create(data: {
    id: string
    organizationId: string
    name: string
    slug: string
    description?: string
    defaultWorkspaceId: string
    createdBy?: string | null
  }): Promise<{ project: Project; workspace: Workspace }> {
    const now = new Date().toISOString()
    const project: Project = {
      id: data.id,
      organizationId: data.organizationId,
      name: data.name,
      slug: data.slug,
      description: data.description ?? null,
      lockedBy: null,
      lockedAt: null,
      createdAt: now,
      updatedAt: now,
    }
    const workspace: Workspace = {
      id: data.defaultWorkspaceId,
      projectId: data.id,
      name: 'Default',
      slug: 'default',
      description: null,
      colour: 'green',
      createdBy: data.createdBy ?? null,
      lockedBy: null,
      lockedAt: null,
      createdAt: now,
      updatedAt: now,
    }
    await atomically(this.db, (tx) => [
      tx.insert(this.table).values(project),
      tx.insert(this.t.workspaces).values(workspace),
    ])
    return { project, workspace }
  }

  async getById(id: string): Promise<Project | null> {
    const rows = await this.db.select().from(this.table).where(eq(this.table.id, id)).limit(1)
    return rows[0] ?? null
  }

  /** Each project with its workspaces, health and people: what a project card shows. */
  async listByOrganization(
    organizationId: string,
    pagination?: PaginationParams,
  ): Promise<PaginatedResult<ProjectOverview>> {
    const p = aliasedTable(this.table, 'p')
    const locker = aliasedTable(this.t.user, 'locker')
    const limit = clampLimit(pagination?.limit)
    const conditions = [eq(p.organizationId, organizationId)]
    if (pagination?.cursor) {
      const { id: cursorId, timestamp } = decodeCursor(pagination.cursor)
      conditions.push(
        or(lt(p.createdAt, timestamp), and(eq(p.createdAt, timestamp), lt(p.id, cursorId)))!,
      )
    }
    const rows = await this.db
      .select({
        project: p,
        workspaces: this.fields.workspaceChips(p.id),
        health: this.fields.projectHealth(p.id),
        lockedByName: locker.name,
        members: this.fields.members(p.organizationId),
      })
      .from(p)
      .leftJoin(locker, eq(locker.id, p.lockedBy))
      .where(and(...conditions))
      .orderBy(desc(p.createdAt), desc(p.id))
      .limit(limit + 1)
    const overviews: ProjectOverview[] = rows.map(
      (row: {
        project: Project
        workspaces: unknown
        health: ProjectOverview['health']
        lockedByName: string | null
        members: unknown
      }) => ({
        ...row.project,
        workspaces: readJsonArray<WorkspaceChip>(row.workspaces),
        health: row.health,
        lockedByName: row.lockedByName,
        members: readJsonArray<OrgMemberSummary>(row.members),
      }),
    )
    return paginateResults(overviews, limit, (r) => r.createdAt)
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
