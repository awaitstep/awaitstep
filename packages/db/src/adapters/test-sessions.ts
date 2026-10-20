import { eq, and, or, gt, asc, desc, sql, type SQL } from 'drizzle-orm'
import type {
  ExpiringTestSession,
  OwnedTestSession,
  ReserveTestSessionData,
  ReserveTestSessionLimits,
  TestSession,
  TestSessionCutoffs,
  TestSessionExpiry,
  TestSessionStatus,
  TestSessionUsage,
} from '../types.js'

// Drizzle's table types are per-dialect and do not unify, so one adapter
// serving both sqlite and postgres cannot name them; every adapter in this
// package takes its tables the same way.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyTable = any

const SLOT_INDEX = 'idx_test_sessions_live_slot'

/**
 * Whether an error is the slot index rejecting a concurrent reservation — the
 * one failure that means "someone else got there first" rather than something
 * being wrong.
 *
 * Two things make this fiddly. Drizzle wraps driver errors in
 * DrizzleQueryError, so the real one is under `cause`; and sqlite reports a
 * primary-key collision with the same "UNIQUE constraint failed" wording as a
 * unique index, so the columns have to be checked too — otherwise a duplicate
 * session id reads as a lost race.
 */
function isSlotConflict(err: unknown): boolean {
  for (let current = err; current; current = (current as { cause?: unknown }).cause) {
    const candidate = current as { code?: string; message?: string; constraint?: string }
    if (candidate.code === '23505' && candidate.constraint === SLOT_INDEX) return true
    const message = candidate.message ?? ''
    if (
      candidate.code === 'SQLITE_CONSTRAINT_UNIQUE' &&
      /user_id/i.test(message) &&
      /slot/i.test(message)
    ) {
      return true
    }
  }
  return false
}

/**
 * Test sessions — disposable workers running a workflow before it is
 * deployed. A session is addressed by its own id (no workflow in the path),
 * so every read joins `workflows` to prove the caller's project owns it, and
 * every read and write is scoped to the user who started it: a session is a
 * personal, billed resource, not something a collaborator may extend or stop.
 *
 * Expiry is computed in SQL and returned as a column. The alternative —
 * reading the clocks back and comparing them in JS — depends on parsing the
 * stored timestamp format correctly on every dialect, which it repeatedly did
 * not. Nothing above this layer parses a timestamp.
 */
export class TestSessionsAdapter {
  constructor(
    private db: AnyTable,
    private table: AnyTable,
    private workflows: AnyTable,
  ) {}

  // A session that may still own a container: what the concurrency cap counts
  // and what the partial unique index covers.
  private unfinished(): SQL {
    return or(eq(this.table.status, 'running'), eq(this.table.status, 'starting'))!
  }

  // Why this session should be stopped, or null while it may keep running.
  // The single authority — live, expired and every read derive from it, so a
  // session can never be live to one query and dead to another.
  private expiryCase(cutoffs: TestSessionCutoffs): SQL<TestSessionExpiry> {
    return sql<TestSessionExpiry>`case
      when ${this.table.status} not in ('starting', 'running') then null
      when ${this.table.status} = 'starting' then
        case when ${this.table.createdAt} <= ${cutoffs.starting} then 'start-timeout' end
      when ${this.table.createdAt} <= ${cutoffs.started} then 'lifetime'
      when ${this.table.lastUsedAt} <= ${cutoffs.idle} then 'idle'
    end`
  }

  private live(cutoffs: TestSessionCutoffs): SQL {
    return and(this.unfinished(), sql`${this.expiryCase(cutoffs)} is null`)!
  }

  private expired(cutoffs: TestSessionCutoffs): SQL {
    return and(this.unfinished(), sql`${this.expiryCase(cutoffs)} is not null`)!
  }

  /**
   * Records a session as `starting` if both caps still have room. The counts
   * are subqueries of the INSERT, and the concurrency cap is additionally
   * held by a partial unique index on the claimed slot — counting alone is
   * not atomic on postgres, where neither of two racing statements sees the
   * other's uncommitted row. Null when a cap was full or the race was lost.
   *
   * The cap counts every *unfinished* session, not just the live ones: an
   * expired session that has not been stopped yet still has a container
   * running and billing. Callers reap before reserving, so a user is never
   * blocked by a session that should already be gone.
   *
   * The projected columns are positional — drizzle emits the table's full
   * column list for an INSERT … SELECT — so this list must stay in schema
   * order. The reservation tests fail loudly if it drifts.
   */
  async reserve(
    data: ReserveTestSessionData,
    limits: ReserveTestSessionLimits,
  ): Promise<TestSession | null> {
    const now = new Date().toISOString()
    const heldByUser = sql`from ${this.table}
      where ${eq(this.table.userId, data.userId)} and ${this.unfinished()}`
    // Sessions share a fixed container pool with deploys, so there is a cap
    // on all of them together: without it a handful of users holding one
    // session each can leave no room to deploy anything.
    const heldByAnyone = sql`from ${this.table} where ${this.unfinished()}`

    try {
      const rows = await this.db
        .insert(this.table)
        .select(
          sql`select ${data.id}, ${data.workflowId}, ${data.versionId ?? null},
                     ${data.userId}, ${data.runtime}, ${data.containerId},
                     null, null,
                     coalesce((select max(${this.table.slot}) ${heldByUser}), -1) + 1,
                     'starting', null, ${now}, ${now}, null
              where (select count(*) ${heldByUser}) < ${limits.maxConcurrentPerUser}
                and (select count(*) ${heldByAnyone}) < ${limits.maxConcurrentTotal}
                and (select count(*) from ${this.table}
                     inner join ${this.workflows}
                       on ${eq(this.workflows.id, this.table.workflowId)}
                     where ${eq(this.workflows.projectId, limits.projectId)}
                       and ${this.table.createdAt} >= ${limits.quotaWindowStart})
                    < ${limits.maxPerWindowPerProject}`,
        )
        .returning()
      return rows[0] ?? null
    } catch (err) {
      if (isSlotConflict(err)) return null
      throw err
    }
  }

  /**
   * Publishes where the worker ended up. Only a session still inside its
   * start timeout can activate: a slow start the reaper already wrote off
   * must not come back after the user retried, or they hold two live sessions
   * against a cap of one. Scoped to the owner so the caller needs no separate
   * ownership read.
   */
  async activate(
    id: string,
    userId: string,
    processId: string,
    port: number,
    cutoffs: TestSessionCutoffs,
  ): Promise<TestSession | null> {
    const rows = await this.db
      .update(this.table)
      .set({ processId, port, status: 'running', lastUsedAt: new Date().toISOString() })
      .where(
        and(
          eq(this.table.id, id),
          eq(this.table.userId, userId),
          eq(this.table.status, 'starting'),
          gt(this.table.createdAt, cutoffs.starting),
        ),
      )
      .returning()
    return rows[0] ?? null
  }

  /**
   * One session plus its workflow and whether it has expired, scoped to its
   * owner and the caller's project in the same statement — a missing row,
   * someone else's session and a session in another project are all the same
   * answer.
   */
  async getOwned(
    id: string,
    userId: string,
    projectId: string,
    cutoffs: TestSessionCutoffs,
  ): Promise<OwnedTestSession | null> {
    const rows = await this.db
      .select({
        session: this.table,
        workflow: this.workflows,
        expiry: this.expiryCase(cutoffs),
      })
      .from(this.table)
      .innerJoin(this.workflows, eq(this.workflows.id, this.table.workflowId))
      .where(
        and(
          eq(this.table.id, id),
          eq(this.table.userId, userId),
          eq(this.workflows.projectId, projectId),
        ),
      )
      .limit(1)
    return rows[0] ?? null
  }

  /**
   * The user's newest live session for a workflow, so opening the Run tab
   * re-attaches instead of starting a second container. An expired session is
   * never offered: re-attaching would reset its idle clock and keep alive a
   * container the reaper had already written off.
   */
  async getLiveForWorkflow(
    workflowId: string,
    userId: string,
    cutoffs: TestSessionCutoffs,
  ): Promise<TestSession | null> {
    const rows = await this.db
      .select()
      .from(this.table)
      .where(
        and(
          eq(this.table.workflowId, workflowId),
          eq(this.table.userId, userId),
          this.live(cutoffs),
        ),
      )
      .orderBy(desc(this.table.createdAt))
      .limit(1)
    return rows[0] ?? null
  }

  /**
   * The two numbers a refusal message needs. They cover different scopes — a
   * user's sessions anywhere, and a project's sessions inside the quota
   * window — so they are two index-covered queries issued together rather
   * than one combined scan: an OR across a join can use neither index and
   * reads the whole table. `count()` comes back as a string on postgres,
   * hence the coercion.
   */
  async usage(
    projectId: string,
    userId: string,
    quotaWindowStart: string,
  ): Promise<TestSessionUsage> {
    const [held, everywhere, created] = await Promise.all([
      this.db
        .select({ n: sql<number | string>`count(*)` })
        .from(this.table)
        .where(and(eq(this.table.userId, userId), this.unfinished())),
      this.db
        .select({ n: sql<number | string>`count(*)` })
        .from(this.table)
        .where(this.unfinished()),
      this.db
        .select({ n: sql<number | string>`count(*)` })
        .from(this.table)
        .innerJoin(this.workflows, eq(this.workflows.id, this.table.workflowId))
        .where(
          and(
            eq(this.workflows.projectId, projectId),
            sql`${this.table.createdAt} >= ${quotaWindowStart}`,
          ),
        ),
    ])
    return {
      activeForUser: Number(held[0]?.n ?? 0),
      activeEverywhere: Number(everywhere[0]?.n ?? 0),
      createdInWindow: Number(created[0]?.n ?? 0),
    }
  }

  /**
   * Bumps the idle clock. Refused once a session is expired, so polling can
   * never keep a dead session alive — the caller treats false as "gone".
   */
  async touch(id: string, userId: string, cutoffs: TestSessionCutoffs): Promise<boolean> {
    const rows = await this.db
      .update(this.table)
      .set({ lastUsedAt: new Date().toISOString() })
      .where(
        and(
          eq(this.table.id, id),
          eq(this.table.userId, userId),
          eq(this.table.status, 'running'),
          this.live(cutoffs),
        ),
      )
      .returning({ id: this.table.id })
    return rows.length > 0
  }

  /**
   * Marks a session finished. The status transition rides in the WHERE
   * clause, so two writers racing the same session produce one winner and the
   * loser knows it did not have to stop anything.
   */
  async markStopped(
    id: string,
    status: Extract<TestSessionStatus, 'stopped' | 'failed'>,
    options: { userId?: string; error?: string } = {},
  ): Promise<boolean> {
    const rows = await this.db
      .update(this.table)
      .set({ status, error: options.error ?? null, stoppedAt: new Date().toISOString() })
      .where(
        and(
          eq(this.table.id, id),
          // The reaper stops sessions it does not own, so the scope is
          // optional — but an empty string is a user id matching nobody, not
          // an absent one.
          ...(options.userId !== undefined ? [eq(this.table.userId, options.userId)] : []),
          this.unfinished(),
        ),
      )
      .returning({ id: this.table.id })
    return rows.length > 0
  }

  /**
   * Sessions past one of their cut-offs — idle, over their lifetime, or stuck
   * starting — oldest first, each with its reason. Cut-offs come from the
   * caller's policy, so a TTL change needs no migration and no backfill.
   */
  async listExpired(
    cutoffs: TestSessionCutoffs,
    limit: number,
    userId?: string,
  ): Promise<ExpiringTestSession[]> {
    return this.db
      .select({ session: this.table, expiry: this.expiryCase(cutoffs) })
      .from(this.table)
      .where(
        and(
          this.expired(cutoffs),
          // A start reaps its own caller first: a sweep of everyone's can
          // fill its batch without reaching the session actually in the way.
          ...(userId !== undefined ? [eq(this.table.userId, userId)] : []),
        ),
      )
      .orderBy(asc(this.table.lastUsedAt))
      .limit(limit)
  }

  /** Every unfinished session for a workflow, whoever started it. */
  async listUnfinishedForWorkflow(workflowId: string): Promise<TestSession[]> {
    return this.db
      .select()
      .from(this.table)
      .where(and(eq(this.table.workflowId, workflowId), this.unfinished()))
      .orderBy(asc(this.table.createdAt))
  }

  /**
   * Writes off every unfinished session of a runtime without touching the
   * workers behind them. Used at boot: a node session's process id and port
   * refer to a process this host no longer has, and in a container those
   * numbers are reused, so acting on them would stop something else's work.
   */
  async markRuntimeAbandoned(
    runtime: TestSession['runtime'],
    error: string,
  ): Promise<TestSession[]> {
    return this.db
      .update(this.table)
      .set({ status: 'failed', error, stoppedAt: new Date().toISOString() })
      .where(and(eq(this.table.runtime, runtime), this.unfinished()))
      .returning()
  }
}
