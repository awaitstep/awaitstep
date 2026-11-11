import { beforeEach, describe, expect, it, vi } from 'vitest'
import type * as ProviderResolver from '../lib/provider-resolver.js'
import {
  createTestApp,
  mockDb,
  resetStore,
  sentNotifications,
  TEST_ORG_ID,
  TEST_PROJECT_ID,
  TEST_USER_ID,
} from './helpers.js'

// Calling a deployed function (24i). The provider is real except for the
// outbound HTTP call, which these tests stand in for.

const fetched = vi.hoisted(() => ({
  calls: [] as Array<{ url: string; body: string }>,
  fail: false,
  reply: { status: 200, body: '{"city":"Paris"}' },
}))

vi.mock('../lib/provider-resolver.js', async (importOriginal) => {
  const actual = await importOriginal<typeof ProviderResolver>()
  const { callFunction } = await import('@awaitstep/provider-cloudflare')
  return {
    ...actual,
    resolveProvider: (...args: Parameters<typeof actual.resolveProvider>) => {
      const adapter = actual.resolveProvider(...args)
      return new Proxy(adapter, {
        get(target, property, receiver) {
          if (property === 'callFunction') {
            // The real URL check, with the network answered here.
            return (request: { url: string; body: string }) =>
              callFunction(request, (async (url: string, init: RequestInit) => {
                if (fetched.fail) throw new TypeError('fetch failed')
                fetched.calls.push({ url, body: String(init.body) })
                return new Response(fetched.reply.body, {
                  status: fetched.reply.status,
                  headers: { 'content-type': 'application/json' },
                })
              }) as unknown as typeof fetch)
          }
          const value = Reflect.get(target, property, receiver)
          return typeof value === 'function' ? value.bind(target) : value
        },
      })
    },
  }
})

const url = (id: string) => `/api/workflows/${id}/call?projectId=${TEST_PROJECT_ID}`

function call(app: ReturnType<typeof createTestApp>, id: string, body: unknown) {
  return app.request(url(id), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

async function deployed(id: string, serviceUrl: string | null, status = 'success') {
  await mockDb.createDeployment({
    id: `dep-${id}-${status}`,
    workflowId: id,
    versionId: 'v-1',
    versionNumber: 1,
    connectionId: 'conn-1',
    serviceName: 'svc',
    serviceUrl: serviceUrl ?? undefined,
    status,
  })
}

describe('POST /workflows/:id/call', () => {
  let app: ReturnType<typeof createTestApp>

  beforeEach(async () => {
    resetStore()
    fetched.calls = []
    fetched.fail = false
    fetched.reply = { status: 200, body: '{"city":"Paris"}' }
    app = createTestApp()
    await mockDb.createWorkflow({
      id: 'fn-1',
      projectId: TEST_PROJECT_ID,
      createdBy: TEST_USER_ID,
      name: 'Normalise address',
      kind: 'script',
    })
    await mockDb.createWorkflow({
      id: 'wf-1',
      projectId: TEST_PROJECT_ID,
      createdBy: TEST_USER_ID,
      name: 'Lead enrichment',
    })
    await mockDb.createConnection({
      id: 'conn-1',
      organizationId: TEST_ORG_ID,
      createdBy: TEST_USER_ID,
      provider: 'cloudflare',
      name: 'Production',
      credentials: JSON.stringify({ accountId: 'acct', apiToken: 'token' }),
    })
  })

  it('POSTs the body to the function’s live URL and answers status, time and body', async () => {
    await deployed('fn-1', 'https://fn.acme.workers.dev')
    const res = await call(app, 'fn-1', { connectionId: 'conn-1', body: '{"address":"x"}' })
    expect(res.status).toBe(200)
    const answer = await res.json()
    expect(answer).toMatchObject({
      status: 200,
      contentType: 'application/json',
      body: '{"city":"Paris"}',
      truncated: false,
    })
    expect(typeof answer.durationMs).toBe('number')
    expect(answer.ok).toBe(true)
    // The dialog reads text: the raw bytes and Location are /api/run's passthrough only.
    expect(answer).not.toHaveProperty('bytes')
    expect(answer).not.toHaveProperty('location')
    expect(fetched.calls).toEqual([{ url: 'https://fn.acme.workers.dev', body: '{"address":"x"}' }])
  })

  it('records the call as a run of the function, with what was sent and what came back', async () => {
    await deployed('fn-1', 'https://fn.acme.workers.dev')
    const answer = await (
      await call(app, 'fn-1', { connectionId: 'conn-1', body: '{"address":"x"}' })
    ).json()
    const { data } = await mockDb.listRunsByWorkflow('fn-1')
    expect(data).toHaveLength(1)
    expect(answer.runId).toBe(data[0]!.id)
    expect(data[0]).toMatchObject({
      workflowId: 'fn-1',
      connectionId: 'conn-1',
      versionId: 'v-1',
      versionNumber: 1,
      status: 'complete',
      trigger: 'dashboard',
      params: '{"address":"x"}',
      output: '{"city":"Paris"}',
      responseStatus: 200,
      error: null,
    })
    expect(data[0]!.instanceId).toMatch(/^call_/)
    expect(typeof data[0]!.durationMs).toBe('number')
    expect(sentNotifications()).toEqual([])
  })

  it('records an answer that isn’t 2xx as failed and tells the watchers', async () => {
    await deployed('fn-1', 'https://fn.acme.workers.dev')
    fetched.reply = { status: 500, body: '{"message":"boom"}' }
    const res = await call(app, 'fn-1', { connectionId: 'conn-1', body: '{}' })
    expect(res.status).toBe(200)
    const [run] = (await mockDb.listRunsByWorkflow('fn-1')).data
    expect(run).toMatchObject({
      status: 'errored',
      responseStatus: 500,
      output: '{"message":"boom"}',
    })
    expect(JSON.parse(run!.error!)).toMatchObject({ name: 'HttpStatus' })
    expect(JSON.parse(run!.error!).message).toMatch(/^Answered 500/)
    expect(sentNotifications().map((n) => n.event)).toEqual(['run.failed'])
    // Told as a failed call, not a run.
    expect(sentNotifications()[0]!.meta).toMatchObject({
      workflow: 'Normalise address',
      call: true,
    })
  })

  it('keeps a body that isn’t JSON as a string payload', async () => {
    await deployed('fn-1', 'https://fn.acme.workers.dev')
    await call(app, 'fn-1', { connectionId: 'conn-1', body: 'plain words' })
    expect((await mockDb.listRunsByWorkflow('fn-1')).data[0]!.params).toBe('"plain words"')
  })

  it('records nothing for a call it refused', async () => {
    await deployed('fn-1', null)
    await call(app, 'fn-1', { connectionId: 'conn-1', body: '{}' })
    expect((await mockDb.listRunsByWorkflow('fn-1')).data).toEqual([])
  })

  it('calls again with the same body on the same account, as a new run', async () => {
    await deployed('fn-1', 'https://fn.acme.workers.dev')
    const first = await (
      await call(app, 'fn-1', { connectionId: 'conn-1', body: 'plain words' })
    ).json()
    const again = await app.request(
      `/api/workflows/fn-1/runs/${first.runId}/run-again?projectId=${TEST_PROJECT_ID}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ connectionId: 'conn-1' }),
      },
    )
    expect(again.status).toBe(200)
    const answer = await again.json()
    expect(answer.runId).not.toBe(first.runId)
    expect(fetched.calls.map((c) => c.body)).toEqual(['plain words', 'plain words'])
    expect((await mockDb.listRunsByWorkflow('fn-1')).data).toHaveLength(2)
  })

  it('refuses a URL a user set (a route or custom domain), without calling it', async () => {
    await deployed('fn-1', 'https://api.example.com')
    const res = await call(app, 'fn-1', { connectionId: 'conn-1', body: '{}' })
    expect(res.status).toBe(400)
    expect((await res.json()).error).toBe('Only a workers.dev URL can be called from here.')
    expect(fetched.calls).toEqual([])
  })

  it('refuses a workflow, and an account the function isn’t live on', async () => {
    await deployed('wf-1', 'https://wf.acme.workers.dev')
    const wf = await call(app, 'wf-1', { connectionId: 'conn-1', body: '{}' })
    expect(wf.status).toBe(400)
    expect((await wf.json()).error).toBe(
      'Only a function can be called. Trigger a workflow instead.',
    )

    // Its only deploy there failed: not live.
    await deployed('fn-1', 'https://fn.acme.workers.dev', 'failed')
    const notLive = await call(app, 'fn-1', { connectionId: 'conn-1', body: '{}' })
    expect(notLive.status).toBe(404)
    expect((await notLive.json()).error).toBe('This function isn’t live on that account')
    expect(fetched.calls).toEqual([])
  })

  it('refuses a body over 100 KB as invalid', async () => {
    await deployed('fn-1', 'https://fn.acme.workers.dev')
    const res = await call(app, 'fn-1', { connectionId: 'conn-1', body: 'x'.repeat(102_401) })
    expect(res.status).toBe(422)
    expect(fetched.calls).toEqual([])
  })

  it('refuses a deployment with no URL to call', async () => {
    await deployed('fn-1', null)
    const res = await call(app, 'fn-1', { connectionId: 'conn-1', body: '{}' })
    expect(res.status).toBe(400)
    expect((await res.json()).error).toBe('This deployment has no URL to call')
    expect(fetched.calls).toEqual([])
  })

  it('answers a call that got no answer with its reason, not a 5xx', async () => {
    await deployed('fn-1', 'https://fn.acme.workers.dev')
    fetched.fail = true
    const res = await call(app, 'fn-1', { connectionId: 'conn-1', body: '{}' })
    expect(res.status).toBe(200)
    const answer = await res.json()
    expect(answer).toMatchObject({ ok: false, reason: 'Couldn’t reach the function.' })
    // Recorded as failed, with why, and the watchers are told.
    const [run] = (await mockDb.listRunsByWorkflow('fn-1')).data
    expect(answer.runId).toBe(run!.id)
    expect(run).toMatchObject({ status: 'errored', responseStatus: null })
    expect(JSON.parse(run!.error!)).toEqual({
      name: 'CallFailed',
      message: 'Couldn’t reach the function.',
    })
    expect(sentNotifications().map((n) => n.event)).toEqual(['run.failed'])
  })

  it('is held to the per-user write limit, as a trigger is', async () => {
    await deployed('fn-1', 'https://fn.acme.workers.dev')
    const statuses: number[] = []
    for (let i = 0; i < 31; i++) {
      statuses.push((await call(app, 'fn-1', { connectionId: 'conn-1', body: '{}' })).status)
    }
    expect(statuses.slice(0, 30).every((s) => s === 200)).toBe(true)
    expect(statuses[30]).toBe(429)
  })
})
