import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, it, expect, beforeEach } from 'vitest'
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { DrizzleDatabaseAdapter } from '../adapters/index.js'
import * as sqliteSchema from '../schema/sqlite/index.js'
import type {
  ReserveTestSessionData,
  ReserveTestSessionLimits,
  TestSession,
  TestSessionCutoffs,
} from '../types.js'

const T0 = '2026-10-19T00:00:00.000Z'

// Cut-offs as the API's policy would produce them at 12:00 with a 10-minute
// idle window, a 1-hour lifetime and a 5-minute start timeout.
const CUTOFFS: TestSessionCutoffs = {
  idle: '2026-10-19T11:50:00.000Z',
  started: '2026-10-19T11:00:00.000Z',
  starting: '2026-10-19T11:55:00.000Z',
}

const MIGRATIONS = join(import.meta.dirname, '../../drizzle/sqlite')

// The table comes from its own migration, not from hand-written DDL: a test
// schema written out by hand drifts from the one that ships, and the
// constraints exercised here (the partial unique index, the `set null` on
// workflow deletion) are exactly what a hand-written copy leaves out.
function applyTestSessionsMigration(sqlite: Database.Database): void {
  const file = readdirSync(MIGRATIONS).find((name) => /test_sessions/.test(readMigration(name)))
  if (!file) throw new Error('No migration creates test_sessions')
  for (const statement of readMigration(file).split('--> statement-breakpoint')) {
    if (statement.trim()) sqlite.exec(statement)
  }
}

function readMigration(name: string): string {
  return name.endsWith('.sql') ? readFileSync(join(MIGRATIONS, name), 'utf-8') : ''
}

function createTestDb() {
  const sqlite = new Database(':memory:')
  sqlite.pragma('foreign_keys = ON')
  sqlite.exec(`
    CREATE TABLE workflows (id text PRIMARY KEY, project_id text NOT NULL, name text NOT NULL, kind text NOT NULL DEFAULT 'workflow', description text, trigger_code text, dependencies text, env_vars text, deploy_config text, current_version_id text, created_by text, created_at text NOT NULL, updated_at text NOT NULL);
    CREATE TABLE workflow_versions (id text PRIMARY KEY, workflow_id text NOT NULL, version integer NOT NULL, ir text NOT NULL, created_at text NOT NULL);
    INSERT INTO workflows (id, project_id, name, created_at, updated_at) VALUES ('wf-1', 'p-1', 'One', '${T0}', '${T0}');
    INSERT INTO workflows (id, project_id, name, created_at, updated_at) VALUES ('wf-2', 'p-1', 'Two', '${T0}', '${T0}');
    INSERT INTO workflows (id, project_id, name, created_at, updated_at) VALUES ('wf-other', 'p-2', 'Other', '${T0}', '${T0}');
    INSERT INTO workflow_versions (id, workflow_id, version, ir, created_at) VALUES ('v-1', 'wf-1', 1, '{}', '${T0}');
  `)
  applyTestSessionsMigration(sqlite)
  const adapter = new DrizzleDatabaseAdapter(drizzle(sqlite), sqliteSchema)
  return { adapter, sqlite }
}

function reservation(overrides: Partial<ReserveTestSessionData> = {}): ReserveTestSessionData {
  return {
    id: 's-1',
    workflowId: 'wf-1',
    userId: 'u-1',
    runtime: 'sandbox',
    containerId: 'test-s-1',
    ...overrides,
  }
}

function limits(overrides: Partial<ReserveTestSessionLimits> = {}): ReserveTestSessionLimits {
  return {
    cutoffs: CUTOFFS,
    projectId: 'p-1',
    maxConcurrentPerUser: 1,
    maxPerWindowPerProject: 3,
    quotaWindowStart: '2026-10-18T12:00:00.000Z',
    ...overrides,
  }
}

type SeedSession = {
  id: string
  workflowId?: string
  userId?: string
  status?: TestSession['status']
  createdAt: string
  lastUsedAt?: string
}

// Writes a row with explicit clocks and status — the adapter always stamps "now".
let nextSlot = 0

function seed(sqlite: Database.Database, data: SeedSession): void {
  sqlite
    .prepare(
      `INSERT INTO test_sessions (id, workflow_id, user_id, runtime, container_id, process_id, port, slot, status, created_at, last_used_at)
       VALUES (?, ?, ?, 'sandbox', ?, 'proc', 8787, ?, ?, ?, ?)`,
    )
    .run(
      data.id,
      data.workflowId ?? 'wf-1',
      data.userId ?? 'u-1',
      `test-${data.id}`,
      nextSlot++,
      data.status ?? 'running',
      data.createdAt,
      data.lastUsedAt ?? data.createdAt,
    )
}

const LIVE = {
  id: 'live',
  createdAt: '2026-10-19T11:30:00.000Z',
  lastUsedAt: '2026-10-19T11:59:00.000Z',
}

describe('test sessions adapter', () => {
  let db: ReturnType<typeof createTestDb>

  beforeEach(() => {
    db = createTestDb()
    nextSlot = 0
  })

  describe('reserve', () => {
    it('records a session before its container exists', async () => {
      const reserved = await db.adapter.reserveTestSession(
        reservation({ versionId: 'v-1' }),
        limits(),
      )
      expect(reserved).toMatchObject({
        id: 's-1',
        workflowId: 'wf-1',
        versionId: 'v-1',
        userId: 'u-1',
        runtime: 'sandbox',
        containerId: 'test-s-1',
        status: 'starting',
      })
      // Nothing is known about the worker yet — that is the point.
      expect(reserved!.processId).toBeNull()
      expect(reserved!.port).toBeNull()
      expect(reserved!.lastUsedAt).toBe(reserved!.createdAt)
    })

    it('refuses a second live session for the same user', async () => {
      seed(db.sqlite, LIVE)
      expect(await db.adapter.reserveTestSession(reservation(), limits())).toBeNull()
    })

    it('counts a session that is still starting, so a double-click cannot pass twice', async () => {
      seed(db.sqlite, { id: 'starting', status: 'starting', createdAt: '2026-10-19T11:59:00.000Z' })
      expect(await db.adapter.reserveTestSession(reservation(), limits())).toBeNull()
    })

    it('counts the user across projects — a new project is not a new allowance', async () => {
      seed(db.sqlite, { ...LIVE, workflowId: 'wf-other' })
      expect(
        await db.adapter.reserveTestSession(reservation(), limits({ projectId: 'p-1' })),
      ).toBeNull()
    })

    it('ignores another user’s live session', async () => {
      seed(db.sqlite, { ...LIVE, userId: 'u-2' })
      expect(await db.adapter.reserveTestSession(reservation(), limits())).not.toBeNull()
    })

    it('counts a session that is expired but not yet stopped', async () => {
      // Reversal of an earlier rule: expiry says nothing about whether a
      // container is still running. Until the session is actually stopped it
      // is still billing, so it holds its place against the cap — callers
      // reap before reserving, so a user is never blocked by a ghost.
      seed(db.sqlite, {
        id: 'idle',
        createdAt: '2026-10-19T11:30:00.000Z',
        lastUsedAt: '2026-10-19T11:40:00.000Z',
      })
      expect(
        await db.adapter.reserveTestSession(reservation(), limits({ maxPerWindowPerProject: 10 })),
      ).toBeNull()
    })

    it('does not count a session that has been stopped', async () => {
      for (const status of ['stopped', 'failed'] as const) {
        const fresh = createTestDb()
        seed(fresh.sqlite, { id: `done-${status}`, status, createdAt: '2026-10-19T11:30:00.000Z' })
        expect(
          await fresh.adapter.reserveTestSession(reservation(), limits()),
          status,
        ).not.toBeNull()
      }
    })

    it('refuses once the project has spent its window quota', async () => {
      seed(db.sqlite, { id: 'q1', status: 'stopped', createdAt: '2026-10-19T08:00:00.000Z' })
      seed(db.sqlite, { id: 'q2', status: 'stopped', createdAt: '2026-10-19T09:00:00.000Z' })
      seed(db.sqlite, {
        id: 'q3',
        status: 'failed',
        workflowId: 'wf-2',
        createdAt: '2026-10-19T10:00:00.000Z',
      })
      expect(await db.adapter.reserveTestSession(reservation(), limits())).toBeNull()
    })

    it('does not count sessions outside the window or outside the project', async () => {
      seed(db.sqlite, { id: 'old', status: 'stopped', createdAt: '2026-10-17T08:00:00.000Z' })
      seed(db.sqlite, {
        id: 'elsewhere',
        status: 'stopped',
        workflowId: 'wf-other',
        createdAt: '2026-10-19T09:00:00.000Z',
      })
      seed(db.sqlite, { id: 'counted', status: 'stopped', createdAt: '2026-10-19T09:00:00.000Z' })
      expect(
        await db.adapter.reserveTestSession(reservation(), limits({ maxPerWindowPerProject: 2 })),
      ).not.toBeNull()
    })

    it('inserts nothing when a cap is zero', async () => {
      expect(
        await db.adapter.reserveTestSession(reservation(), limits({ maxConcurrentPerUser: 0 })),
      ).toBeNull()
      expect(
        await db.adapter.reserveTestSession(reservation(), limits({ maxPerWindowPerProject: 0 })),
      ).toBeNull()
      expect(db.sqlite.prepare('SELECT count(*) as n FROM test_sessions').get()).toEqual({ n: 0 })
    })

    it('allows more than one session when the cap is raised', async () => {
      seed(db.sqlite, LIVE)
      expect(
        await db.adapter.reserveTestSession(reservation(), limits({ maxConcurrentPerUser: 2 })),
      ).not.toBeNull()
    })
  })

  describe('activate', () => {
    it('publishes the worker and flips the session to running', async () => {
      await db.adapter.reserveTestSession(reservation(), limits())
      const activated = await db.adapter.activateTestSession('s-1', 'u-1', 'proc-9', 8801, CUTOFFS)
      expect(activated).toMatchObject({ status: 'running', processId: 'proc-9', port: 8801 })
    })

    it('refuses a session the reaper already wrote off', async () => {
      await db.adapter.reserveTestSession(reservation(), limits())
      await db.adapter.markTestSessionStopped('s-1', 'failed', 'never came up')
      expect(await db.adapter.activateTestSession('s-1', 'u-1', 'proc-9', 8801, CUTOFFS)).toBeNull()
      expect(
        await db.adapter.activateTestSession('missing', 'u-1', 'proc-9', 8801, CUTOFFS),
      ).toBeNull()
    })
  })

  describe('slots', () => {
    it('writes off a start that timed out instead of letting it return', async () => {
      seed(db.sqlite, {
        id: 'slow',
        status: 'starting',
        createdAt: '2026-10-19T11:30:00.000Z',
      })
      // The reaper has given up on it; a late activation would hand the user
      // a second live session against a cap of one.
      expect(await db.adapter.activateTestSession('slow', 'u-1', 'proc', 8801, CUTOFFS)).toBeNull()
    })

    it('refuses to activate a session belonging to someone else', async () => {
      await db.adapter.reserveTestSession(reservation(), limits())
      expect(await db.adapter.activateTestSession('s-1', 'u-2', 'proc', 8801, CUTOFFS)).toBeNull()
    })

    it('gives each live session its own slot', async () => {
      const first = await db.adapter.reserveTestSession(reservation(), limits())
      const second = await db.adapter.reserveTestSession(
        reservation({ id: 's-2', containerId: 'test-s-2' }),
        limits({ maxConcurrentPerUser: 2 }),
      )
      expect(first!.slot).toBe(0)
      expect(second!.slot).toBe(1)
    })

    it('does not reuse the slot of a start the reaper has not collected yet', async () => {
      seed(db.sqlite, {
        id: 'stale',
        status: 'starting',
        createdAt: '2026-10-19T11:00:00.000Z',
      })
      // Still unfinished, so it holds both a cap place and its slot; with
      // room for two, the next reservation has to take the slot above it.
      const reserved = await db.adapter.reserveTestSession(
        reservation(),
        limits({ maxConcurrentPerUser: 2 }),
      )
      expect(reserved).not.toBeNull()
      expect(reserved!.slot).toBe(1)
    })

    it('refuses the loser of a race instead of failing the request', async () => {
      // Simulates what the partial unique index does when two reservations
      // compute the same slot: the row is already taken, and the adapter has
      // to read that as "full", not as an error. Postgres wraps driver errors
      // one level deeper, which is why this path needs a test at all.
      db.sqlite
        .prepare(
          `INSERT INTO test_sessions (id, workflow_id, user_id, runtime, container_id, slot, status, created_at, last_used_at)
           VALUES ('taken', 'wf-1', 'u-1', 'sandbox', 'c', 0, 'running', ?, ?)`,
        )
        .run('2026-10-19T11:59:00.000Z', '2026-10-19T11:59:00.000Z')

      const blocked = await db.adapter.reserveTestSession(
        reservation(),
        // Cap of 2 lets the count pass, so only the index can refuse it.
        limits({ maxConcurrentPerUser: 2 }),
      )
      expect(blocked).not.toBeNull()
      expect(blocked!.slot).toBe(1)
    })

    it('reports an integrity error rather than calling it a lost race', async () => {
      // A duplicate id is a primary-key collision, which sqlite words exactly
      // like a unique-index violation. Reading it as "capacity full" would
      // hide a real bug.
      await db.adapter.reserveTestSession(reservation(), limits())
      await db.adapter.markTestSessionStopped('s-1', 'stopped')
      await expect(db.adapter.reserveTestSession(reservation(), limits())).rejects.toThrow(
        /constraint/i,
      )
    })

    it('frees a slot once a session is finished', async () => {
      const first = await db.adapter.reserveTestSession(reservation(), limits())
      await db.adapter.markTestSessionStopped(first!.id, 'stopped')
      const second = await db.adapter.reserveTestSession(
        reservation({ id: 's-2', containerId: 'test-s-2' }),
        limits(),
      )
      expect(second!.slot).toBe(0)
    })
  })

  describe('reads', () => {
    it('resolves a session only for its owner inside the owning project', async () => {
      seed(db.sqlite, { id: 's-1', createdAt: T0 })
      const found = await db.adapter.getOwnedTestSession('s-1', 'u-1', 'p-1', CUTOFFS)
      expect(found?.session.id).toBe('s-1')
      expect(found?.workflow.name).toBe('One')
      expect(await db.adapter.getOwnedTestSession('s-1', 'u-2', 'p-1', CUTOFFS)).toBeNull()
      expect(await db.adapter.getOwnedTestSession('s-1', 'u-1', 'p-2', CUTOFFS)).toBeNull()
      expect(await db.adapter.getOwnedTestSession('missing', 'u-1', 'p-1', CUTOFFS)).toBeNull()
    })

    it('re-attaches to the newest live session, per user', async () => {
      seed(db.sqlite, {
        id: 'older',
        createdAt: '2026-10-19T11:30:00.000Z',
        lastUsedAt: '2026-10-19T11:58:00.000Z',
      })
      seed(db.sqlite, {
        id: 'newest',
        createdAt: '2026-10-19T11:45:00.000Z',
        lastUsedAt: '2026-10-19T11:59:00.000Z',
      })
      seed(db.sqlite, {
        id: 'theirs',
        userId: 'u-2',
        createdAt: '2026-10-19T11:50:00.000Z',
        lastUsedAt: '2026-10-19T11:59:30.000Z',
      })

      expect((await db.adapter.getLiveTestSessionForWorkflow('wf-1', 'u-1', CUTOFFS))?.id).toBe(
        'newest',
      )
      expect((await db.adapter.getLiveTestSessionForWorkflow('wf-1', 'u-2', CUTOFFS))?.id).toBe(
        'theirs',
      )
      expect(await db.adapter.getLiveTestSessionForWorkflow('wf-2', 'u-1', CUTOFFS)).toBeNull()
    })

    it('never offers an expired or finished session for re-attach', async () => {
      seed(db.sqlite, {
        id: 'idle',
        createdAt: '2026-10-19T11:30:00.000Z',
        lastUsedAt: '2026-10-19T11:40:00.000Z',
      })
      seed(db.sqlite, { id: 'stopped', status: 'stopped', createdAt: '2026-10-19T11:59:00.000Z' })
      seed(db.sqlite, {
        id: 'stale-start',
        status: 'starting',
        createdAt: '2026-10-19T11:30:00.000Z',
      })
      expect(await db.adapter.getLiveTestSessionForWorkflow('wf-1', 'u-1', CUTOFFS)).toBeNull()
    })

    it('counts concurrency per user and the quota window per project in one query', async () => {
      seed(db.sqlite, { ...LIVE, id: 'mine-live' })
      seed(db.sqlite, {
        id: 'mine-elsewhere',
        workflowId: 'wf-other',
        createdAt: '2026-10-19T11:45:00.000Z',
        lastUsedAt: '2026-10-19T11:59:00.000Z',
      })
      seed(db.sqlite, {
        id: 'mine-expired',
        createdAt: '2026-10-19T11:00:00.000Z',
        lastUsedAt: '2026-10-19T11:10:00.000Z',
      })
      seed(db.sqlite, {
        id: 'mine-stopped',
        status: 'stopped',
        createdAt: '2026-10-19T09:00:00.000Z',
      })
      seed(db.sqlite, { ...LIVE, id: 'theirs-live', userId: 'u-2' })
      seed(db.sqlite, {
        id: 'old-window',
        status: 'stopped',
        createdAt: '2026-10-17T09:00:00.000Z',
      })

      expect(
        await db.adapter.getTestSessionUsage('p-1', 'u-1', '2026-10-18T12:00:00.000Z'),
      ).toEqual({
        // Unfinished anywhere: p-1, p-2, and the expired-but-unstopped one —
        // all three may still own a container. Concurrency ignores project.
        activeForUser: 3,
        // p-1 rows inside the window: mine-live, mine-expired, mine-stopped, theirs-live
        createdInWindow: 4,
      })
    })

    it('reports no usage for a project that has never run a session', async () => {
      expect(
        await db.adapter.getTestSessionUsage('p-9', 'u-9', '2026-10-18T12:00:00.000Z'),
      ).toEqual({ activeForUser: 0, createdInWindow: 0 })
    })
  })

  describe('lifecycle', () => {
    it('touches a live session and refuses an expired one', async () => {
      seed(db.sqlite, LIVE)
      expect(await db.adapter.touchTestSession('live', 'u-1', CUTOFFS)).toBe(true)
      const touched = await db.adapter.getOwnedTestSession('live', 'u-1', 'p-1', CUTOFFS)
      expect(touched!.session.lastUsedAt > LIVE.lastUsedAt).toBe(true)

      seed(db.sqlite, {
        id: 'idle',
        createdAt: '2026-10-19T11:30:00.000Z',
        lastUsedAt: '2026-10-19T11:40:00.000Z',
      })
      expect(await db.adapter.touchTestSession('idle', 'u-1', CUTOFFS)).toBe(false)
      expect(await db.adapter.touchTestSession('missing', 'u-1', CUTOFFS)).toBe(false)
      // Someone else's session is not theirs to keep alive.
      expect(await db.adapter.touchTestSession('live', 'u-2', CUTOFFS)).toBe(false)
    })

    it('lets exactly one writer stop a session, from either live state', async () => {
      await db.adapter.reserveTestSession(reservation(), limits())
      expect(await db.adapter.markTestSessionStopped('s-1', 'failed', { error: 'boom' })).toBe(true)
      expect(await db.adapter.markTestSessionStopped('s-1', 'stopped')).toBe(false)

      const stopped = await db.adapter.getOwnedTestSession('s-1', 'u-1', 'p-1', CUTOFFS)
      expect(stopped!.session).toMatchObject({ status: 'failed', error: 'boom' })
      expect(stopped!.session.stoppedAt).not.toBeNull()
    })

    it('lists every kind of expired session, oldest first, and nothing live', async () => {
      seed(db.sqlite, {
        id: 'idle',
        createdAt: '2026-10-19T11:30:00.000Z',
        lastUsedAt: '2026-10-19T11:45:00.000Z',
      })
      seed(db.sqlite, {
        id: 'too-old',
        createdAt: '2026-10-19T10:00:00.000Z',
        lastUsedAt: '2026-10-19T11:59:00.000Z',
      })
      seed(db.sqlite, { id: 'stuck', status: 'starting', createdAt: '2026-10-19T11:30:00.000Z' })
      seed(db.sqlite, LIVE)
      seed(db.sqlite, {
        id: 'starting-fresh',
        status: 'starting',
        createdAt: '2026-10-19T11:59:00.000Z',
      })
      seed(db.sqlite, {
        id: 'already-stopped',
        status: 'stopped',
        createdAt: '2026-10-19T08:00:00.000Z',
      })

      const expired = await db.adapter.listExpiredTestSessions(CUTOFFS, 10)
      expect(expired.map((e) => e.session.id).sort()).toEqual(['idle', 'stuck', 'too-old'])
      // Oldest idle clock first, so a reaper that can only take a few takes the stalest.
      expect(expired[0]!.session.id).toBe('stuck')
      // Each one carries why, so the reaper reports it without re-deriving.
      expect(Object.fromEntries(expired.map((e) => [e.session.id, e.expiry]))).toEqual({
        stuck: 'start-timeout',
        idle: 'idle',
        'too-old': 'lifetime',
      })
      expect(await db.adapter.listExpiredTestSessions(CUTOFFS, 1)).toHaveLength(1)
    })

    it('keeps a session row when its workflow is deleted', async () => {
      await db.adapter.reserveTestSession(reservation(), limits())
      db.sqlite.prepare('DELETE FROM workflows WHERE id = ?').run('wf-1')

      // The row is the only record of a running container. Cascading it away
      // left the container running with nothing able to find it; the reaper
      // still can.
      expect(await db.adapter.getOwnedTestSession('s-1', 'u-1', 'p-1', CUTOFFS)).toBeNull()
      // Cut-offs past the row's own clock, so it counts as expired whenever
      // the suite runs.
      const everything = {
        idle: '2099-01-01T00:00:00.000Z',
        started: '2099-01-01T00:00:00.000Z',
        starting: '2099-01-01T00:00:00.000Z',
      }
      const orphaned = await db.adapter.listExpiredTestSessions(everything, 10)
      expect(orphaned.map((e) => e.session.id)).toEqual(['s-1'])
      expect(orphaned[0]!.session.workflowId).toBeNull()
      expect(orphaned[0]!.session.containerId).toBe('test-s-1')
    })
  })
})
