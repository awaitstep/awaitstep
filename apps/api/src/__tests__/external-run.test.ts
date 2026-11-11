import { beforeEach, describe, expect, it, vi } from 'vitest'
import { presetPermissions, type KeyPermissions } from '@awaitstep/ir'
import type * as ProviderResolver from '../lib/provider-resolver.js'
import { hashApiKey } from '../lib/api-key-hash.js'
import {
  createTestApp,
  mockDb,
  resetStore,
  sentNotifications,
  TEST_ORG_ID,
  TEST_PROJECT_ID,
  TEST_USER_ID,
  TEST_WORKSPACE_ID,
} from './helpers.js'

// POST /api/run/:workflowId (D-1): how other systems run a workflow or call a
// function, with an API key. The provider is real except for what would leave
// the machine: Cloudflare's trigger and the function's own HTTP answer.

const provider = vi.hoisted(() => ({
  triggered: [] as Array<{ params: unknown; account: string }>,
  triggerFails: false,
  calls: [] as Array<{ url: string; body: string; contentType: string | null }>,
  fail: false,
  reply: {
    status: 200,
    body: '{"city":"Paris"}' as string | Uint8Array | null,
    contentType: 'application/json',
    headers: {} as Record<string, string>,
  },
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
          if (property === 'trigger') {
            return (
              _id: string,
              params: unknown,
              config: { credentials: { accountId: string } },
            ) => {
              if (provider.triggerFails) {
                return Promise.reject(
                  Object.assign(new Error('Could not route to /client/v4/accounts/acct-a/x'), {
                    status: 404,
                  }),
                )
              }
              provider.triggered.push({ params, account: config.credentials.accountId })
              return Promise.resolve({ instanceId: 'inst-1' })
            }
          }
          if (property === 'callFunction') {
            return (request: { url: string; body: string | Uint8Array; contentType?: string }) =>
              callFunction(request, (async (url: string, init: RequestInit) => {
                if (provider.fail) throw new TypeError('fetch failed')
                const headers = init.headers as Record<string, string>
                provider.calls.push({
                  url,
                  body:
                    init.body instanceof Uint8Array
                      ? new TextDecoder().decode(init.body)
                      : String(init.body),
                  contentType: headers['content-type'] ?? null,
                })
                return new Response(provider.reply.body as BodyInit | null, {
                  status: provider.reply.status,
                  headers: {
                    'content-type': provider.reply.contentType,
                    ...provider.reply.headers,
                  },
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

const PROJECT_KEY = 'ask_external-run-project'
const OTHER_WS_KEY = 'ask_external-run-other-ws'
const READ_KEY = 'ask_external-run-read'
const ORG_KEY = 'ask_external-run-org'

async function seedKey(
  id: string,
  secret: string,
  level: 'project' | 'workspace' | 'organization',
  permissions: KeyPermissions,
) {
  const common = {
    id,
    organizationId: TEST_ORG_ID,
    createdBy: TEST_USER_ID,
    name: id,
    keyHash: await hashApiKey(secret),
    keyPrefix: secret.slice(0, 8),
    scopes: '["read","write","deploy"]',
    permissions: JSON.stringify(permissions),
  }
  if (level === 'organization') await mockDb.createApiKey({ ...common, level })
  else if (level === 'project') {
    await mockDb.createApiKey({ ...common, level, projectIds: [TEST_PROJECT_ID] })
  } else {
    await mockDb.createApiKey({
      ...common,
      level,
      projectId: TEST_PROJECT_ID,
      workspaceIds: ['ws-other'],
    })
  }
}

async function account(id: string, accountId: string) {
  await mockDb.createConnection({
    id,
    organizationId: TEST_ORG_ID,
    createdBy: TEST_USER_ID,
    provider: 'cloudflare',
    name: id,
    credentials: JSON.stringify({ accountId, apiToken: 'token' }),
  })
}

/** A successful deploy of `workflowId` on `connectionId`, made at `at`. */
async function deployed(
  workflowId: string,
  connectionId: string,
  at: string,
  serviceUrl?: string,
  status = 'success',
) {
  const row = await mockDb.createDeployment({
    id: `dep-${workflowId}-${connectionId}-${at}`,
    workflowId,
    versionId: 'v-1',
    versionNumber: 1,
    connectionId,
    serviceName: 'svc',
    serviceUrl,
    status,
  })
  // The fake stamps now; the account choice orders by when each deploy was made.
  row.createdAt = at
}

function run(
  app: ReturnType<typeof createTestApp>,
  path: string,
  init: { key?: string; body?: string; contentType?: string } = {},
) {
  const headers: Record<string, string> = {
    'Content-Type': init.contentType ?? 'application/json',
  }
  if (init.key) headers.Authorization = `Bearer ${init.key}`
  return app.request(`/api/run/${path}`, { method: 'POST', headers, body: init.body ?? '' })
}

describe('POST /api/run/:workflowId', () => {
  let app: ReturnType<typeof createTestApp>

  beforeEach(async () => {
    resetStore()
    provider.triggered = []
    provider.triggerFails = false
    provider.calls = []
    provider.fail = false
    provider.reply = {
      status: 200,
      body: '{"city":"Paris"}',
      contentType: 'application/json',
      headers: {},
    }
    app = createTestApp()
    await mockDb.createWorkflow({
      id: 'wf-1',
      projectId: TEST_PROJECT_ID,
      createdBy: TEST_USER_ID,
      name: 'Lead enrichment',
    })
    await mockDb.createWorkflow({
      id: 'fn-1',
      projectId: TEST_PROJECT_ID,
      createdBy: TEST_USER_ID,
      name: 'Normalise address',
      kind: 'script',
    })
    await mockDb.createWorkspace(
      { id: 'ws-other', projectId: TEST_PROJECT_ID, name: 'Other', slug: 'other' },
      [],
    )
    await account('conn-a', 'acct-a')
    await account('conn-b', 'acct-b')
    await seedKey('key-project', PROJECT_KEY, 'project', presetPermissions('project', 'full'))
    await seedKey('key-other-ws', OTHER_WS_KEY, 'workspace', presetPermissions('workspace', 'full'))
    await seedKey('key-read', READ_KEY, 'project', presetPermissions('project', 'read'))
    await seedKey('key-org', ORG_KEY, 'organization', presetPermissions('organization', 'full'))
  })

  describe('a workflow', () => {
    it('starts a run with the body as its params and answers 201', async () => {
      await deployed('wf-1', 'conn-a', '2026-11-01T00:00:00.000Z')
      const res = await run(app, 'wf-1', { key: PROJECT_KEY, body: '{"a":1}' })
      expect(res.status).toBe(201)
      const body = (await res.json()) as Record<string, unknown>
      expect(body).toEqual({ runId: expect.any(String), instanceId: 'inst-1', status: 'queued' })
      expect(provider.triggered).toEqual([{ params: { a: 1 }, account: 'acct-a' }])

      const { data } = await mockDb.listRunsByWorkflow('wf-1')
      expect(data).toHaveLength(1)
      expect(data[0]).toMatchObject({
        id: body.runId,
        connectionId: 'conn-a',
        trigger: 'api',
        params: '{"a":1}',
        status: 'queued',
      })
    })

    it('starts a run with no params when the body is empty', async () => {
      await deployed('wf-1', 'conn-a', '2026-11-01T00:00:00.000Z')
      const res = await run(app, 'wf-1', { key: PROJECT_KEY })
      expect(res.status).toBe(201)
      expect(provider.triggered).toEqual([{ params: undefined, account: 'acct-a' }])
      expect((await mockDb.listRunsByWorkflow('wf-1')).data[0]?.params).toBeNull()
    })

    it('answers 502 when the provider won’t start it, records nothing, and keeps its text back', async () => {
      await deployed('wf-1', 'conn-a', '2026-11-01T00:00:00.000Z')
      provider.triggerFails = true
      const res = await run(app, 'wf-1', { key: PROJECT_KEY, body: '{}' })
      expect(res.status).toBe(502)
      const { error } = (await res.json()) as { error: string }
      expect(error).toBe('Cloudflare refused to start the run (HTTP 404). Nothing was recorded.')
      expect(error).not.toContain('acct-a')
      expect((await mockDb.listRunsByWorkflow('wf-1')).data).toEqual([])
    })

    it('refuses a body that is not JSON, and records nothing', async () => {
      await deployed('wf-1', 'conn-a', '2026-11-01T00:00:00.000Z')
      const res = await run(app, 'wf-1', { key: PROJECT_KEY, body: 'not json' })
      expect(res.status).toBe(400)
      expect(provider.triggered).toEqual([])
      expect((await mockDb.listRunsByWorkflow('wf-1')).data).toEqual([])
    })

    it('refuses a body over 100 KB', async () => {
      await deployed('wf-1', 'conn-a', '2026-11-01T00:00:00.000Z')
      const body = JSON.stringify({ blob: 'x'.repeat(102_400) })
      const res = await run(app, 'wf-1', { key: PROJECT_KEY, body })
      expect(res.status).toBe(400)
      expect(((await res.json()) as { error: string }).error).toBe('The body must be under 100 KB')
      expect(provider.triggered).toEqual([])
    })
  })

  describe('which account', () => {
    it('uses the account of the newest live deploy when none is named', async () => {
      await deployed('wf-1', 'conn-a', '2026-11-01T00:00:00.000Z')
      await deployed('wf-1', 'conn-b', '2026-11-02T00:00:00.000Z')
      expect((await run(app, 'wf-1', { key: PROJECT_KEY, body: '{}' })).status).toBe(201)
      expect(provider.triggered.map((t) => t.account)).toEqual(['acct-b'])
    })

    it('skips a newer deploy that failed or was taken down', async () => {
      await deployed('wf-1', 'conn-a', '2026-11-01T00:00:00.000Z')
      await deployed('wf-1', 'conn-b', '2026-11-02T00:00:00.000Z', undefined, 'failed')
      await deployed('wf-1', 'conn-b', '2026-11-03T00:00:00.000Z', undefined, 'taken_down')
      expect((await run(app, 'wf-1', { key: PROJECT_KEY, body: '{}' })).status).toBe(201)
      expect(provider.triggered.map((t) => t.account)).toEqual(['acct-a'])
    })

    it('uses the named account with ?account=', async () => {
      await deployed('wf-1', 'conn-a', '2026-11-01T00:00:00.000Z')
      await deployed('wf-1', 'conn-b', '2026-11-02T00:00:00.000Z')
      const res = await run(app, 'wf-1?account=conn-a', { key: PROJECT_KEY, body: '{}' })
      expect(res.status).toBe(201)
      expect(provider.triggered.map((t) => t.account)).toEqual(['acct-a'])
      expect((await mockDb.listRunsByWorkflow('wf-1')).data[0]?.connectionId).toBe('conn-a')
    })

    it('answers 404 for a named account it isn’t live on, and records nothing', async () => {
      await deployed('wf-1', 'conn-a', '2026-11-01T00:00:00.000Z')
      const res = await run(app, 'wf-1?account=conn-b', { key: PROJECT_KEY, body: '{}' })
      expect(res.status).toBe(404)
      expect(((await res.json()) as { error: string }).error).toBe(
        'This workflow isn’t deployed with that connection',
      )
      expect(provider.triggered).toEqual([])
      expect((await mockDb.listRunsByWorkflow('wf-1')).data).toEqual([])
    })

    it('answers 404 when the workflow isn’t live anywhere', async () => {
      const res = await run(app, 'wf-1', { key: PROJECT_KEY, body: '{}' })
      expect(res.status).toBe(404)
      expect(((await res.json()) as { error: string }).error).toBe(
        'This workflow isn’t live on any account',
      )
    })
  })

  describe('a function', () => {
    beforeEach(async () => {
      await deployed('fn-1', 'conn-a', '2026-11-01T00:00:00.000Z', 'https://fn.acme.workers.dev')
    })

    it('answers with the function’s own status, type and body, and the run in a header', async () => {
      provider.reply = { status: 201, body: 'created', contentType: 'text/plain', headers: {} }
      const res = await run(app, 'fn-1', {
        key: PROJECT_KEY,
        body: 'address=x',
        contentType: 'application/x-www-form-urlencoded',
      })
      expect(res.status).toBe(201)
      expect(res.headers.get('content-type')).toBe('text/plain')
      expect(await res.text()).toBe('created')
      const runId = res.headers.get('X-AwaitStep-Run-Id')
      expect(runId).toBeTruthy()
      // The body went on as sent, with its type.
      expect(provider.calls).toEqual([
        {
          url: 'https://fn.acme.workers.dev',
          body: 'address=x',
          contentType: 'application/x-www-form-urlencoded',
        },
      ])
      const { data } = await mockDb.listRunsByWorkflow('fn-1')
      expect(data).toHaveLength(1)
      expect(data[0]).toMatchObject({
        id: runId,
        connectionId: 'conn-a',
        trigger: 'api',
        status: 'complete',
        responseStatus: 201,
        output: 'created',
      })
    })

    it('passes a 500 through, records the run errored and tells the watchers', async () => {
      provider.reply = {
        status: 500,
        body: '{"error":"boom"}',
        contentType: 'application/json',
        headers: {},
      }
      const res = await run(app, 'fn-1', { key: PROJECT_KEY, body: '{}' })
      expect(res.status).toBe(500)
      expect(await res.json()).toEqual({ error: 'boom' })
      const { data } = await mockDb.listRunsByWorkflow('fn-1')
      expect(data[0]).toMatchObject({ status: 'errored', responseStatus: 500, trigger: 'api' })
      expect(sentNotifications().some((n) => n.event === 'run.failed')).toBe(true)
    })

    it('answers 504 with the reason and the run when no answer comes', async () => {
      provider.fail = true
      const res = await run(app, 'fn-1', { key: PROJECT_KEY, body: '{}' })
      expect(res.status).toBe(504)
      const body = (await res.json()) as { error: string; runId: string }
      expect(body.error).toBe('Couldn’t reach the function.')
      expect(res.headers.get('X-AwaitStep-Run-Id')).toBe(body.runId)
      const { data } = await mockDb.listRunsByWorkflow('fn-1')
      expect(data[0]).toMatchObject({ id: body.runId, status: 'errored', responseStatus: null })
      expect(sentNotifications().some((n) => n.event === 'run.failed')).toBe(true)
    })

    it('runs a call again from the dashboard the way it was sent', async () => {
      const res = await run(app, 'fn-1', {
        key: PROJECT_KEY,
        body: 'address=x',
        contentType: 'application/x-www-form-urlencoded',
      })
      const runId = res.headers.get('X-AwaitStep-Run-Id')!
      const again = await app.request(
        `/api/workflows/fn-1/runs/${runId}/run-again?projectId=${TEST_PROJECT_ID}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ connectionId: 'conn-a' }),
        },
      )
      expect(again.status).toBe(200)
      expect(provider.calls[1]).toEqual({
        url: 'https://fn.acme.workers.dev',
        body: 'address=x',
        contentType: 'application/x-www-form-urlencoded',
      })
    })

    it('passes bytes through unchanged, both ways', async () => {
      const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0xff, 0xfe, 0x00, 0x01])
      provider.reply = { status: 200, body: png, contentType: 'image/png', headers: {} }
      const res = await app.request('/api/run/fn-1', {
        method: 'POST',
        headers: { Authorization: `Bearer ${PROJECT_KEY}`, 'Content-Type': 'image/png' },
        body: png,
      })
      expect(res.status).toBe(200)
      expect(res.headers.get('content-type')).toBe('image/png')
      expect(new Uint8Array(await res.arrayBuffer())).toEqual(png)
    })

    it.each([
      ['relative, into the API', '/api/workflows/wf-1/takedown'],
      ['absolute, elsewhere', 'https://example.com/next'],
    ])('never sends a redirect’s target as Location (%s)', async (_kind, target) => {
      // From the API's own origin a followed redirect would carry the caller's key.
      provider.reply = {
        status: 307,
        body: '',
        contentType: 'text/plain',
        headers: { location: target },
      }
      const res = await run(app, 'fn-1', { key: PROJECT_KEY, body: '{}' })
      expect(res.status).toBe(307)
      expect(res.headers.get('location')).toBeNull()
      expect(res.headers.get('X-AwaitStep-Function-Location')).toBe(target)
      expect(provider.calls).toHaveLength(1)
    })

    it('serves a function’s answer so it runs nothing on the dashboard’s origin', async () => {
      provider.reply = {
        status: 200,
        body: '<script>alert(1)</script>',
        contentType: 'text/html',
        headers: {},
      }
      const res = await run(app, 'fn-1', { key: PROJECT_KEY, body: '{}' })
      expect(res.headers.get('content-type')).toBe('text/html')
      expect(res.headers.get('content-security-policy')).toBe("default-src 'none'; sandbox")
      expect(res.headers.get('x-content-type-options')).toBe('nosniff')
    })

    it('answers a 204 with no body', async () => {
      provider.reply = { status: 204, body: null, contentType: 'text/plain', headers: {} }
      const res = await run(app, 'fn-1', { key: PROJECT_KEY, body: '{}' })
      expect(res.status).toBe(204)
      expect(await res.text()).toBe('')
      expect(res.headers.get('X-AwaitStep-Run-Id')).toBeTruthy()
    })

    it('says when the answer was cut at 100 KB', async () => {
      provider.reply = {
        status: 200,
        body: 'x'.repeat(100 * 1024 + 10),
        contentType: 'text/plain',
        headers: {},
      }
      const res = await run(app, 'fn-1', { key: PROJECT_KEY, body: '{}' })
      expect(res.headers.get('X-AwaitStep-Body-Truncated')).toBe('true')
      expect((await res.text()).length).toBe(100 * 1024)
    })

    it('calls the named account with ?account=', async () => {
      await deployed('fn-1', 'conn-b', '2026-11-02T00:00:00.000Z', 'https://fn-b.acme.workers.dev')
      const res = await run(app, 'fn-1?account=conn-a', { key: PROJECT_KEY, body: '{}' })
      expect(res.status).toBe(200)
      expect(provider.calls.map((call) => call.url)).toEqual(['https://fn.acme.workers.dev'])
      // Without it, the newest live deploy's account.
      await run(app, 'fn-1', { key: PROJECT_KEY, body: '{}' })
      expect(provider.calls.at(-1)?.url).toBe('https://fn-b.acme.workers.dev')
    })

    it('refuses a deploy whose only URL is a route, and records nothing', async () => {
      await deployed('fn-1', 'conn-b', '2026-11-02T00:00:00.000Z', 'https://api.acme.com')
      const res = await run(app, 'fn-1', { key: PROJECT_KEY, body: '{}' })
      expect(res.status).toBe(400)
      expect(provider.calls).toEqual([])
      expect((await mockDb.listRunsByWorkflow('fn-1')).data).toEqual([])
    })

    it('answers 404 for an account it isn’t live on, and calls nothing', async () => {
      const res = await run(app, 'fn-1?account=conn-b', { key: PROJECT_KEY, body: '{}' })
      expect(res.status).toBe(404)
      expect(provider.calls).toEqual([])
      expect((await mockDb.listRunsByWorkflow('fn-1')).data).toEqual([])
    })
  })

  describe('who may call it', () => {
    beforeEach(async () => {
      await deployed('wf-1', 'conn-a', '2026-11-01T00:00:00.000Z')
    })

    it('refuses a session with 401', async () => {
      const res = await run(app, 'wf-1', { body: '{}' })
      expect(res.status).toBe(401)
      expect(await res.json()).toEqual({ error: 'Use an API key' })
    })

    it('refuses an organization key', async () => {
      const res = await run(app, 'wf-1', { key: ORG_KEY, body: '{}' })
      expect(res.status).toBe(403)
      expect(((await res.json()) as { error: string }).error).toBe(
        'An organization-level API key cannot access project resources',
      )
    })

    it('refuses a key without workflows:run', async () => {
      const res = await run(app, 'wf-1', { key: READ_KEY, body: '{}' })
      expect(res.status).toBe(403)
      expect(((await res.json()) as { error: string }).error).toBe(
        'API key lacks permission: workflows:run',
      )
      expect(provider.triggered).toEqual([])
    })

    it('does not find a workflow outside a workspace key’s workspaces', async () => {
      // wf-1 sits in the default workspace; the key reaches ws-other only.
      expect((await mockDb.getWorkflowForUser(TEST_USER_ID, 'wf-1'))?.workflow.workspaceId).toBe(
        TEST_WORKSPACE_ID,
      )
      const res = await run(app, 'wf-1', { key: OTHER_WS_KEY, body: '{}' })
      expect(res.status).toBe(404)
      expect(provider.triggered).toEqual([])
    })

    it('does not find a workflow that doesn’t exist', async () => {
      expect((await run(app, 'wf-missing', { key: PROJECT_KEY, body: '{}' })).status).toBe(404)
    })
  })
})
