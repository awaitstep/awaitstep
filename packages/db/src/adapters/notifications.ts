import {
  aliasedTable,
  and,
  desc,
  eq,
  inArray,
  isNull,
  lt,
  ne,
  or,
  sql,
  type SQL,
} from 'drizzle-orm'
import type {
  ExpiringKeysCheck,
  NotificationInsert,
  NotificationList,
  NotificationListRow,
  NotificationRecipients,
  NotifiedRecipient,
  ReleaseVisitRow,
} from '../types.js'
import { boundFields } from './insert-where.js'
import { aliasedFrom, fieldOf, idList, type Dialect } from './json-array.js'
import type { OverviewTables } from './overview-fields.js'
import { RoleFields } from './role-fields.js'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyTable = any

export interface NotificationTables extends OverviewTables {
  notifications: AnyTable
  releaseVisits: AnyTable
  accessRequests: AnyTable
  apiKeys: AnyTable
  invitation: AnyTable
  connections: AnyTable
}

const PURGE_BATCH = 1000
/** `noticeGroup.invitation('invitation.ask_again', id)` in the API: the id follows it. */
const ASK_AGAIN_PREFIX = 'invitation.ask_again:'

type ListedRow = Omit<NotificationListRow, 'meta' | 'read' | 'needsAction' | 'request'> & {
  meta: string
  read: unknown
  needsAction: unknown
  requestId: string | null
  requestStatus: 'pending' | 'approved' | 'declined' | null
  requestAsker: string | null
  requestAlreadyEditing: unknown
  all: number
  unread: number
  action: number
}

/** A driver's boolean: pg's own, sqlite's 0/1, or a counted string. */
function truthy(value: unknown): boolean {
  return value === true || value === 1 || value === '1' || value === 't'
}

function parseIds(value: string): string[] {
  try {
    const parsed: unknown = JSON.parse(value)
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : []
  } catch {
    return []
  }
}

function parseMeta(meta: string): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(meta)
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {}
  } catch {
    return {}
  }
}

/**
 * The Inbox (B8): one row per recipient, written when something happens —
 * the recipients chosen inside the insert — and read back with the places
 * and requests as they are now; plus each person's last What's new visit.
 */
export class NotificationsAdapter {
  private roles: RoleFields

  constructor(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    private db: any,
    private t: NotificationTables,
    private dialect: Dialect,
  ) {
    this.roles = new RoleFields(t)
  }

  /** Candidate recipients as a list of user ids, before the organization filter. */
  private candidates(recipients: NotificationRecipients): SQL {
    if ('users' in recipients) return idList(this.dialect, recipients.users)
    if ('workflowWatchers' in recipients) {
      const wf = aliasedTable(this.t.workflows, 'ncw')
      const wm = aliasedTable(this.t.workspaceMembers, 'ncm')
      const id = recipients.workflowWatchers.workflowId
      return sql`(select ${wf.createdBy} from ${aliasedFrom(wf)} where ${wf.id} = ${id} union select ${wm.userId} from ${aliasedFrom(wm)} inner join ${aliasedFrom(wf)} on ${wf.workspaceId} = ${wm.workspaceId} where ${wf.id} = ${id} and ${wm.role} = 'admin')`
    }
    if ('connectionKeepers' in recipients) {
      const c = aliasedTable(this.t.connections, 'nck')
      const om = aliasedTable(this.t.member, 'nco')
      const id = recipients.connectionKeepers.connectionId
      return sql`(select ${c.createdBy} from ${aliasedFrom(c)} where ${c.id} = ${id} union select ${om.userId} from ${aliasedFrom(om)} inner join ${aliasedFrom(c)} on ${c.organizationId} = ${om.organizationId} where ${c.id} = ${id} and ${om.role} in ('owner', 'admin'))`
    }
    const { projectId, workspaceId } = recipients.otherWorkspaceAdmins
    const wm = aliasedTable(this.t.workspaceMembers, 'ncm')
    const w = aliasedTable(this.t.workspaces, 'ncs')
    return sql`(select ${wm.userId} from ${aliasedFrom(wm)} inner join ${aliasedFrom(w)} on ${w.id} = ${wm.workspaceId} where ${w.projectId} = ${projectId} and ${w.id} <> ${workspaceId} and ${wm.role} = 'admin')`
  }

  /**
   * Whether `who` can see a place now: its workspace, else its project, else
   * the organization (every member). Ids are columns of the row being read.
   */
  private placeVisible(
    who: SQL | unknown,
    organizationId: SQL | unknown,
    projectId: SQL | unknown,
    workspaceId: SQL | unknown,
  ): SQL {
    const workspace = this.roles.workspaceRoleOf(who, { organizationId, projectId, workspaceId })
    const project = this.roles.projectVisible(who, { organizationId, projectId })
    return sql`(case when ${workspaceId} is not null then ${workspace} is not null when ${projectId} is not null then ${project} else true end)`
  }

  /** As `placeVisible`, for a place known up front: the check is chosen here, not in SQL. */
  private boundPlaceVisible(
    who: SQL | unknown,
    organizationId: string,
    projectId: string | null,
    workspaceId: string | null,
  ): SQL | undefined {
    if (workspaceId && projectId) {
      return sql`${this.roles.workspaceRoleOf(who, { organizationId, projectId, workspaceId })} is not null`
    }
    if (projectId) return this.roles.projectVisible(who, { organizationId, projectId })
    return undefined
  }

  /**
   * Writes one row per recipient in one `INSERT … SELECT`: candidates who are
   * in the organization, can see the place and didn't act. A repeat (same
   * person, same group key) is left alone (`keep`) or counted again and
   * marked unread (`fold`). Answers each person the statement wrote or
   * folded, with their address and name for the email.
   */
  async notify(entry: NotificationInsert): Promise<NotifiedRecipient[]> {
    const n = this.t.notifications
    const m = aliasedTable(this.t.member, 'nm')
    const u = aliasedTable(this.t.user, 'nu')
    const o = aliasedTable(this.t.organization, 'nuo')
    const row = {
      id: '',
      organizationId: entry.organizationId,
      userId: '',
      kind: entry.kind,
      event: entry.event,
      groupKey: entry.groupKey,
      projectId: entry.projectId,
      workspaceId: entry.workspaceId,
      accessRequestId: entry.accessRequestId ?? null,
      meta: JSON.stringify(entry.meta),
      count: 1,
      needsAction: entry.needsAction,
      readAt: null,
      createdAt: entry.now,
      updatedAt: entry.now,
    }
    const select = this.db
      .select({
        ...boundFields(n, row),
        id: sql<string>`${entry.idPrefix} || '_' || ${m.userId}`,
        userId: m.userId,
      })
      .from(m)
      .where(
        and(
          eq(m.organizationId, entry.organizationId),
          sql`${m.userId} in ${this.candidates(entry.recipients)}`,
          entry.excludeUserId ? ne(m.userId, entry.excludeUserId) : undefined,
          this.boundPlaceVisible(
            m.userId,
            entry.organizationId,
            entry.projectId,
            entry.workspaceId,
          ),
        ),
      )
    const insert = this.db.insert(n).select(select)
    const target = [n.userId, n.groupKey]
    const written =
      entry.onRepeat === 'fold'
        ? insert.onConflictDoUpdate({
            target,
            set: {
              count: sql`${n.count} + 1`,
              meta: sql`excluded.meta`,
              updatedAt: sql`excluded.updated_at`,
              readAt: sql`null`,
            },
          })
        : insert.onConflictDoNothing({ target })
    // The person's address and name ride the same statement: no read after.
    const rows = (await written.returning({
      userId: n.userId,
      count: n.count,
      email: fieldOf(
        sql<string>`(select ${u.email} from ${aliasedFrom(u)} where ${u.id} = ${n.userId})`,
      ),
      name: fieldOf(
        sql<string>`(select ${u.name} from ${aliasedFrom(u)} where ${u.id} = ${n.userId})`,
      ),
      orgSlug: fieldOf(
        sql<string>`(select ${o.slug} from ${aliasedFrom(o)} where ${o.id} = ${n.organizationId})`,
      ),
    })) as NotifiedRecipient[]
    return rows.map((r) => ({ ...r, count: Number(r.count) }))
  }

  /** Deletes the group's rows in the organization: an answered ask, an undone decline. */
  async clear(organizationId: string, groupKey: string): Promise<void> {
    const n = this.t.notifications
    await this.db
      .delete(n)
      .where(and(eq(n.organizationId, organizationId), eq(n.groupKey, groupKey)))
  }

  /**
   * Deletes the organization's rows whose group key starts with any of the
   * prefixes: every warning about one connection's token, whatever its
   * expiry or check time. Compared with `substr`, not `like`, so `_` and `%`
   * in an id are plain characters.
   */
  async clearByPrefix(organizationId: string, prefixes: string[]): Promise<void> {
    if (prefixes.length === 0) return
    const n = this.t.notifications
    await this.db
      .delete(n)
      .where(
        and(
          eq(n.organizationId, organizationId),
          or(
            ...prefixes.map(
              (prefix) => sql`substr(${n.groupKey}, 1, ${prefix.length}) = ${prefix}`,
            ),
          ),
        ),
      )
  }

  /**
   * Warns each live key's creator before it expires — once inside
   * `warnBefore`, once more inside `lastWarnBefore` — in one statement; how
   * many rows it wrote. The creator must still be in the key's organization
   * and see its place.
   */
  async notifyExpiringKeys(check: ExpiringKeysCheck): Promise<number> {
    const n = this.t.notifications
    const k = aliasedTable(this.t.apiKeys, 'nk')
    const p = aliasedTable(this.t.projects, 'nkp')
    const m = aliasedTable(this.t.member, 'nkm')
    const orgId = sql`coalesce(${k.organizationId}, ${p.organizationId})`
    const last = sql`${k.expiresAt} <= ${check.lastWarnBefore}`
    const threshold = sql`(case when ${last} then '1d' else '7d' end)`
    const meta =
      this.dialect === 'pg'
        ? sql`json_build_object('name', ${k.name}, 'expiresAt', to_char(${k.expiresAt}, 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))::text`
        : sql`json_object('name', ${k.name}, 'expiresAt', ${k.expiresAt})`
    const row = {
      id: '',
      organizationId: '',
      userId: '',
      kind: check.kind,
      event: check.event,
      groupKey: '',
      projectId: null,
      workspaceId: null,
      accessRequestId: null,
      meta: '{}',
      count: 1,
      needsAction: check.needsAction,
      readAt: null,
      createdAt: check.now,
      updatedAt: check.now,
    }
    const select = this.db
      .select({
        ...boundFields(n, row),
        id: sql<string>`${check.idPrefix} || '_' || ${k.id} || '_' || ${threshold}`,
        organizationId: sql<string>`${orgId}`,
        userId: k.createdBy,
        groupKey: sql<string>`${check.event} || ':' || ${k.id} || ':' || ${threshold}`,
        projectId: k.projectId,
        workspaceId: k.workspaceId,
        meta: sql<string>`${meta}`,
      })
      .from(k)
      .leftJoin(p, eq(p.id, k.projectId))
      .where(
        and(
          isNull(k.revokedAt),
          sql`${k.expiresAt} > ${check.now}`,
          sql`${k.expiresAt} <= ${check.warnBefore}`,
          // Still in the key's organization: an org-level place admits any member.
          sql`exists (select 1 from ${aliasedFrom(m)} where ${m.organizationId} = ${orgId} and ${m.userId} = ${k.createdBy})`,
          this.placeVisible(k.createdBy, orgId, k.projectId, k.workspaceId),
        ),
      )
    const rows = await this.db
      .insert(n)
      .select(select)
      .onConflictDoNothing({ target: [n.userId, n.groupKey] })
      .returning({ id: n.id })
    return rows.length
  }

  /**
   * The person's Inbox in the organization, newest first, at most `limit`
   * rows, with the pills' counts over every row they can see — one
   * statement. Places are named as they are now (null once gone or moved
   * away); a request row reads its request's status, and an answered one
   * no longer waits on them.
   */
  async list(organizationId: string, userId: string, limit: number): Promise<NotificationList> {
    const n = aliasedTable(this.t.notifications, 'nn')
    const o = aliasedTable(this.t.organization, 'no')
    const p = aliasedTable(this.t.projects, 'np')
    const w = aliasedTable(this.t.workspaces, 'nw')
    const r = aliasedTable(this.t.accessRequests, 'nr')
    const asker = aliasedTable(this.t.user, 'na')
    const read = sql`(${n.readAt} is not null or (${r.id} is not null and ${r.status} <> 'pending'))`
    const needsAction = sql`(case when ${n.accessRequestId} is not null then ${r.status} = 'pending' else ${n.needsAction} end)`
    // A gone place stays listed (named as gone); one that exists must be theirs to see.
    const visible = sql`(case when ${n.workspaceId} is not null and ${w.id} is not null then ${this.roles.workspaceRoleOf(userId, { organizationId, projectId: p.id, workspaceId: w.id })} is not null when ${n.workspaceId} is null and ${n.projectId} is not null and ${p.id} is not null then ${this.roles.projectVisible(userId, { organizationId, projectId: p.id })} else true end)`
    const rows = (await this.db
      .select({
        id: n.id,
        event: n.event,
        count: sql<number>`${n.count}`.mapWith(Number),
        meta: n.meta,
        at: n.updatedAt,
        read,
        needsAction,
        place: {
          level: sql<string>`(case when ${n.workspaceId} is not null then 'workspace' when ${n.projectId} is not null then 'project' else 'organization' end)`,
          orgName: o.name,
          projectSlug: p.slug,
          projectName: p.name,
          workspaceSlug: w.slug,
          workspaceName: w.name,
        },
        requestId: r.id,
        requestStatus: r.status,
        // Names may be empty (a magic-link account): the address stands in.
        requestAsker: sql<string>`coalesce(nullif(${asker.name}, ''), ${asker.email})`,
        requestAlreadyEditing: r.alreadyEditing,
        all: sql<number>`count(*) over ()`.mapWith(Number),
        unread: sql<number>`sum(case when ${read} then 0 else 1 end) over ()`.mapWith(Number),
        action: sql<number>`sum(case when ${needsAction} then 1 else 0 end) over ()`.mapWith(
          Number,
        ),
      })
      .from(n)
      .innerJoin(o, eq(o.id, n.organizationId))
      // Named only while still the organization's, as the audit log does.
      .leftJoin(p, and(eq(p.id, n.projectId), eq(p.organizationId, n.organizationId)))
      .leftJoin(w, and(eq(w.id, n.workspaceId), eq(w.projectId, p.id)))
      .leftJoin(r, eq(r.id, n.accessRequestId))
      .leftJoin(asker, eq(asker.id, r.userId))
      .where(and(eq(n.organizationId, organizationId), eq(n.userId, userId), visible))
      .orderBy(desc(n.updatedAt), desc(n.id))
      .limit(limit)) as ListedRow[]
    const first = rows[0]
    return {
      rows: rows.map((row) => ({
        id: row.id,
        event: row.event,
        count: row.count,
        meta: parseMeta(row.meta),
        at: row.at,
        read: truthy(row.read),
        needsAction: truthy(row.needsAction),
        place: row.place,
        request:
          row.requestId && row.requestStatus
            ? {
                id: row.requestId,
                status: row.requestStatus,
                asker: row.requestAsker ?? '',
                alreadyEditing: truthy(row.requestAlreadyEditing),
              }
            : null,
      })),
      counts: {
        all: first?.all ?? 0,
        unread: first?.unread ?? 0,
        action: first?.action ?? 0,
      },
    }
  }

  /** Marks the person's own row read; false when it isn't theirs in this org. */
  async markRead(
    organizationId: string,
    userId: string,
    id: string,
    now: string,
  ): Promise<boolean> {
    const n = this.t.notifications
    const rows = await this.db
      .update(n)
      .set({ readAt: sql`coalesce(${n.readAt}, ${now})` })
      .where(and(eq(n.id, id), eq(n.organizationId, organizationId), eq(n.userId, userId)))
      .returning({ id: n.id })
    return rows.length > 0
  }

  /** Marks every unread row of the person's in the organization read; how many. */
  async markAllRead(organizationId: string, userId: string, now: string): Promise<number> {
    const n = this.t.notifications
    const rows = await this.db
      .update(n)
      .set({ readAt: now })
      .where(and(eq(n.organizationId, organizationId), eq(n.userId, userId), isNull(n.readAt)))
      .returning({ id: n.id })
    return rows.length
  }

  /**
   * Deletes rows last touched before `before`, a bounded batch per
   * statement; how many. A row still waiting on someone stays: a pending
   * request's however old (asking again can't bring it back), and an ask for
   * a new invite while that invite is pending and expired less than the
   * retention ago (it can be asked only once; past that, it goes).
   */
  async purge(before: string): Promise<number> {
    const n = this.t.notifications
    const batch = aliasedTable(n, 'npb')
    const r = aliasedTable(this.t.accessRequests, 'npr')
    const i = aliasedTable(this.t.invitation, 'npi')
    // The invitation's id is the group key's tail: compared as `i.id = …` so its key is used.
    const askedAbout = sql`substr(${batch.groupKey}, ${ASK_AGAIN_PREFIX.length + 1})`
    const waiting = sql`(exists (select 1 from ${aliasedFrom(r)} where ${r.id} = ${batch.accessRequestId} and ${r.status} = 'pending') or (${batch.event} = 'invitation.ask_again' and exists (select 1 from ${aliasedFrom(i)} where ${i.id} = ${askedAbout} and ${i.status} = 'pending' and ${i.expiresAt} >= ${before})))`
    let total = 0
    for (;;) {
      const ids = this.db
        .select({ id: batch.id })
        .from(batch)
        .where(and(lt(batch.updatedAt, before), sql`not ${waiting}`))
        .limit(PURGE_BATCH)
      const rows = await this.db.delete(n).where(inArray(n.id, ids)).returning({ id: n.id })
      total += rows.length
      if (rows.length < PURGE_BATCH) return total
    }
  }

  /** When the person last closed What's new, and which notes they had seen; null if never. */
  async getReleaseVisit(userId: string): Promise<ReleaseVisitRow | null> {
    const v = this.t.releaseVisits
    const rows = await this.db
      .select({ seenAt: v.seenAt, seenIds: v.seenIds })
      .from(v)
      .where(eq(v.userId, userId))
      .limit(1)
    const row = rows[0] as { seenAt: string; seenIds: string } | undefined
    return row ? { seenAt: row.seenAt, seenIds: parseIds(row.seenIds) } : null
  }

  /** Records a visit: now, and the notes it showed. */
  async setReleaseVisit(userId: string, at: string, seenIds: string[]): Promise<ReleaseVisitRow> {
    const v = this.t.releaseVisits
    const ids = JSON.stringify(seenIds)
    await this.db
      .insert(v)
      .values({ userId, seenAt: at, seenIds: ids })
      .onConflictDoUpdate({ target: v.userId, set: { seenAt: at, seenIds: ids } })
    return { seenAt: at, seenIds }
  }
}
