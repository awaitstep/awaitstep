import {
  aliasedTable,
  and,
  desc,
  eq,
  gte,
  inArray,
  lt,
  ne,
  notInArray,
  or,
  sql,
  type SQL,
} from 'drizzle-orm'
import type {
  AuditEventInsert,
  AuditEventPage,
  AuditEventRow,
  AuditListFilter,
  FailureCount,
  PersonAuditInsert,
} from '../types.js'
import type { PaginationParams } from '../pagination.js'
import { clampLimit, decodeCursor, paginateResults } from '../pagination.js'
import { atomically } from './atomic.js'
import { aliasedFrom, type Dialect } from './json-array.js'
import { chunked, rowsPerInsert } from './statement-params.js'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyTable = any

export interface AuditTables {
  auditEvents: AnyTable
  organization: AnyTable
  member: AnyTable
  user: AnyTable
  projects: AnyTable
  workspaces: AnyTable
}

const LIKE_ESCAPE = '!'

/** Longest actor name a row keeps; the API cuts names at write too. */
const ACTOR_NAME_MAX = 200

const PURGE_BATCH = 1000

/** A listed row before it is shaped: every event column is null when the page is empty. */
type ListedRow = { total: number } & {
  [K in keyof Omit<AuditEventRow, 'scope'>]: AuditEventRow[K] | null
} & {
  level: AuditEventRow['scope']['level'] | null
  scopeName: string | null
  colour: string | null
}

/**
 * `text` as a LIKE pattern matching it anywhere, its wildcards taken
 * literally. Case folds with each dialect's `lower()`: SQLite and D1 fold
 * ASCII only, so a non-ASCII letter matches its own case there.
 */
function containsPattern(text: string): string {
  const escaped = text.toLowerCase().replace(/[!%_]/g, (c) => `${LIKE_ESCAPE}${c}`)
  return `%${escaped}%`
}

/**
 * The organization audit log (B7): rows the API writes after each sensitive
 * operation, the page that lists them, the token-check failure count the
 * lockout reads, and the 90-day purge.
 */
export class AuditAdapter {
  constructor(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    private db: any,
    private t: AuditTables,
    private dialect: Dialect,
  ) {}

  /** Writes the rows as one unit, a few per statement: each binds every column (D1's cap). */
  async insert(rows: AuditEventInsert[]): Promise<void> {
    if (rows.length === 0) return
    const perStatement = rowsPerInsert(this.t.auditEvents)
    await atomically(this.db, (tx) =>
      chunked(rows, perStatement).map((some) => tx.insert(this.t.auditEvents).values(some)),
    )
  }

  /**
   * One row per organization the person belongs to, in one statement; the
   * target is each org's name, the actor the person's name.
   */
  async insertForPerson(entry: PersonAuditInsert): Promise<void> {
    const m = this.t.member
    const o = this.t.organization
    const u = this.t.user
    await this.db.insert(this.t.auditEvents).select(
      this.db
        .select({
          id: sql<string>`${entry.idPrefix} || '_' || ${o.id}`.as('id'),
          organizationId: o.id,
          projectId: sql<null>`null`.as('project_id'),
          workspaceId: sql<null>`null`.as('workspace_id'),
          level: sql<string>`'organization'`.as('level'),
          kind: sql<string>`${entry.kind ?? 'auth'}`.as('kind'),
          event: sql<string>`${entry.event}`.as('event'),
          actorType: sql<string>`'user'`.as('actor_type'),
          actorId: sql<string>`${entry.userId}`.as('actor_id'),
          // As every row's: names are theirs to choose, so a bounded copy.
          actorName: sql<string>`substr(${u.name}, 1, ${sql.raw(String(ACTOR_NAME_MAX))})`.as(
            'actor_name',
          ),
          actorEmail: u.email,
          action: sql<string>`${entry.action}`.as('action'),
          target: entry.target === undefined ? o.name : sql<string>`${entry.target}`.as('target'),
          detail: sql<string>`${entry.detail}`.as('detail'),
          meta: sql<string>`${entry.meta ?? '{}'}`.as('meta'),
          ip: sql<string | null>`${entry.ip}`.as('ip'),
          createdAt: sql<string>`${entry.createdAt}`.as('created_at'),
        })
        .from(m)
        .innerJoin(o, eq(o.id, m.organizationId))
        .innerJoin(u, eq(u.id, m.userId))
        .where(eq(m.userId, entry.userId)),
    )
  }

  private conditions(e: AnyTable, filter: AuditListFilter): SQL[] {
    const conditions: SQL[] = [
      eq(e.organizationId, filter.organizationId),
      gte(e.createdAt, filter.since),
    ]
    if (filter.hiddenEvents.length > 0) {
      conditions.push(notInArray(e.event, [...filter.hiddenEvents]))
    }
    if (filter.level) conditions.push(eq(e.level, filter.level))
    const search = filter.search?.trim()
    if (search) {
      const pattern = containsPattern(search)
      const like = (column: AnyTable) => sql`lower(${column}) like ${pattern} escape ${LIKE_ESCAPE}`
      conditions.push(or(like(e.actorName), like(e.action), like(e.target))!)
    }
    return conditions
  }

  /**
   * One page of the log, newest first, with the number of events the filter
   * matches across every page and each row's scope named from the project
   * and workspace as they are now — one statement.
   */
  async list(filter: AuditListFilter, pagination?: PaginationParams): Promise<AuditEventPage> {
    const limit = clampLimit(pagination?.limit)
    const e = aliasedTable(this.t.auditEvents, 'ae')
    const counted = aliasedTable(this.t.auditEvents, 'aec')
    const o = aliasedTable(this.t.organization, 'aeo')
    const p = aliasedTable(this.t.projects, 'aep')
    const w = aliasedTable(this.t.workspaces, 'aew')
    const conditions = this.conditions(e, filter)
    if (pagination?.cursor) {
      const { id, timestamp } = decodeCursor(pagination.cursor)
      conditions.push(
        or(lt(e.createdAt, timestamp), and(eq(e.createdAt, timestamp), lt(e.id, id)))!,
      )
    }
    // The count rides a one-row derived table the page is left-joined to, so
    // a page past the last row still carries it.
    const totals = this.db
      .select({ total: sql<number>`count(*)`.mapWith(Number).as('total') })
      .from(counted)
      .where(and(...this.conditions(counted, filter)))
      .as('aet')
    const projectName = sql<string>`coalesce(${p.name}, 'Deleted project')`
    const scopeName = sql<string>`case ${e.level}
      when 'organization' then ${o.name}
      when 'project' then ${projectName}
      else ${projectName} || ' · ' || coalesce(${w.name}, 'Deleted workspace') end`
    const rows = (await this.db
      .select({
        total: totals.total,
        id: e.id,
        at: e.createdAt,
        kind: e.kind,
        event: e.event,
        actor: e.actorName,
        actorType: e.actorType,
        actorId: e.actorId,
        actorEmail: e.actorEmail,
        action: e.action,
        target: e.target,
        detail: e.detail,
        ip: e.ip,
        level: e.level,
        scopeName,
        colour: sql<string | null>`case when ${e.level} = 'workspace' then ${w.colour} end`,
      })
      .from(totals)
      .leftJoin(e, and(...conditions))
      .leftJoin(o, eq(o.id, e.organizationId))
      // Named only while still the organization's: a project moved away (and
      // its workspaces) reads as gone, never as what it is called elsewhere.
      .leftJoin(p, and(eq(p.id, e.projectId), eq(p.organizationId, e.organizationId)))
      .leftJoin(w, and(eq(w.id, e.workspaceId), eq(w.projectId, p.id)))
      .orderBy(desc(e.createdAt), desc(e.id))
      .limit(limit + 1)) as ListedRow[]
    const events: AuditEventRow[] = rows
      .filter((row): row is ListedRow & { id: string } => row.id !== null)
      .map(({ total: _total, level, scopeName: name, colour, ...row }) => ({
        ...(row as Omit<AuditEventRow, 'scope'>),
        scope: { level: level!, name: name!, colour },
      }))
    const page = paginateResults(events, limit, (row) => row.at)
    return { ...page, total: rows[0]?.total ?? 0 }
  }

  /**
   * Writes `attempt` and, in the same statement, counts the same actor's
   * other rows of its event since `since`, with the latest one's time. The
   * attempt is written before the check it reserves, so checks still in
   * flight count too — every other one, not only earlier ones: two in the
   * same millisecond can't be ordered. `ofType` counts only that actor type's
   * attempts (a session's checks leave out the keys'). On Postgres the
   * actor's attempts are serialized with a transaction-scoped advisory lock:
   * without it, concurrent inserts can't see each other's uncommitted rows.
   * Values are bound, never the inserted row's bare columns.
   */
  async reserveAttempt(
    attempt: AuditEventInsert,
    since: string,
    ofType?: AuditEventInsert['actorType'],
  ): Promise<FailureCount> {
    const t = this.t.auditEvents
    const other = aliasedTable(t, 'ap')
    const others = and(
      eq(other.actorId, attempt.actorId),
      eq(other.event, attempt.event),
      gte(other.createdAt, since),
      ne(other.id, attempt.id),
      ofType ? eq(other.actorType, ofType) : undefined,
    )
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const reserve = (db: any) =>
      db
        .insert(t)
        .values(attempt)
        .returning({
          failures:
            sql<number>`(select count(*) from ${aliasedFrom(other)} where ${others})`.mapWith(
              Number,
            ),
          lastFailureAt: sql<
            string | null
          >`(select max(${other.createdAt}) from ${aliasedFrom(other)} where ${others})`.mapWith(
            t.createdAt,
          ),
        })
    const [row] =
      this.dialect === 'pg'
        ? // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await this.db.transaction(async (tx: any) => {
            await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${attempt.actorId}))`)
            return reserve(tx)
          })
        : await reserve(this.db)
    return { failures: row?.failures ?? 0, lastFailureAt: row?.lastFailureAt ?? null }
  }

  async deleteOne(id: string): Promise<void> {
    await this.db.delete(this.t.auditEvents).where(eq(this.t.auditEvents.id, id))
  }

  /**
   * Deletes every row older than `before`, a bounded batch per statement so
   * a first purge of a large log never holds it all; how many went.
   */
  async purge(before: string): Promise<number> {
    const e = this.t.auditEvents
    const batch = aliasedTable(e, 'pb')
    let total = 0
    for (;;) {
      const ids = this.db
        .select({ id: batch.id })
        .from(batch)
        .where(lt(batch.createdAt, before))
        .limit(PURGE_BATCH)
      const rows = await this.db.delete(e).where(inArray(e.id, ids)).returning({ id: e.id })
      total += rows.length
      if (rows.length < PURGE_BATCH) return total
    }
  }
}
