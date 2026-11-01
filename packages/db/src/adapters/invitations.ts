import { and, asc, eq, gt, inArray, isNull, lte, sql, aliasedTable, type SQL } from 'drizzle-orm'
import type {
  AcceptInvitationData,
  CreateInvitationData,
  Invitation,
  InvitationChecks,
  InvitationPlaceRow,
  InvitationRow,
  InvitationView,
  PendingInvitationRow,
} from '../types.js'
import { chunked } from './statement-params.js'
import { atomically } from './atomic.js'
import { boundFields } from './insert-where.js'
import {
  aliasedFrom,
  idList,
  jsonArrayOf,
  jsonArrayOfValues,
  readJsonArray,
  type Dialect,
} from './json-array.js'
import { OverviewFields, type OverviewTables } from './overview-fields.js'

/** The tables an invitation is written to and read with. */
export interface InvitationTables extends OverviewTables {
  invitation: unknown
  invitationPlaces: unknown
}

/**
 * Invitations into an organization, with the places each one leads to.
 * better-auth's `invitation` table is the storage, so its organization
 * listing and sessions see the same rows; the lifecycle (expiry, resend,
 * decline and undo, accept) is this API's, and its own endpoints are closed.
 */
export class InvitationsAdapter {
  private fields: OverviewFields

  constructor(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    private db: any,
    private t: InvitationTables,
    private dialect: Dialect,
  ) {
    this.fields = new OverviewFields(t, dialect)
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private get inv(): any {
    return this.t.invitation
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private get placesTable(): any {
    return this.t.invitationPlaces
  }

  /**
   * The places of invitation `invitationId`, named; with a viewer, cut to
   * what they can open — the project for a project-wide place, the
   * workspace itself for a workspace place, so a hidden one is never named.
   */
  private places(invitationId: SQL | unknown, viewerId?: string): SQL {
    const ip = aliasedTable(this.placesTable, 'ip')
    const p = aliasedTable(this.t.projects, 'ipp')
    const w = aliasedTable(this.t.workspaces, 'ipw')
    const roles = this.fields.roles
    const list = jsonArrayOf(
      this.dialect,
      {
        projectId: ip.projectId,
        projectName: p.name,
        projectSlug: p.slug,
        workspaceId: ip.workspaceId,
        workspaceName: w.name,
        workspaceSlug: w.slug,
        role: ip.role,
      },
      sql`${p.name}, ${w.name}`,
    )
    const place = { organizationId: p.organizationId, projectId: p.id }
    const visible = viewerId
      ? sql` and (case when ${ip.workspaceId} is null then ${roles.projectVisible(viewerId, place)} else ${roles.workspaceRoleOf(viewerId, { ...place, workspaceId: w.id })} is not null end)`
      : sql``
    return sql`(select ${list} from ${aliasedFrom(ip)} inner join ${aliasedFrom(p)} on ${p.id} = ${ip.projectId} left join ${aliasedFrom(w)} on ${w.id} = ${ip.workspaceId} where ${ip.invitationId} = ${invitationId}${visible})`
  }

  /**
   * One read before inviting: how many of the places' projects and
   * workspaces are the organization's, and which of the addresses are
   * already in it or already invited — in one statement.
   */
  async checks(
    organizationId: string,
    refs: {
      projectIds: string[]
      workspaceIds: string[]
      emails: string[]
      now: string
      /** Counts only the workspaces of this project: an invite sent from a project or workspace. */
      inProject?: string
    },
  ): Promise<InvitationChecks> {
    const o = this.t.organization
    const p = aliasedTable(this.t.projects, 'cp')
    const op = aliasedTable(this.t.projects, 'cop')
    const w = aliasedTable(this.t.workspaces, 'cw')
    const m = aliasedTable(this.t.member, 'cm')
    const u = aliasedTable(this.t.user, 'cu')
    const i = aliasedTable(this.inv, 'ci')
    const lowered = refs.emails.map((e) => e.toLowerCase())
    const ids = (list: string[]) => idList(this.dialect, list)
    const none = sql<number>`0`
    const empty = sql`'[]'`
    const projects = refs.projectIds.length
      ? sql<number>`(select count(*) from ${aliasedFrom(p)} where ${p.organizationId} = ${organizationId} and ${p.id} in ${ids(refs.projectIds)})`
      : none
    const workspaces = refs.workspaceIds.length
      ? sql<number>`(select count(*) from ${aliasedFrom(w)} where ${w.id} in ${ids(refs.workspaceIds)} and ${w.projectId} in (select ${op.id} from ${aliasedFrom(op)} where ${op.organizationId} = ${organizationId})${refs.inProject === undefined ? sql`` : sql` and ${w.projectId} = ${refs.inProject}`})`
      : none
    // The address lists are built queries, not templates: a column placed
    // directly in a selected template of this single-table statement renders
    // bare, and `id` is both tables' in the member–user join.
    const memberEmails = this.db
      .select({ email: sql<string>`lower(${u.email})`.as('email') })
      .from(m)
      .innerJoin(u, eq(u.id, m.userId))
      .where(and(eq(m.organizationId, organizationId), sql`lower(${u.email}) in ${ids(lowered)}`))
    const pendingEmails = this.db
      .select({ email: sql<string>`lower(${i.email})`.as('email') })
      .from(i)
      .where(
        and(
          eq(i.organizationId, organizationId),
          eq(i.status, 'pending'),
          gt(i.expiresAt, refs.now),
          sql`lower(${i.email}) in ${ids(lowered)}`,
        ),
      )
    const members = lowered.length
      ? sql`(select ${jsonArrayOfValues(this.dialect, sql.raw('ce.email'))} from (${memberEmails}) as ce)`
      : empty
    const pending = lowered.length
      ? sql`(select ${jsonArrayOfValues(this.dialect, sql.raw('ci.email'))} from (${pendingEmails}) as ci)`
      : empty
    const rows = await this.db
      .select({
        projects: projects.mapWith(Number),
        workspaces: workspaces.mapWith(Number),
        members,
        pending,
      })
      .from(o)
      .where(eq(o.id, organizationId))
      .limit(1)
    const row = rows[0]
    if (!row) return { projects: 0, workspaces: 0, members: [], pending: [] }
    return {
      projects: row.projects,
      workspaces: row.workspaces,
      members: readJsonArray<string>(row.members),
      pending: readJsonArray<string>(row.pending),
    }
  }

  /**
   * Writes the invitations with their places as one unit, a few rows per
   * insert: D1 binds at most 100 parameters per statement.
   */
  async create(invitations: CreateInvitationData[]): Promise<void> {
    if (invitations.length === 0) return
    const now = new Date().toISOString()
    const rows = invitations.map((data) => ({
      id: data.id,
      email: data.email,
      inviterId: data.inviterId,
      organizationId: data.organizationId,
      role: data.role,
      status: 'pending',
      expiresAt: data.expiresAt,
      createdAt: now,
      askedForNewAt: null,
    }))
    const places = invitations.flatMap((data) =>
      data.places.map((place) => ({ ...place, invitationId: data.id })),
    )
    await atomically(this.db, (tx) => [
      ...chunked(rows, 10).map((some) => tx.insert(this.inv).values(some)),
      ...chunked(places, 15).map((some) => tx.insert(this.placesTable).values(some)),
    ])
  }

  /** Open, unexpired invitations of the organization, newest first, with their places as the viewer may see them. */
  async listByOrganization(
    organizationId: string,
    viewerId: string,
    now: string,
  ): Promise<InvitationRow[]> {
    const i = aliasedTable(this.inv, 'i')
    const u = aliasedTable(this.t.user, 'u')
    const rows = await this.db
      .select({
        id: i.id,
        email: i.email,
        role: i.role,
        status: i.status,
        expiresAt: i.expiresAt,
        createdAt: i.createdAt,
        askedForNewAt: i.askedForNewAt,
        inviterId: u.id,
        inviterName: u.name,
        places: this.places(i.id, viewerId),
      })
      .from(i)
      .innerJoin(u, eq(u.id, i.inviterId))
      .where(
        and(eq(i.organizationId, organizationId), eq(i.status, 'pending'), gt(i.expiresAt, now)),
      )
      .orderBy(sql`${i.createdAt} desc`, asc(i.id))
    return rows.map(
      (row: {
        id: string
        email: string
        role: string | null
        status: string
        expiresAt: string
        createdAt: string
        askedForNewAt: string | null
        inviterId: string
        inviterName: string
        places: unknown
      }) => ({
        id: row.id,
        email: row.email,
        role: row.role ?? 'member',
        status: row.status,
        expiresAt: row.expiresAt,
        createdAt: row.createdAt,
        askedForNewAt: row.askedForNewAt,
        inviter: { id: row.inviterId, name: row.inviterName },
        places: readJsonArray<InvitationPlaceRow>(row.places),
      }),
    )
  }

  /** The invitation with its organization, inviter and every place; null when unknown. */
  async getView(id: string): Promise<InvitationView | null> {
    const i = aliasedTable(this.inv, 'i')
    const o = aliasedTable(this.t.organization, 'o')
    const u = aliasedTable(this.t.user, 'u')
    const rows = await this.db
      .select({
        invitation: i,
        org: { id: o.id, slug: o.slug, name: o.name, logo: o.logo },
        inviter: { id: u.id, name: u.name, email: u.email, image: u.image },
        places: this.places(i.id),
      })
      .from(i)
      .innerJoin(o, eq(o.id, i.organizationId))
      .innerJoin(u, eq(u.id, i.inviterId))
      .where(eq(i.id, id))
      .limit(1)
    const row = rows[0]
    if (!row) return null
    return {
      invitation: row.invitation as Invitation,
      org: row.org,
      inviter: row.inviter,
      places: readJsonArray<InvitationPlaceRow>(row.places),
    }
  }

  /**
   * Accepts: the member row if they have none, their places as grants (a
   * place replaces a row they already hold), and the status — one unit,
   * every statement of it conditional on the invitation being open and
   * unexpired now, so a cancelled or stale one writes nothing. A place is
   * applied only while its project is still the invitation's
   * organization's (a moved project's places are dropped with the move,
   * and this guards the gap), and a workspace place only when it counts
   * above what the project gives (`grantCounts`). The caller checked the
   * invitation is theirs; a member row written meanwhile surfaces as
   * `isUniqueViolation`, and accepting again then applies the rest.
   */
  async accept(data: AcceptInvitationData): Promise<void> {
    const m = this.t.member
    const pm = this.t.projectMembers
    const wm = this.t.workspaceMembers
    const i = aliasedTable(this.inv, 'ai')
    const ip = aliasedTable(this.placesTable, 'aip')
    const p = aliasedTable(this.t.projects, 'app')
    const w = aliasedTable(this.t.workspaces, 'apw')
    const existing = aliasedTable(this.t.member, 'am')
    const roles = this.fields.roles
    const open = sql`${i.status} = 'pending' and ${i.expiresAt} > ${data.now}`
    const memberFields = boundFields(m, {
      id: data.memberId,
      userId: data.userId,
      organizationId: '',
      role: '',
      createdAt: data.now,
    })
    const inherited = roles.inheritedWorkspaceRole(
      roles.orgRoleOf(data.userId, i.organizationId),
      roles.projectGrantOf(data.userId, p.id),
    )
    await atomically(this.db, (tx) => [
      tx.insert(m).select(
        tx
          .select({
            ...memberFields,
            organizationId: i.organizationId,
            role: sql`coalesce(${i.role}, 'member')`,
          })
          .from(i)
          .where(
            and(
              eq(i.id, data.invitationId),
              open,
              sql`not exists (select 1 from ${aliasedFrom(existing)} where ${existing.organizationId} = ${i.organizationId} and ${existing.userId} = ${data.userId})`,
            ),
          ),
      ),
      tx
        .insert(pm)
        .select(
          tx
            .select({
              ...boundFields(pm, {
                projectId: '',
                userId: data.userId,
                role: '',
                createdBy: '',
                createdAt: data.now,
              }),
              projectId: ip.projectId,
              role: ip.role,
              createdBy: i.inviterId,
            })
            .from(ip)
            .innerJoin(i, eq(i.id, ip.invitationId))
            .innerJoin(p, and(eq(p.id, ip.projectId), eq(p.organizationId, i.organizationId)))
            .where(and(eq(ip.invitationId, data.invitationId), isNull(ip.workspaceId), open)),
        )
        .onConflictDoUpdate({
          target: [pm.projectId, pm.userId],
          set: { role: sql`excluded.role` },
        }),
      tx
        .insert(wm)
        .select(
          tx
            .select({
              ...boundFields(wm, {
                workspaceId: '',
                userId: data.userId,
                role: '',
                createdBy: '',
                createdAt: data.now,
              }),
              workspaceId: ip.workspaceId,
              role: ip.role,
              createdBy: i.inviterId,
            })
            .from(ip)
            .innerJoin(i, eq(i.id, ip.invitationId))
            .innerJoin(w, eq(w.id, ip.workspaceId))
            .innerJoin(p, and(eq(p.id, w.projectId), eq(p.organizationId, i.organizationId)))
            .where(
              and(
                eq(ip.invitationId, data.invitationId),
                open,
                sql`${roles.rank(ip.role)} > ${roles.rank(inherited)}`,
              ),
            ),
        )
        .onConflictDoUpdate({
          target: [wm.workspaceId, wm.userId],
          set: { role: sql`excluded.role` },
        }),
      tx
        .update(this.inv)
        .set({ status: 'accepted' })
        .where(
          and(
            eq(this.inv.id, data.invitationId),
            eq(this.inv.status, 'pending'),
            gt(this.inv.expiresAt, data.now),
          ),
        ),
    ])
  }

  /**
   * Cancels an open or declined invitation of the organization: the row
   * stays as `canceled`, the link stops working. Answers its address; null
   * when there is no such invitation in the organization or it is not in
   * either state.
   */
  async cancel(id: string, organizationId: string): Promise<string | null> {
    const rows = await this.db
      .update(this.inv)
      .set({ status: 'canceled' })
      .where(
        and(
          eq(this.inv.id, id),
          eq(this.inv.organizationId, organizationId),
          inArray(this.inv.status, ['pending', 'rejected']),
        ),
      )
      .returning({ email: this.inv.email })
    return rows[0]?.email ?? null
  }

  /** Moves an invitation from one status to another; false when it was not in `from`. */
  async setStatus(id: string, from: string, to: string): Promise<boolean> {
    const rows = await this.db
      .update(this.inv)
      .set({ status: to })
      .where(and(eq(this.inv.id, id), eq(this.inv.status, from)))
      .returning({ id: this.inv.id })
    return rows.length > 0
  }

  /**
   * A fresh week for an open invitation; clears "asked for a new one".
   * False when not pending, or when it was sent more recently than the
   * caller allows: `unlessExpiresAfter` is the expiry a send at the floor
   * would have, so a row expiring later than that was sent after it.
   */
  async resend(id: string, expiresAt: string, unlessExpiresAfter: string): Promise<boolean> {
    const rows = await this.db
      .update(this.inv)
      .set({ expiresAt, askedForNewAt: null })
      .where(
        and(
          eq(this.inv.id, id),
          eq(this.inv.status, 'pending'),
          lte(this.inv.expiresAt, unlessExpiresAfter),
        ),
      )
      .returning({ id: this.inv.id })
    return rows.length > 0
  }

  /** Records that the person asked for a new invite, once. False when they already had. */
  async askAgain(id: string, at: string): Promise<boolean> {
    const rows = await this.db
      .update(this.inv)
      .set({ askedForNewAt: at })
      .where(and(eq(this.inv.id, id), isNull(this.inv.askedForNewAt)))
      .returning({ id: this.inv.id })
    return rows.length > 0
  }

  /** Open, unexpired invitations to an address, with the organization, inviter and places named. */
  async listForEmail(email: string, now: string): Promise<PendingInvitationRow[]> {
    const i = aliasedTable(this.inv, 'i')
    const o = aliasedTable(this.t.organization, 'o')
    const u = aliasedTable(this.t.user, 'u')
    const rows = await this.db
      .select({
        id: i.id,
        org: { slug: o.slug, name: o.name, logo: o.logo },
        inviterName: u.name,
        role: i.role,
        expiresAt: i.expiresAt,
        places: this.places(i.id),
      })
      .from(i)
      .innerJoin(o, eq(o.id, i.organizationId))
      .innerJoin(u, eq(u.id, i.inviterId))
      .where(
        and(
          eq(sql`lower(${i.email})`, email.toLowerCase()),
          eq(i.status, 'pending'),
          gt(i.expiresAt, now),
        ),
      )
      .orderBy(sql`${i.createdAt} desc`, asc(i.id))
    return rows.map(
      (row: Omit<PendingInvitationRow, 'places'> & { role: string | null; places: unknown }) => ({
        ...row,
        role: row.role ?? 'member',
        places: readJsonArray<InvitationPlaceRow>(row.places),
      }),
    )
  }
}
