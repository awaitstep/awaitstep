import { aliasedTable, and, asc, desc, eq, gt, ne, sql, type SQL } from 'drizzle-orm'
import type { AccountExportRow, AccountRow, AccountSessionRow } from '../types.js'
import {
  aliasedFrom,
  fieldOf,
  isoText,
  jsonArrayOf,
  jsonBool,
  nestedJson,
  readJsonArray,
  type Dialect,
} from './json-array.js'
import type { RoleFields, AccessTables } from './role-fields.js'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyTable = any

export interface AccountTables extends AccessTables {
  account: AnyTable
}

/** The providers a person links; better-auth's `credential` and others never list. */
const PROVIDERS = sql.raw(`('github', 'google')`)

/**
 * "Your account" (B10): the person's own rows across every organization —
 * the Profile and Sessions pages, the delete guard and the export. Each
 * read is one statement with its lists built in SQL.
 */
export class AccountAdapter {
  constructor(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    private db: any,
    private t: AccountTables,
    private dialect: Dialect,
    private roles: RoleFields,
  ) {}

  /** Someone other than `userId` owns the organization `organizationId` names. */
  private anotherOwner(userId: SQL | string, organizationId: SQL | unknown): SQL {
    const other = aliasedTable(this.t.member, 'acc_other_owner')
    return sql`exists (select 1 from ${aliasedFrom(other)} where ${other.organizationId} = ${organizationId} and ${other.role} = 'owner' and ${other.userId} <> ${userId})`
  }

  private providerList(userId: SQL | unknown): SQL {
    const a = aliasedTable(this.t.account, 'acc_a')
    const list = jsonArrayOf(
      this.dialect,
      { id: a.id, providerId: a.providerId, connectedAt: isoText(this.dialect, a.createdAt) },
      sql`${a.providerId}`,
    )
    return sql`(select ${list} from ${aliasedFrom(a)} where ${a.userId} = ${userId} and ${a.providerId} in ${PROVIDERS})`
  }

  /** The Profile page's read, or null for no such person. */
  async getAccount(userId: string): Promise<AccountRow | null> {
    const u = aliasedTable(this.t.user, 'acc_u')
    const m = aliasedTable(this.t.member, 'acc_m')
    const o = aliasedTable(this.t.organization, 'acc_o')
    const orgs = jsonArrayOf(
      this.dialect,
      {
        id: o.id,
        slug: o.slug,
        name: o.name,
        logo: o.logo,
        role: m.role,
        projectCount: this.roles.visibleProjectCount(userId, o.id),
        onlyOwner: jsonBool(
          this.dialect,
          sql`${m.role} = 'owner' and not ${this.anotherOwner(userId, o.id)}`,
        ),
      },
      sql`${o.name}, ${o.id}`,
    )
    const rows = await this.db
      .select({
        id: u.id,
        name: u.name,
        email: u.email,
        image: u.image,
        emailVerified: u.emailVerified,
        orgs: fieldOf(
          sql`(select ${orgs} from ${aliasedFrom(m)} inner join ${aliasedFrom(o)} on ${o.id} = ${m.organizationId} where ${m.userId} = ${u.id})`,
        ),
        providers: fieldOf(this.providerList(u.id)),
      })
      .from(u)
      .where(eq(u.id, userId))
      .limit(1)
    const row = rows[0]
    if (!row) return null
    return {
      person: {
        id: row.id,
        name: row.name,
        email: row.email,
        image: row.image ?? null,
        emailVerified: Boolean(row.emailVerified),
      },
      orgs: readJsonArray(row.orgs),
      providers: readJsonArray(row.providers),
    }
  }

  /** The organizations `userId` is the only owner of, by name: what blocks deleting the account. */
  async soleOwnedOrgNames(userId: string): Promise<string[]> {
    const m = aliasedTable(this.t.member, 'acc_m')
    const o = aliasedTable(this.t.organization, 'acc_o')
    const rows: { name: string }[] = await this.db
      .select({ name: o.name })
      .from(m)
      .innerJoin(o, eq(o.id, m.organizationId))
      .where(
        and(eq(m.userId, userId), eq(m.role, 'owner'), sql`not ${this.anotherOwner(userId, o.id)}`),
      )
      .orderBy(asc(o.name), asc(o.id))
    return rows.map((r) => r.name)
  }

  /** The person's unexpired sessions, the current one first, then the most recently active. */
  async listSessions(userId: string, currentId: string, now: Date): Promise<AccountSessionRow[]> {
    const s = this.t.session
    const rows = await this.db
      .select({
        id: s.id,
        userAgent: s.userAgent,
        ipAddress: s.ipAddress,
        createdAt: s.createdAt,
        updatedAt: s.updatedAt,
        current: sql<number>`case when ${s.id} = ${currentId} then 1 else 0 end`,
      })
      .from(s)
      .where(and(eq(s.userId, userId), gt(s.expiresAt, now.toISOString())))
      .orderBy(sql`case when ${s.id} = ${currentId} then 0 else 1 end`, desc(s.updatedAt))
    return rows.map((r: Omit<AccountSessionRow, 'current'> & { current: number }) => ({
      ...r,
      current: Boolean(r.current),
    }))
  }

  /** Signs out one of the person's other sessions; false when there is none by that id. */
  async revokeSession(userId: string, sessionId: string, currentId: string): Promise<boolean> {
    const s = this.t.session
    const gone: { id: string }[] = await this.db
      .delete(s)
      .where(and(eq(s.id, sessionId), eq(s.userId, userId), ne(s.id, currentId)))
      .returning({ id: s.id })
    return gone.length > 0
  }

  /** Signs out every session of the person but the current one; how many went. */
  async revokeOtherSessions(userId: string, currentId: string): Promise<number> {
    const s = this.t.session
    const gone: { id: string }[] = await this.db
      .delete(s)
      .where(and(eq(s.userId, userId), ne(s.id, currentId)))
      .returning({ id: s.id })
    return gone.length
  }

  /** Download JSON's rows, the unexpired sessions with them, in one statement. */
  async exportAccount(
    userId: string,
    currentId: string,
    now: Date,
  ): Promise<AccountExportRow | null> {
    const u = aliasedTable(this.t.user, 'exp_u')
    const s = aliasedTable(this.t.session, 'exp_s')
    const sessions = jsonArrayOf(
      this.dialect,
      {
        id: s.id,
        userAgent: s.userAgent,
        ipAddress: s.ipAddress,
        createdAt: isoText(this.dialect, s.createdAt),
        updatedAt: isoText(this.dialect, s.updatedAt),
        current: jsonBool(this.dialect, sql`${s.id} = ${currentId}`),
      },
      sql`case when ${s.id} = ${currentId} then 0 else 1 end, ${s.updatedAt} desc`,
    )
    const m = aliasedTable(this.t.member, 'exp_m')
    const o = aliasedTable(this.t.organization, 'exp_o')
    const pm = aliasedTable(this.t.projectMembers, 'exp_pm')
    const p = aliasedTable(this.t.projects, 'exp_p')
    const wm = aliasedTable(this.t.workspaceMembers, 'exp_wm')
    const w = aliasedTable(this.t.workspaces, 'exp_w')
    const wp = aliasedTable(this.t.projects, 'exp_wp')
    const projects = jsonArrayOf(this.dialect, { name: p.name, role: pm.role }, sql`${p.name}`)
    const workspaces = jsonArrayOf(
      this.dialect,
      { project: wp.name, name: w.name, role: wm.role },
      sql`${wp.name}, ${w.name}`,
    )
    const memberships = jsonArrayOf(
      this.dialect,
      {
        organization: o.name,
        role: m.role,
        projects: nestedJson(
          this.dialect,
          sql`(select ${projects} from ${aliasedFrom(pm)} inner join ${aliasedFrom(p)} on ${p.id} = ${pm.projectId} where ${pm.userId} = ${u.id} and ${p.organizationId} = ${o.id})`,
        ),
        workspaces: nestedJson(
          this.dialect,
          sql`(select ${workspaces} from ${aliasedFrom(wm)} inner join ${aliasedFrom(w)} on ${w.id} = ${wm.workspaceId} inner join ${aliasedFrom(wp)} on ${wp.id} = ${w.projectId} where ${wm.userId} = ${u.id} and ${wp.organizationId} = ${o.id})`,
        ),
      },
      sql`${o.name}`,
    )
    const rows = await this.db
      .select({
        name: u.name,
        email: u.email,
        photo: fieldOf(
          sql<number>`case when ${u.image} is null or ${u.image} = '' then 0 else 1 end`,
        ),
        providers: fieldOf(this.providerList(u.id)),
        sessions: fieldOf(
          sql`(select ${sessions} from ${aliasedFrom(s)} where ${s.userId} = ${u.id} and ${s.expiresAt} > ${now.toISOString()})`,
        ),
        memberships: fieldOf(
          sql`(select ${memberships} from ${aliasedFrom(m)} inner join ${aliasedFrom(o)} on ${o.id} = ${m.organizationId} where ${m.userId} = ${u.id})`,
        ),
      })
      .from(u)
      .where(eq(u.id, userId))
      .limit(1)
    const row = rows[0]
    if (!row) return null
    return {
      name: row.name,
      email: row.email,
      photo: Boolean(row.photo),
      providers: readJsonArray(row.providers),
      sessions: readJsonArray(row.sessions),
      memberships: readJsonArray(row.memberships),
    }
  }
}
