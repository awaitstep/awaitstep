import { and, asc, eq, inArray, ne, notExists, sql, aliasedTable } from 'drizzle-orm'
import type {
  CreateWorkspaceData,
  UpdateWorkspaceData,
  Workspace,
  WorkspaceGrant,
  WorkspaceOverview,
  WorkspacePersonRow,
} from '../types.js'
import { atomically } from './atomic.js'
import { boundFields, insertWhere } from './insert-where.js'
import { aliasedFrom, type Dialect } from './json-array.js'
import { OverviewFields, type OverviewTables } from './overview-fields.js'
import { readPeople } from './people.js'

const DAY_MS = 24 * 60 * 60 * 1000

export class WorkspacesAdapter {
  private fields: OverviewFields

  constructor(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    private db: any,
    private t: OverviewTables,
    private dialect: Dialect,
  ) {
    this.fields = new OverviewFields(t, dialect)
  }

  /**
   * The project's workspaces the viewer can open, with their counts and
   * people, oldest first: the switcher's order.
   */
  async listByProject(
    projectId: string,
    userId: string,
    now = new Date(),
  ): Promise<WorkspaceOverview[]> {
    const p = aliasedTable(this.t.projects, 'p')
    const w = aliasedTable(this.t.workspaces, 'w')
    const pm = aliasedTable(this.t.projectMembers, 'vpm')
    const wm = aliasedTable(this.t.workspaceMembers, 'vwm')
    const creator = aliasedTable(this.t.user, 'creator')
    const locker = aliasedTable(this.t.user, 'locker')
    const since = new Date(now.getTime() - DAY_MS).toISOString()
    const roles = this.fields.roles
    const orgRole = roles.orgRoleOf(userId, p.organizationId)
    const rows = await this.db
      .select({
        workspace: w,
        counts: this.fields.workspaceCounts(w.id, since),
        createdByName: creator.name,
        lockedByName: locker.name,
        projectName: p.name,
        projectLockedAt: p.lockedAt,
        siblings: this.fields.workspaceCount(p.id),
        members: this.fields.workspacePeople(w.id, p.id, p.organizationId),
        orgRole,
        projectGrant: pm.role,
        workspaceGrant: wm.role,
      })
      .from(w)
      .innerJoin(p, eq(p.id, w.projectId))
      .leftJoin(pm, and(eq(pm.projectId, p.id), eq(pm.userId, userId)))
      .leftJoin(wm, and(eq(wm.workspaceId, w.id), eq(wm.userId, userId)))
      .leftJoin(creator, eq(creator.id, w.createdBy))
      .leftJoin(locker, eq(locker.id, w.lockedBy))
      .where(
        and(
          eq(w.projectId, projectId),
          sql`${roles.workspaceRole(orgRole, pm.role, wm.role)} is not null`,
        ),
      )
      .orderBy(asc(w.createdAt), asc(w.id))
    return rows.map(
      (row: {
        workspace: Workspace
        counts: WorkspaceOverview['counts']
        createdByName: string | null
        lockedByName: string | null
        projectName: string
        projectLockedAt: string | null
        siblings: number
        members: unknown
        orgRole: string | null
        projectGrant: WorkspaceOverview['viewer']['projectGrant']
        workspaceGrant: WorkspaceGrant | null
      }) => ({
        ...row.workspace,
        counts: row.counts,
        createdByName: row.createdByName,
        lockedByName: row.lockedByName,
        projectName: row.projectName,
        projectLockedAt: row.projectLockedAt,
        siblings: row.siblings,
        members: readPeople<WorkspacePersonRow>(row.members, this.dialect),
        viewer: {
          orgRole: row.orgRole,
          projectGrant: row.projectGrant,
          workspaceGrant: row.workspaceGrant,
        },
      }),
    )
  }

  /**
   * Null when another workspace in the project already has the slug: the
   * check is part of the insert, so two creates racing for one slug can't
   * both get it. The project's existence was established by the caller.
   *
   * With `members` ("Who can get in → choose people"), the workspace and
   * their rows are one unit; a taken slug then surfaces as the unique
   * index's violation, which the route answers like the null here. Each
   * member row is joined to the organization, so someone outside it (checked
   * by the caller first) is skipped rather than written.
   */
  async create(
    data: CreateWorkspaceData,
    members: { userId: string; role: WorkspaceGrant }[] = [],
  ): Promise<Workspace | null> {
    const now = new Date().toISOString()
    const row: Workspace = {
      id: data.id,
      projectId: data.projectId,
      name: data.name,
      slug: data.slug,
      description: data.description ?? null,
      colour: data.colour ?? 'green',
      createdBy: data.createdBy ?? null,
      lockedBy: null,
      lockedAt: null,
      createdAt: now,
      updatedAt: now,
    }
    const p = this.t.projects
    if (members.length > 0) {
      const wm = this.t.workspaceMembers
      const m = aliasedTable(this.t.member, 'cm')
      const mp = aliasedTable(this.t.projects, 'cmp')
      const roles = this.fields.roles
      await atomically(this.db, (tx) => [
        tx.insert(this.t.workspaces).values(row),
        // Each person's row joins them to the organization, and is written
        // only when it counts above what the project already gives them.
        ...members.map((member) =>
          tx.insert(wm).select(
            tx
              .select(
                boundFields(wm, {
                  workspaceId: data.id,
                  userId: member.userId,
                  role: member.role,
                  createdBy: data.createdBy ?? null,
                  createdAt: now,
                }),
              )
              .from(m)
              .innerJoin(mp, eq(mp.organizationId, m.organizationId))
              .where(
                and(
                  eq(mp.id, data.projectId),
                  eq(m.userId, member.userId),
                  sql`${roles.rank(member.role)} > ${roles.rank(roles.inheritedWorkspaceRole(m.role, roles.projectGrantOf(member.userId, mp.id)))}`,
                ),
              ),
          ),
        ),
      ])
      return row
    }
    const taken = aliasedTable(this.t.workspaces, 'taken')
    const inserted = await insertWhere<Workspace>(
      this.db,
      this.t.workspaces,
      row,
      p,
      and(
        eq(p.id, data.projectId),
        notExists(
          this.db
            .select({ id: taken.id })
            .from(taken)
            .where(and(eq(taken.projectId, data.projectId), eq(taken.slug, data.slug))),
        ),
      )!,
    )
    return inserted ? row : null
  }

  async getById(id: string): Promise<Workspace | null> {
    const w = this.t.workspaces
    const rows = await this.db.select().from(w).where(eq(w.id, id)).limit(1)
    return rows[0] ?? null
  }

  /** Null when the row is gone — or, with a `slug`, when a sibling already uses it. */
  async update(id: string, data: UpdateWorkspaceData): Promise<Workspace | null> {
    const w = this.t.workspaces
    const taken = aliasedTable(this.t.workspaces, 'taken')
    const conditions = [eq(w.id, id)]
    if (data.slug !== undefined) {
      // The table being updated is not aliased, so the outer reference is spelled out.
      conditions.push(
        notExists(
          this.db
            .select({ id: taken.id })
            .from(taken)
            .where(
              and(
                eq(taken.projectId, sql.raw('"workspaces"."project_id"')),
                eq(taken.slug, data.slug),
                ne(taken.id, id),
              ),
            ),
        ),
      )
    }
    const rows = await this.db
      .update(w)
      .set({ ...data, updatedAt: new Date().toISOString() })
      .where(and(...conditions))
      .returning()
    return rows[0] ?? null
  }

  /**
   * Deletes the workspace unless it is its project's last one — the check is
   * in the statement, so two deletes racing cannot empty a project. False
   * when nothing was deleted.
   */
  async deleteUnlessLast(id: string): Promise<boolean> {
    const w = this.t.workspaces
    const sibling = aliasedTable(this.t.workspaces, 'sibling')
    const self = aliasedTable(this.t.workspaces, 'self')
    // "Not the project's last workspace", by its own aliased lookup bound to the id.
    const deletable = sql`exists (select 1 from ${aliasedFrom(self)} where ${self.id} = ${id} and (select count(*) from ${aliasedFrom(sibling)} where ${sibling.projectId} = ${self.projectId}) > 1)`
    // Its keys go with it by the column's cascade, on both dialects.
    const rows = await this.db
      .delete(w)
      .where(and(eq(w.id, id), deletable))
      .returning({ id: w.id })
    return rows.length > 0
  }

  /**
   * Moves `workflowIds` from one workspace to another in the same project.
   * The target's project is checked by the statement, so a target elsewhere
   * moves nothing. Returns the ids that moved.
   */
  async moveWorkflows(
    fromWorkspaceId: string,
    toWorkspaceId: string,
    workflowIds: string[],
  ): Promise<string[]> {
    if (workflowIds.length === 0) return []
    const wf = this.t.workflows
    const source = aliasedTable(this.t.workspaces, 'source')
    const target = aliasedTable(this.t.workspaces, 'target')
    const sameProject = sql`exists (select 1 from ${aliasedFrom(source)} inner join ${aliasedFrom(target)} on ${target.projectId} = ${source.projectId} where ${source.id} = ${fromWorkspaceId} and ${target.id} = ${toWorkspaceId})`
    const rows = await this.db
      .update(wf)
      .set({ workspaceId: toWorkspaceId, updatedAt: new Date().toISOString() })
      .where(and(inArray(wf.id, workflowIds), eq(wf.workspaceId, fromWorkspaceId), sameProject))
      .returning({ id: wf.id })
    return rows.map((row: { id: string }) => row.id)
  }
}
