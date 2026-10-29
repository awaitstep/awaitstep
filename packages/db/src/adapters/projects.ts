import {
  eq,
  desc,
  and,
  or,
  lt,
  sql,
  aliasedTable,
  getTableName,
  isNull,
  notExists,
  type SQL,
} from 'drizzle-orm'
import type {
  LockRow,
  OrgMemberSummary,
  Project,
  ProjectLocks,
  ProjectOverview,
  Workspace,
  WorkspaceChip,
} from '../types.js'
import type { PaginationParams, PaginatedResult } from '../pagination.js'
import { clampLimit, decodeCursor, paginateResults } from '../pagination.js'
import { atomically } from './atomic.js'
import { readJsonArray, type Dialect } from './json-array.js'
import { OverviewFields, type OverviewTables } from './overview-fields.js'
import { holdingProjectRow } from './project-row.js'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyTable = any

export class ProjectsAdapter {
  private fields: OverviewFields

  constructor(
    private db: AnyTable,
    private t: OverviewTables,
    private dialect: Dialect,
  ) {
    this.fields = new OverviewFields(t, dialect)
  }

  private get table(): AnyTable {
    return this.t.projects
  }

  /**
   * A project is never without a workspace: its Default one is written in
   * the same unit of work (`atomically`), so a failure leaves neither row.
   * Its creator becomes its admin in the same unit, unless they run the
   * organization and need no row.
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
    const pm = this.t.projectMembers
    const m = aliasedTable(this.t.member, 'creator_member')
    await atomically(this.db, (tx) => [
      tx.insert(this.table).values(project),
      tx.insert(this.t.workspaces).values(workspace),
      ...(data.createdBy
        ? [
            tx.insert(pm).select(
              tx
                .select({
                  projectId: sql`${data.id}`,
                  userId: m.userId,
                  role: sql`'admin'`,
                  createdBy: sql`${data.createdBy}`,
                  createdAt: sql`${now}`,
                })
                .from(m)
                .where(
                  and(
                    eq(m.organizationId, data.organizationId),
                    eq(m.userId, data.createdBy),
                    sql`${m.role} not in ('owner', 'admin')`,
                  ),
                ),
            ),
          ]
        : []),
    ])
    return { project, workspace }
  }

  async getById(id: string): Promise<Project | null> {
    const rows = await this.db.select().from(this.table).where(eq(this.table.id, id)).limit(1)
    return rows[0] ?? null
  }

  /** How many projects the organization still has: deleting it waits for them. */
  async countByOrganization(organizationId: string): Promise<number> {
    const rows = await this.db
      .select({ n: sql<number>`count(*)`.mapWith(Number) })
      .from(this.table)
      .where(eq(this.table.organizationId, organizationId))
    return rows[0]?.n ?? 0
  }

  /**
   * Each project the viewer can open, with its workspaces, health and
   * people as the viewer may see them: what a project card shows.
   */
  async listByOrganization(
    organizationId: string,
    userId: string,
    pagination?: PaginationParams,
  ): Promise<PaginatedResult<ProjectOverview>> {
    const p = aliasedTable(this.table, 'p')
    const locker = aliasedTable(this.t.user, 'locker')
    const pm = aliasedTable(this.t.projectMembers, 'vpm')
    const viewer = { userId, organizationId: p.organizationId }
    const limit = clampLimit(pagination?.limit)
    const conditions = [
      eq(p.organizationId, organizationId),
      this.fields.roles.projectVisible(userId, {
        organizationId: p.organizationId,
        projectId: p.id,
      }),
    ]
    if (pagination?.cursor) {
      const { id: cursorId, timestamp } = decodeCursor(pagination.cursor)
      conditions.push(
        or(lt(p.createdAt, timestamp), and(eq(p.createdAt, timestamp), lt(p.id, cursorId)))!,
      )
    }
    const rows = await this.db
      .select({
        project: p,
        workspaces: this.fields.workspaceChips(p.id, viewer),
        health: this.fields.projectHealth(p.id, viewer),
        lockedByName: locker.name,
        lockedWorkspaces: this.fields.lockedWorkspaceNames(p.id),
        members: this.fields.projectPeople(p.id, viewer),
        orgRole: this.fields.roles.orgRoleOf(userId, p.organizationId),
        projectGrant: pm.role,
      })
      .from(p)
      .leftJoin(
        locker,
        and(eq(locker.id, p.lockedBy), this.fields.inOrganization(locker.id, p.organizationId)),
      )
      .leftJoin(pm, and(eq(pm.projectId, p.id), eq(pm.userId, userId)))
      .where(and(...conditions))
      .orderBy(desc(p.createdAt), desc(p.id))
      .limit(limit + 1)
    const overviews: ProjectOverview[] = rows.map(
      (row: {
        project: Project
        workspaces: unknown
        health: ProjectOverview['health']
        lockedByName: string | null
        lockedWorkspaces: unknown
        members: unknown
        orgRole: string | null
        projectGrant: ProjectOverview['viewer']['projectGrant']
      }) => ({
        ...row.project,
        workspaces: readJsonArray<WorkspaceChip>(row.workspaces),
        health: row.health,
        lockedByName: row.lockedByName,
        lockedWorkspaces: readJsonArray<string>(row.lockedWorkspaces),
        members: readJsonArray<OrgMemberSummary>(row.members),
        viewer: { orgRole: row.orgRole, projectGrant: row.projectGrant, workspaceGrant: null },
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

  /**
   * Neither the project nor a workspace in it may be locked; checked in the
   * statement, with the project's row held first so a workspace lock being
   * set at the same moment is either seen or waits for the delete.
   */
  async delete(id: string, organizationId: string): Promise<boolean> {
    const w = aliasedTable(this.t.workspaces, 'lw')
    const rows = await holdingProjectRow<{ id: string }[]>(
      this.db,
      this.dialect,
      this.table,
      id,
      'update',
      (db) =>
        db
          .delete(this.table)
          .where(
            and(
              eq(this.table.id, id),
              eq(this.table.organizationId, organizationId),
              isNull(this.table.lockedAt),
              notExists(
                db
                  .select({ one: sql`1` })
                  .from(w)
                  .where(and(eq(w.projectId, id), sql`${w.lockedAt} is not null`)),
              ),
            ),
          )
          .returning({ id: this.table.id }),
    )
    return rows.length > 0
  }

  async getLocks(id: string, organizationId: string): Promise<ProjectLocks | null> {
    const p = aliasedTable(this.table, 'p')
    const rows = await this.db
      .select({
        lockedAt: p.lockedAt,
        // Bound to the id: a select without joins leaves its columns unqualified,
        // and the subquery's own table would claim them.
        lockedWorkspaces: this.fields.lockedWorkspaceNames(id),
      })
      .from(p)
      .where(and(eq(p.id, id), eq(p.organizationId, organizationId)))
      .limit(1)
    const row = rows[0]
    if (!row) return null
    return {
      ownLock: row.lockedAt !== null,
      lockedWorkspaces: readJsonArray<string>(row.lockedWorkspaces),
    }
  }

  async setLock(
    id: string,
    organizationId: string,
    userId: string,
    locked: boolean,
  ): Promise<LockRow | null> {
    const rows = await this.db
      .update(this.table)
      .set(lockValues(this.table, userId, locked))
      .where(and(eq(this.table.id, id), eq(this.table.organizationId, organizationId)))
      .returning(lockReturning(this.table, this.t.user, this.fields, organizationId))
    return rows[0] ?? null
  }
}

/**
 * The columns a lock write sets: turning on a lock that is already on keeps
 * who set it and when, so two people flipping it on leave the first. A lock
 * is on when `locked_at` is set; one with no setter on record gets this one.
 */
export function lockValues(table: AnyTable, userId: string, locked: boolean) {
  if (!locked) return { lockedBy: null, lockedAt: null }
  return {
    lockedBy: sql`case when ${table.lockedAt} is null then ${userId} else coalesce(${table.lockedBy}, ${userId}) end`,
    lockedAt: sql`coalesce(${table.lockedAt}, ${new Date().toISOString()})`,
  }
}

/**
 * The lock as the write left it, with the setter's name read in the same
 * statement while they are in `organizationId`. Every column is spelled out
 * with its table: RETURNING renders columns bare, and a bare one inside the
 * subquery would bind to the innermost table that has it.
 */
export function lockReturning(
  table: AnyTable,
  users: AnyTable,
  fields: OverviewFields,
  organizationId: SQL | string,
) {
  const col = (t: string, c: string) => sql`${sql.identifier(t)}.${sql.identifier(c)}`
  const lockedBy = col(getTableName(table), 'locked_by')
  const lockerId = col('locker', users.id.name)
  return {
    lockedBy: table.lockedBy,
    lockedAt: table.lockedAt,
    lockedByName: sql<
      string | null
    >`(select ${col('locker', users.name.name)} from ${sql.identifier(getTableName(users))} ${sql.identifier('locker')} where ${lockerId} = ${lockedBy} and ${fields.inOrganization(lockerId, organizationId)})`,
  }
}
