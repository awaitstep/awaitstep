import { describe, it, expect, beforeEach } from 'vitest'
import {
  createTestApp,
  resetStore,
  patchTestSession,
  mockDb,
  FakeTestSessionRunner,
  TEST_USER_ID,
  TEST_PROJECT_ID,
  loseTestSessionEdit,
} from './helpers.js'
import { TestSessionRefusal } from '@awaitstep/codegen'
import { graphHash } from '../lib/graph-hash.js'
import { sessionManifest } from '../lib/test-session-manifest.js'

const stepIR = {
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

/** The same graph with a wait in it: what the send-event route asks for. */
const waitIR = {
  ...stepIR,
  nodes: [
    ...stepIR.nodes,
    {
      id: 'wait-1',
      type: 'wait_for_event',
      name: 'Approval',
      position: { x: 0, y: 100 },
      version: '1.0.0',
      provider: 'cloudflare',
      data: { eventType: 'approval', timeout: '1 hour' },
    },
  ],
}

function url(path: string) {
  return `${path}${path.includes('?') ? '&' : '?'}projectId=${TEST_PROJECT_ID}`
}

function post(app: ReturnType<typeof createTestApp>, path: string, body?: unknown) {
  return app.request(url(path), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    ...(body !== undefined && { body: JSON.stringify(body) }),
  })
}

async function startSession(app: ReturnType<typeof createTestApp>, ir: unknown = waitIR) {
  await mockDb.createWorkflow({
    id: 'wf-1',
    projectId: TEST_PROJECT_ID,
    createdBy: TEST_USER_ID,
    name: 'Test',
  })
  const saved = await post(app, '/api/workflows/wf-1/versions', { ir: stepIR })
  expect(saved.status).toBe(201)
  const res = await post(app, '/api/workflows/wf-1/test-sessions')
  const { session } = (await res.json()) as {
    session: { id: string; capabilities: { steps: boolean; terminate: boolean } }
  }
  // The session runs a version with the graph under test; the route reads its IR.
  const version = await mockDb.createVersion({
    id: 'v-under-test',
    workflowId: 'wf-1',
    ir: JSON.stringify(ir),
  })
  // Built from that graph, as its manifest records.
  patchTestSession(session.id, {
    versionId: version.id,
    files: JSON.stringify(sessionManifest([], graphHash(version.ir))),
  })
  return session
}

describe('test session instance routes', () => {
  let runner: FakeTestSessionRunner
  let app: ReturnType<typeof createTestApp>

  beforeEach(() => {
    resetStore()
    runner = new FakeTestSessionRunner()
    app = createTestApp({ testSessionRunner: runner })
  })

  it('takes one trigger a second per user, and the next once the second is up', async () => {
    const session = await startSession(app)
    const trigger = () => post(app, `/api/test-sessions/${session.id}/trigger`, { payload: {} })
    // A refused trigger (here, for a session that isn't theirs) spends nothing.
    expect((await post(app, '/api/test-sessions/nope/trigger', { payload: {} })).status).toBe(404)
    expect((await trigger()).status).toBe(200)
    const refused = await trigger()
    expect(refused.status).toBe(429)
    expect(await refused.json()).toEqual({ error: 'Too many requests. Try again within a second.' })
    await new Promise((resolve) => setTimeout(resolve, 1_100))
    expect((await trigger()).status).toBe(200)
  })

  it('cuts a session off once its owner can no longer edit there, and still lets them stop it', async () => {
    const session = await startSession(app)
    loseTestSessionEdit(TEST_USER_ID)
    const base = `/api/test-sessions/${session.id}`
    expect((await post(app, `${base}/trigger`, { payload: {} })).status).toBe(404)
    expect(
      (await post(app, `${base}/instances/i-1/events`, { type: 'approved', payload: {} })).status,
    ).toBe(404)
    expect((await app.request(url(`${base}/stream`))).status).toBe(404)
    const stopped = await app.request(url(base), { method: 'DELETE' })
    expect(stopped.status).toBe(200)
    expect(await stopped.json()).toEqual({ status: 'stopped' })
  })

  it('refuses a stream for an instance id the API does not take', async () => {
    const session = await startSession(app)
    const res = await app.request(
      url(`/api/test-sessions/${session.id}/stream?instanceId=${encodeURIComponent('a/b')}`),
    )
    expect(res.status).toBe(422)
  })

  describe('POST /test-sessions/:id/instances/:instanceId/events', () => {
    it('sends the event to an instance the session started', async () => {
      const session = await startSession(app)
      const res = await post(app, `/api/test-sessions/${session.id}/instances/inst-1/events`, {
        type: 'approval',
        payload: { ok: true },
      })
      expect(res.status).toBe(200)
      expect(await res.json()).toEqual({ status: 200, body: { ok: true } })
      expect(runner.events).toEqual([
        { sessionId: session.id, instanceId: 'inst-1', type: 'approval', payload: { ok: true } },
      ])
    })

    it('answers 404 for an instance the session did not start', async () => {
      const session = await startSession(app)
      const res = await post(app, `/api/test-sessions/${session.id}/instances/made-up/events`, {
        type: 'approval',
      })
      expect(res.status).toBe(404)
      expect(runner.events).toHaveLength(0)
    })

    it.each([
      ['an event type a wait cannot take', 'inst-1', { type: 'has space' }],
      ['no event type', 'inst-1', {}],
      ['an instance id AwaitStep does not take', '-bad', { type: 'approval' }],
    ])('refuses %s before asking the runner', async (_label, instanceId, body) => {
      const session = await startSession(app)
      const res = await post(
        app,
        `/api/test-sessions/${session.id}/instances/${instanceId}/events`,
        body,
      )
      expect(res.status).toBe(422)
      expect(runner.events).toHaveLength(0)
    })

    it('refuses a workflow with no Wait for Event step, which a self-hosted worker would run instead', async () => {
      const session = await startSession(app, stepIR)
      const res = await post(app, `/api/test-sessions/${session.id}/instances/inst-1/events`, {
        type: 'approval',
      })
      expect(res.status).toBe(400)
      expect(runner.events).toHaveLength(0)
    })

    it('refuses a session built before a wait was saved onto its version, which its worker would run', async () => {
      const session = await startSession(app, stepIR)
      // The wait is saved onto the same (undeployed) version; the session still runs the old build.
      patchTestSession(session.id, { versionId: 'v-with-wait' })
      await mockDb.createVersion({
        id: 'v-with-wait',
        workflowId: 'wf-1',
        ir: JSON.stringify(waitIR),
      })
      const res = await post(app, `/api/test-sessions/${session.id}/instances/inst-1/events`, {
        type: 'approval',
      })
      expect(res.status).toBe(409)
      expect(runner.events).toHaveLength(0)
    })

    it('is rate limited like other writes', async () => {
      const session = await startSession(app)
      const statuses: number[] = []
      for (let i = 0; i < 31; i++) {
        const res = await post(app, `/api/test-sessions/${session.id}/instances/inst-1/events`, {
          type: 'approval',
        })
        statuses.push(res.status)
      }
      expect(statuses.slice(0, 30).every((status) => status === 200)).toBe(true)
      expect(statuses[30]).toBe(429)
      expect(runner.events).toHaveLength(30)
    })

    it('answers 404 for another user’s session', async () => {
      const session = await startSession(app)
      patchTestSession(session.id, { userId: 'someone-else' })
      const res = await post(app, `/api/test-sessions/${session.id}/instances/inst-1/events`, {
        type: 'approval',
      })
      expect(res.status).toBe(404)
      expect(runner.events).toHaveLength(0)
    })

    it('ends the session when the runner says it no longer has it', async () => {
      const session = await startSession(app)
      runner.sendEvent = async () => {
        throw new TestSessionRefusal('This test session has ended.', 410)
      }
      const res = await post(app, `/api/test-sessions/${session.id}/instances/inst-1/events`, {
        type: 'approval',
      })
      expect(res.status).toBe(410)
      expect(runner.stopped).toContain(session.id)
    })
  })

  describe('POST /test-sessions/:id/instances/:instanceId/terminate', () => {
    it('ends that instance only and keeps the session', async () => {
      runner.withTerminate()
      const session = await startSession(app)
      expect(session.capabilities).toEqual({ steps: false, terminate: true })

      const res = await post(app, `/api/test-sessions/${session.id}/instances/inst-1/terminate`)
      expect(res.status).toBe(200)
      expect(runner.terminated).toEqual(['inst-1'])
      expect(runner.stopped).not.toContain(session.id)

      const trigger = await post(app, `/api/test-sessions/${session.id}/trigger`, { payload: {} })
      expect(trigger.status).toBe(200)
    })

    it('answers 404 for an instance the session did not start', async () => {
      runner.withTerminate()
      const session = await startSession(app)
      const res = await post(app, `/api/test-sessions/${session.id}/instances/theirs/terminate`)
      expect(res.status).toBe(404)
      expect(runner.terminated).toHaveLength(0)
    })

    it('says so for a runner that cannot end one instance', async () => {
      const session = await startSession(app)
      expect(session.capabilities.terminate).toBe(false)
      const res = await post(app, `/api/test-sessions/${session.id}/instances/inst-1/terminate`)
      expect(res.status).toBe(501)
    })
  })
})
