import { and, eq, sql, aliasedTable } from 'drizzle-orm'
import type { AccessRequest, AccessRequestDecision, AccessRequestRow } from '../types.js'
import { atomically } from './atomic.js'
import { boundFields } from './insert-where.js'
import { aliasedFrom } from './json-array.js'
import { OverviewFields, type OverviewTables } from './overview-fields.js'
import type { Dialect } from './json-array.js'

export interface AccessRequestTables extends OverviewTables {
  accessRequests: unknown
}

/**
 * A Viewer's "Ask for edit access": one open request per person and
 * workspace, addressed to one of the workspace's admins, answered by anyone
 * who may manage its members.
 */
export class AccessRequestsAdapter {
  private fields: OverviewFields

  constructor(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    private db: any,
    private t: AccessRequestTables,
    dialect: Dialect,
  ) {
    this.fields = new OverviewFields(t, dialect)
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private get table(): any {
    return this.t.accessRequests
  }

  private async rowById(where: ReturnType<typeof and>): Promise<AccessRequestRow | null> {
    const r = aliasedTable(this.table, 'r')
    const from = aliasedTable(this.t.user, 'from_user')
    const to = aliasedTable(this.t.user, 'to_user')
    const rows = await this.db
      .select({
        id: r.id,
        workspaceId: r.workspaceId,
        from: { id: from.id, name: from.name },
        to: { id: to.id, name: to.name },
        status: r.status,
        alreadyEditing: r.alreadyEditing,
        createdAt: r.createdAt,
      })
      .from(r)
      .innerJoin(from, eq(from.id, r.userId))
      .innerJoin(to, eq(to.id, r.toUserId))
      .where(where)
      .orderBy(sql`${r.createdAt} desc`)
      .limit(1)
    return rows[0] ?? null
  }

  /** The person's open request for the workspace, or null. */
  async getOwnPending(workspaceId: string, userId: string): Promise<AccessRequestRow | null> {
    const r = aliasedTable(this.table, 'r')
    return this.rowById(
      and(eq(r.workspaceId, workspaceId), eq(r.userId, userId), eq(r.status, 'pending')),
    )
  }

  /**
   * Records the request — unless the person already has one open here, in
   * which case that one is answered (`created: false`): the guard is in the
   * insert, and the index behind it makes two asks at once one request.
   * Addressed to the workspace's first admin by name (org owners and
   * admins, project admins, workspace admins) other than the asker, chosen
   * in the insert. Null when there is no one to ask and nothing open.
   */
  async create(data: {
    id: string
    workspaceId: string
    userId: string
    now: string
  }): Promise<{ request: AccessRequestRow; created: boolean } | null> {
    const w = aliasedTable(this.t.workspaces, 'w')
    const p = aliasedTable(this.t.projects, 'p')
    const m = aliasedTable(this.t.member, 'adm')
    const u = aliasedTable(this.t.user, 'adu')
    const open = aliasedTable(this.table, 'open')
    const roles = this.fields.roles
    const isAdmin = sql`${roles.workspaceRole(m.role, roles.projectGrantOf(u.id, p.id), roles.workspaceGrantOf(u.id, w.id))} = 'admin'`
    const addressee = sql`(select ${u.id} from ${aliasedFrom(m)} inner join ${aliasedFrom(u)} on ${u.id} = ${m.userId} where ${m.organizationId} = ${p.organizationId} and ${u.id} <> ${data.userId} and ${isAdmin} order by ${u.name}, ${u.id} limit 1)`
    const noneOpen = sql`not exists (select 1 from ${aliasedFrom(open)} where ${open.workspaceId} = ${data.workspaceId} and ${open.userId} = ${data.userId} and ${open.status} = 'pending')`
    const row = {
      id: data.id,
      workspaceId: data.workspaceId,
      userId: data.userId,
      toUserId: '',
      status: 'pending',
      alreadyEditing: false,
      createdAt: data.now,
      decidedAt: null,
      decidedBy: null,
    }
    const inserted = await this.db
      .insert(this.table)
      .select(
        this.db
          .select({ ...boundFields(this.table, row), workspaceId: w.id, toUserId: addressee })
          .from(w)
          .innerJoin(p, eq(p.id, w.projectId))
          .where(and(eq(w.id, data.workspaceId), sql`${addressee} is not null`, noneOpen)),
      )
      .returning({ id: this.table.id })
    const request = await this.getOwnPending(data.workspaceId, data.userId)
    return request ? { request, created: inserted.length > 0 } : null
  }

  /**
   * A request as someone deciding it reads it: where it is, the asker's
   * rows now, and the decider's own rows there — one read answers who may
   * decide and what approving would do.
   */
  async getForDecision(id: string, deciderId: string): Promise<AccessRequestDecision | null> {
    const r = aliasedTable(this.table, 'r')
    const w = aliasedTable(this.t.workspaces, 'w')
    const p = aliasedTable(this.t.projects, 'p')
    const u = aliasedTable(this.t.user, 'asker')
    const roles = this.fields.roles
    const rows = await this.db
      .select({
        request: r,
        workspace: { id: w.id, name: w.name, projectId: p.id, organizationId: p.organizationId },
        asker: {
          name: u.name,
          orgRole: roles.orgRoleOf(r.userId, p.organizationId),
          projectGrant: roles.projectGrantOf(r.userId, p.id),
          workspaceGrant: roles.workspaceGrantOf(r.userId, w.id),
        },
        decider: {
          orgRole: roles.orgRoleOf(deciderId, p.organizationId),
          projectGrant: roles.projectGrantOf(deciderId, p.id),
          workspaceGrant: roles.workspaceGrantOf(deciderId, w.id),
        },
      })
      .from(r)
      .innerJoin(w, eq(w.id, r.workspaceId))
      .innerJoin(p, eq(p.id, w.projectId))
      .innerJoin(u, eq(u.id, r.userId))
      .where(eq(r.id, id))
      .limit(1)
    const row = rows[0]
    if (!row) return null
    return {
      request: row.request as AccessRequest,
      workspace: row.workspace,
      asker: row.asker,
      decider: row.decider,
    }
  }

  /**
   * Answers a pending request; with `grant`, the asker becomes an Editor of
   * the workspace in the same unit — if this decision approved it and they
   * are still a Viewer there: someone raised or removed meanwhile is left
   * as they are, so an approval never lowers an Admin or re-adds someone.
   */
  async decide(data: {
    id: string
    status: 'approved' | 'declined'
    decidedBy: string
    now: string
    alreadyEditing: boolean
    grant: { workspaceId: string; userId: string } | null
  }): Promise<void> {
    const wm = this.t.workspaceMembers
    const r = aliasedTable(this.table, 'dr')
    const w = aliasedTable(this.t.workspaces, 'dw')
    const p = aliasedTable(this.t.projects, 'dp')
    const roles = this.fields.roles
    const grant = data.grant
    const stillViewer = grant
      ? sql`${roles.workspaceRoleOf(grant.userId, { organizationId: p.organizationId, projectId: p.id, workspaceId: w.id })} = 'viewer'`
      : sql``
    await atomically(this.db, (tx) => [
      tx
        .update(this.table)
        .set({
          status: data.status,
          alreadyEditing: data.alreadyEditing,
          decidedAt: data.now,
          decidedBy: data.decidedBy,
        })
        .where(and(eq(this.table.id, data.id), eq(this.table.status, 'pending'))),
      ...(grant
        ? [
            tx
              .insert(wm)
              .select(
                tx
                  .select({
                    ...boundFields(wm, {
                      workspaceId: grant.workspaceId,
                      userId: grant.userId,
                      role: 'editor',
                      createdBy: data.decidedBy,
                      createdAt: data.now,
                    }),
                    workspaceId: r.workspaceId,
                  })
                  .from(r)
                  .innerJoin(w, eq(w.id, r.workspaceId))
                  .innerJoin(p, eq(p.id, w.projectId))
                  .where(
                    and(
                      eq(r.id, data.id),
                      eq(r.status, 'approved'),
                      eq(r.decidedBy, data.decidedBy),
                      eq(r.userId, grant.userId),
                      eq(r.workspaceId, grant.workspaceId),
                      stillViewer,
                    ),
                  ),
              )
              .onConflictDoUpdate({
                target: [wm.workspaceId, wm.userId],
                set: { role: 'editor' },
                setWhere: eq(wm.role, 'viewer'),
              }),
          ]
        : []),
    ])
  }
}
