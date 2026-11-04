import { describe, it, expect, beforeEach } from 'vitest'
import { presetPermissions } from '@awaitstep/ir'
import {
  createTestApp,
  resetStore,
  mockDb,
  FakeTestSessionRunner,
  TEST_USER_ID,
  TEST_ORG_ID,
  TEST_PROJECT_ID,
  TEST_WORKSPACE_ID,
} from './helpers.js'
import { reapTestSessions, resolveTestSession } from '../lib/test-sessions.js'
import { resolveTestSessionLimits, testSessionCutoffs } from '../lib/test-session-policy.js'
import { hashApiKey } from '../lib/api-key-hash.js'
import { BundleEscapeError } from '@awaitstep/provider-cloudflare'

const validIR = {
  metadata: {
    name: 'test',
    version: 1,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  },
  nodes: [
    {
      id: 'step-1',
      type: 'step',
      name: 'Hello',
      position: { x: 0, y: 0 },
      version: '1.0.0',
      provider: 'cloudflare',
      data: { code: 'return 1;' },
    },
  ],
  edges: [],
  entryNodeId: 'step-1',
}

function url(path: string) {
  return `${path}${path.includes('?') ? '&' : '?'}projectId=${TEST_PROJECT_ID}`
}

async function seedWorkflow(app: ReturnType<typeof createTestApp>) {
  await mockDb.createWorkflow({
    id: 'wf-1',
    projectId: TEST_PROJECT_ID,
    createdBy: TEST_USER_ID,
    name: 'Test',
  })
  const res = await app.request(url('/api/workflows/wf-1/versions'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ir: validIR }),
  })
  expect(res.status).toBe(201)
}

function start(app: ReturnType<typeof createTestApp>) {
  return app.request(url('/api/workflows/wf-1/test-sessions'), { method: 'POST' })
}

describe('test session routes', () => {
  let runner: FakeTestSessionRunner
  let app: ReturnType<typeof createTestApp>

  beforeEach(async () => {
    resetStore()
    runner = new FakeTestSessionRunner()
    app = createTestApp({ testSessionRunner: runner })
    await seedWorkflow(app)
  })

  describe('POST /workflows/:id/test-sessions', () => {
    it('starts a session and reports it without anything internal', async () => {
      const res = await start(app)
      expect(res.status).toBe(201)
      const body = (await res.json()) as {
        session: Record<string, unknown>
        reused: boolean
      }

      expect(body.reused).toBe(false)
      expect(body.session).toMatchObject({ workflowId: 'wf-1', runtime: 'node', status: 'running' })
      // The container and process are ours to act on, not a client's to see.
      expect(body.session).not.toHaveProperty('containerId')
      expect(body.session).not.toHaveProperty('processId')
      expect(runner.started).toHaveLength(1)
    })

    it('reuses the session a user already has instead of refusing', async () => {
      const first = (await (await start(app)).json()) as { session: { id: string } }
      const second = await start(app)

      expect(second.status).toBe(200)
      const body = (await second.json()) as { session: { id: string }; reused: boolean }
      expect(body.reused).toBe(true)
      expect(body.session.id).toBe(first.session.id)
      // The cap would otherwise turn a second click into an error about the
      // session the user is asking for.
      expect(runner.started).toHaveLength(1)
    })

    it('refuses a second workflow while one session is running', async () => {
      await start(app)
      await mockDb.createWorkflow({
        id: 'wf-2',
        projectId: TEST_PROJECT_ID,
        createdBy: TEST_USER_ID,
        name: 'Other',
      })
      const version = await mockDb.createVersion({
        id: 'v-2',
        workflowId: 'wf-2',
        ir: JSON.stringify(validIR),
      })
      await mockDb.updateWorkflow('wf-2', { currentVersionId: version.id })

      const res = await app.request(url('/api/workflows/wf-2/test-sessions'), { method: 'POST' })
      expect(res.status).toBe(429)
      expect((await res.json()) as { error: string }).toMatchObject({
        error: expect.stringContaining('stop it'),
      })
    })

    it('reports that sessions are disabled when the caps are zeroed', async () => {
      const disabled = createTestApp({
        testSessionRunner: runner,
        testSessionLimits: { maxConcurrentPerUser: 0, maxPerWindowPerProject: 0 },
      })
      const res = await disabled.request(url('/api/workflows/wf-1/test-sessions'), {
        method: 'POST',
      })
      expect(res.status).toBe(503)
      expect((await res.json()) as { error: string }).toMatchObject({
        error: expect.stringContaining('disabled'),
      })
    })

    it('says so when this deployment cannot run sessions at all', async () => {
      const without = createTestApp()
      const res = await without.request(url('/api/workflows/wf-1/test-sessions'), {
        method: 'POST',
      })
      expect(res.status).toBe(501)
    })

    it('disposes the worker and records the failure when a start fails', async () => {
      runner.failStart = 'wrangler dev exited with code 1: bad binding'
      const res = await start(app)

      expect(res.status).toBe(502)
      expect((await res.json()) as { error: string }).toMatchObject({
        error: expect.stringContaining('bad binding'),
      })
      // The row exists from before the container did, so both get cleaned up.
      expect(runner.stopped).toHaveLength(1)
      const stored = [...(await mockDb.listExpiredTestSessions(FUTURE, 10))]
      expect(stored).toHaveLength(0)
    })

    it('answers a workflow whose imports leave the project as the caller’s mistake', async () => {
      // The containment check refusing the bundle came back as a 502, which
      // blamed the server for the workflow's own import.
      runner.failStart = new BundleEscapeError(['"../host-secret.json"'])
      const res = await start(app)

      expect(res.status).toBe(422)
      expect(((await res.json()) as { error: string }).error).toContain('host-secret')
    })

    it('refuses a workflow with no version', async () => {
      await mockDb.createWorkflow({
        id: 'wf-empty',
        projectId: TEST_PROJECT_ID,
        createdBy: TEST_USER_ID,
        name: 'Empty',
      })
      const res = await app.request(url('/api/workflows/wf-empty/test-sessions'), {
        method: 'POST',
      })
      expect(res.status).toBe(400)
    })
  })

  describe('the session routes exist at exactly one path', () => {
    it('does not answer under /workflows, where the scope guards do not reach', async () => {
      const { session } = (await (await start(app)).json()) as { session: { id: string } }

      // Mounting one router at both prefixes also exposed every session
      // route here — a path requireScope('write') never named, so a
      // read-only key could trigger and stop sessions through it.
      const res = await app.request(url(`/api/workflows/test-sessions/${session.id}/trigger`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
      expect(res.status).toBe(404)
      expect(runner.triggers).toHaveLength(0)
    })
  })

  describe('reuse', () => {
    it('hands back a session that is still starting rather than building again', async () => {
      // A second click during a start would otherwise compile the bundle
      // again and then collide with its own reservation.
      const slow = new FakeTestSessionRunner()
      let release: () => void = () => {}
      slow.start = async (_bundle, target) => {
        slow.started.push(target.sessionId)
        await new Promise<void>((resolve) => {
          release = resolve
        })
        return { processId: 'pid', port: 8800 }
      }
      const slowApp = createTestApp({ testSessionRunner: slow })
      const first = start(slowApp)
      await new Promise((resolve) => setTimeout(resolve, 5))

      const second = await start(slowApp)
      expect(second.status).toBe(200)
      expect(((await second.json()) as { reused: boolean }).reused).toBe(true)
      expect(slow.started).toHaveLength(1)

      release()
      await first
    })

    it('replaces a session running an older version', async () => {
      const { session } = (await (await start(app)).json()) as { session: { id: string } }

      // Saving a fix and pressing Run must not hand back the old code.
      const next = await mockDb.createVersion({
        id: 'v-next',
        workflowId: 'wf-1',
        ir: JSON.stringify(validIR),
      })
      await mockDb.updateWorkflow('wf-1', { currentVersionId: next.id })

      const res = await start(app)
      expect(res.status).toBe(201)
      const body = (await res.json()) as { session: { id: string }; reused: boolean }
      expect(body.reused).toBe(false)
      expect(body.session.id).not.toBe(session.id)
      expect(runner.stopped).toContain(session.id)
    })

    it('keeps the reused session alive', async () => {
      const { session } = (await (await start(app)).json()) as {
        session: { id: string; lastUsedAt: string }
      }
      await new Promise((resolve) => setTimeout(resolve, 5))

      const reused = (await (await start(app)).json()) as { session: { lastUsedAt: string } }
      // Otherwise the session handed back can expire a moment later.
      expect(reused.session.lastUsedAt >= session.lastUsedAt).toBe(true)
    })
  })

  describe('GET /workflows/:id/test-sessions', () => {
    it('reports the live session, or nothing', async () => {
      const empty = await app.request(url('/api/workflows/wf-1/test-sessions'))
      expect((await empty.json()) as { session: null }).toEqual({ session: null })

      await start(app)
      const found = await app.request(url('/api/workflows/wf-1/test-sessions'))
      expect((await found.json()) as { session: { status: string } }).toMatchObject({
        session: { status: 'running' },
      })
    })
  })

  describe('a workspace key', () => {
    const OTHER_KEY = 'ask_test-sessions-other-ws'
    const OWN_KEY = 'ask_test-sessions-own-ws'
    const asKey = (key: string, init?: RequestInit): RequestInit => ({
      ...init,
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    })
    async function pinnedKey(id: string, secret: string, workspaceId: string) {
      await mockDb.createApiKey({
        id,
        level: 'workspace',
        organizationId: TEST_ORG_ID,
        projectId: TEST_PROJECT_ID,
        workspaceIds: [workspaceId],
        createdBy: TEST_USER_ID,
        name: id,
        keyHash: await hashApiKey(secret),
        keyPrefix: secret.slice(0, 8),
        scopes: '["read","deploy"]',
        permissions: JSON.stringify(presetPermissions('workspace', 'full')),
      })
    }

    it('cannot trigger, stream or stop a session in another workspace', async () => {
      // The session routes resolve by session id, so the pin has to be in
      // that read too: wf-1 sits in the default workspace, the key elsewhere.
      const { session } = (await (await start(app)).json()) as { session: { id: string } }
      await mockDb.createWorkspace(
        { id: 'ws-other', projectId: TEST_PROJECT_ID, name: 'Other', slug: 'other' },
        [],
      )
      await pinnedKey('key-other', OTHER_KEY, 'ws-other')
      await pinnedKey('key-own', OWN_KEY, TEST_WORKSPACE_ID)

      const trigger = await app.request(
        `/api/test-sessions/${session.id}/trigger`,
        asKey(OTHER_KEY, { method: 'POST', body: '{}' }),
      )
      expect(trigger.status).toBe(404)
      const stream = await app.request(`/api/test-sessions/${session.id}/stream`, asKey(OTHER_KEY))
      expect(stream.status).toBe(404)
      const stop = await app.request(
        `/api/test-sessions/${session.id}`,
        asKey(OTHER_KEY, { method: 'DELETE' }),
      )
      expect(stop.status).toBe(404)
      expect(runner.triggers).toHaveLength(0)
      expect(runner.stopped).toHaveLength(0)

      // Pinned to the session's own workspace, the same calls go through.
      const own = await app.request(
        `/api/test-sessions/${session.id}/trigger`,
        asKey(OWN_KEY, { method: 'POST', body: '{}' }),
      )
      expect(own.status).toBe(200)
      expect(runner.triggers).toHaveLength(1)
      const stopped = await app.request(
        `/api/test-sessions/${session.id}`,
        asKey(OWN_KEY, { method: 'DELETE' }),
      )
      expect(stopped.status).toBe(200)
      expect(runner.stopped).toEqual([session.id])
    })
  })

  describe('POST /test-sessions/:id/trigger', () => {
    it('proxies the payload into the session', async () => {
      const { session } = (await (await start(app)).json()) as { session: { id: string } }

      const res = await app.request(url(`/api/test-sessions/${session.id}/trigger`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ payload: { email: 'a@b.c' } }),
      })

      expect(res.status).toBe(200)
      expect((await res.json()) as { body: unknown }).toMatchObject({
        status: 200,
        body: { instanceId: 'inst-1' },
      })
      expect(runner.triggers).toEqual([{ sessionId: session.id, payload: { email: 'a@b.c' } }])
    })

    it('refuses a session that belongs to someone else', async () => {
      await mockDb.reserveTestSession(
        {
          id: 'theirs',
          workflowId: 'wf-1',
          userId: 'someone-else',
          runtime: 'node',
          containerId: 'fake-theirs',
        },
        {
          cutoffs: testSessionCutoffs(LIMITS),
          projectId: TEST_PROJECT_ID,
          maxConcurrentPerUser: 5,
          maxConcurrentTotal: 10,
          maxPerWindowPerProject: 50,
          quotaWindowStart: '2000-01-01T00:00:00.000Z',
        },
      )

      const res = await app.request(url('/api/test-sessions/theirs/trigger'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
      // Indistinguishable from a session that does not exist.
      expect(res.status).toBe(404)
    })
  })

  describe('DELETE /test-sessions/:id', () => {
    it('stops the worker and the session', async () => {
      const { session } = (await (await start(app)).json()) as { session: { id: string } }

      const res = await app.request(url(`/api/test-sessions/${session.id}`), { method: 'DELETE' })
      expect(res.status).toBe(200)
      expect(runner.stopped).toContain(session.id)

      // Gone for every later request, not just this one.
      const after = await app.request(url(`/api/test-sessions/${session.id}/trigger`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
      expect(after.status).toBe(410)
    })

    it('reports nothing to stop for a session that is not theirs', async () => {
      const res = await app.request(url('/api/test-sessions/missing'), { method: 'DELETE' })
      expect(res.status).toBe(404)
    })
  })

  describe('workflow deletion', () => {
    it('stops every member’s session, not just the caller’s', async () => {
      const { session } = (await (await start(app)).json()) as { session: { id: string } }
      // Someone else's session on the same workflow. Left running, it bills
      // on, answers 404 to its owner's DELETE, and holds their slot.
      await mockDb.reserveTestSession(
        {
          id: 'theirs',
          workflowId: 'wf-1',
          userId: 'someone-else',
          runtime: 'node',
          containerId: 'fake-theirs',
        },
        {
          cutoffs: testSessionCutoffs(LIMITS),
          projectId: TEST_PROJECT_ID,
          maxConcurrentPerUser: 5,
          maxConcurrentTotal: 10,
          maxPerWindowPerProject: 50,
          quotaWindowStart: '2000-01-01T00:00:00.000Z',
        },
      )

      const res = await app.request(url('/api/workflows/wf-1'), { method: 'DELETE' })
      expect(res.status).toBe(200)
      expect(runner.stopped).toContain(session.id)
      expect(runner.stopped).toContain('theirs')
    })
  })

  describe('an expired session', () => {
    it('is stopped on the next request rather than served', async () => {
      const { session } = (await (await start(app)).json()) as { session: { id: string } }

      // Zero-length windows: the limits a route would never resolve to, used
      // here to put the cut-offs behind a session started moments ago.
      const resolved = await resolveTestSession(
        { db: mockDb, runner, limits: EXPIRED_LIMITS },
        session.id,
        TEST_USER_ID,
        TEST_PROJECT_ID,
      )

      expect(resolved).toMatchObject({ ok: false, status: 410 })
      // The request is the earliest anything knows it expired, so it is also
      // where the worker gets stopped.
      expect(runner.stopped).toContain(session.id)
    })

    it('stays stopped for every later request', async () => {
      const { session } = (await (await start(app)).json()) as { session: { id: string } }
      await resolveTestSession(
        { db: mockDb, runner, limits: EXPIRED_LIMITS },
        session.id,
        TEST_USER_ID,
        TEST_PROJECT_ID,
      )

      const res = await app.request(url(`/api/test-sessions/${session.id}/trigger`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
      expect(res.status).toBe(410)
    })
  })

  describe('reapTestSessions', () => {
    it('stops everything past a cut-off and leaves the rest', async () => {
      const { session } = (await (await start(app)).json()) as { session: { id: string } }

      const stopped = await reapTestSessions({
        db: mockDb,
        runner,
        // Cut-offs in the future, so every running session is expired.
        limits: resolveTestSessionLimits({ idleMs: -1 }),
      })
      expect(stopped).toBe(0)

      const reaped = await reapTestSessions({ db: mockDb, runner, limits: EXPIRED_LIMITS })
      expect(reaped).toBe(1)
      expect(runner.stopped).toContain(session.id)
    })

    it('reaps only the named user when asked', async () => {
      await start(app)
      await mockDb.reserveTestSession(
        {
          id: 'theirs',
          workflowId: 'wf-1',
          userId: 'someone-else',
          runtime: 'node',
          containerId: 'fake-theirs',
        },
        {
          cutoffs: testSessionCutoffs(LIMITS),
          projectId: TEST_PROJECT_ID,
          maxConcurrentPerUser: 5,
          maxConcurrentTotal: 10,
          maxPerWindowPerProject: 50,
          quotaWindowStart: '2000-01-01T00:00:00.000Z',
        },
      )

      // A start reaps its own caller: sweeping everyone's can fill the batch
      // without reaching the session actually in this user's way.
      const reaped = await reapTestSessions(
        { db: mockDb, runner, limits: EXPIRED_LIMITS },
        { userId: TEST_USER_ID },
      )
      expect(reaped).toBe(1)
      expect(runner.stopped).not.toContain('theirs')
    })
  })
})

const LIMITS = resolveTestSessionLimits()
const FUTURE = {
  idle: '2099-01-01T00:00:00.000Z',
  started: '2099-01-01T00:00:00.000Z',
  starting: '2099-01-01T00:00:00.000Z',
}
// Minimum windows, so a session started microseconds ago is already past the
// hard lifetime once the clock is read.
const EXPIRED_LIMITS = { ...LIMITS, idleMs: 0, maxLifetimeMs: 0, startTimeoutMs: 0 }
