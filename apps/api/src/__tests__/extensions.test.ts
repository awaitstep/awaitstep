import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { presetPermissions } from '@awaitstep/ir'
import type { AppExtension } from '../types.js'
import { checkExtensions } from '../lib/extensions.js'
import { KEYS_NOT_ALLOWED } from '../middleware/key-permissions.js'
import { hashApiKey } from '../lib/api-key-hash.js'
import { requireOrganization, requireOrgCan } from '../index.js'
import {
  createTestApp,
  mockAuth,
  mockDb,
  resetStore,
  TEST_ORG_ID,
  TEST_ORG_SLUG,
  TEST_PROJECT_ID,
  TEST_USER_ID,
} from './helpers.js'

const APP_ORIGIN = 'https://app.example.com'

/** An extension whose routes answer with who the core middleware said is calling. */
function echoExtension(id = 'echo'): AppExtension & { calls: number } {
  const extension = {
    id,
    calls: 0,
    routes(router: Parameters<NonNullable<AppExtension['routes']>>[0]) {
      router.get('/whoami', (c) => {
        extension.calls++
        return c.json({ userId: c.get('userId'), requestId: c.get('requestId') })
      })
      router.post('/note', (c) => {
        extension.calls++
        return c.json({ ok: true })
      })
    },
  }
  return extension
}

describe('app extensions', () => {
  beforeEach(() => resetStore())
  afterEach(() => vi.restoreAllMocks())

  it('lists no features when the entry passes no extensions, without a session', async () => {
    vi.spyOn(mockAuth.api, 'getSession').mockResolvedValue(null as never)
    const res = await createTestApp().request('/api/instance')
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ features: [] })
  })

  it('lists each plugged-in extension’s id as a feature', async () => {
    const app = createTestApp({ extensions: [echoExtension('one'), { id: 'two' }] })
    const res = await app.request('/api/instance')
    expect(await res.json()).toEqual({ features: ['one', 'two'] })
  })

  it('mounts an extension’s routes under /api/ext/<id>, after the core auth', async () => {
    const app = createTestApp({ extensions: [echoExtension()] })
    const res = await app.request('/api/ext/echo/whoami')
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.userId).toBe(TEST_USER_ID)
    expect(body.requestId).toBeTruthy()
  })

  it('refuses a signed-out caller before the extension runs', async () => {
    vi.spyOn(mockAuth.api, 'getSession').mockResolvedValue(null as never)
    const extension = echoExtension()
    const res = await createTestApp({ extensions: [extension] }).request('/api/ext/echo/whoami')
    expect(res.status).toBe(401)
    expect(extension.calls).toBe(0)
  })

  it('answers 404 for an extension that is not plugged in', async () => {
    const app = createTestApp({ extensions: [echoExtension()] })
    expect((await app.request('/api/ext/missing/whoami')).status).toBe(404)
    expect((await app.request('/api/ext/echo/missing')).status).toBe(404)
  })

  it('refuses an API key on extension routes', async () => {
    const raw = 'ask_test-ext-key'
    await mockDb.createApiKey({
      id: 'key-ext',
      level: 'project',
      organizationId: TEST_ORG_ID,
      projectIds: [TEST_PROJECT_ID],
      createdBy: TEST_USER_ID,
      name: 'project key',
      keyHash: await hashApiKey(raw),
      keyPrefix: raw.slice(0, 8),
      scopes: '["read","write","deploy"]',
      permissions: JSON.stringify(presetPermissions('project', 'full')),
      expiresAt: null,
    })
    const extension = echoExtension()
    const res = await createTestApp({ extensions: [extension] }).request('/api/ext/echo/whoami', {
      headers: { Authorization: `Bearer ${raw}` },
    })
    expect(res.status).toBe(403)
    expect((await res.json()).error).toBe(KEYS_NOT_ALLOWED)
    expect(extension.calls).toBe(0)
  })

  it('refuses a cross-origin cookie write to an extension route', async () => {
    const extension = echoExtension()
    const app = createTestApp({ corsOrigin: APP_ORIGIN, extensions: [extension] })
    const write = (origin: string) =>
      app.request('/api/ext/echo/note', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: 'session=x', Origin: origin },
        body: '{}',
      })
    expect((await write('https://evil.example.com')).status).toBe(403)
    expect(extension.calls).toBe(0)
    expect((await write(APP_ORIGIN)).status).toBe(200)
    expect(extension.calls).toBe(1)
  })

  it('counts extension requests against the core rate limit', async () => {
    const extension = echoExtension()
    const app = createTestApp({ extensions: [extension] })
    for (let i = 0; i < 200; i++) await app.request('/api/ext/echo/whoami')
    const res = await app.request('/api/ext/echo/whoami')
    expect(res.status).toBe(429)
    expect(extension.calls).toBe(200)
  })

  it('lets an extension route name its scope with the core’s exported gates', async () => {
    const app = createTestApp({
      extensions: [
        {
          id: 'scoped',
          routes(router) {
            router.use('*', requireOrganization)
            router.post('/settings', requireOrgCan('manageSettings'), (c) =>
              c.json({ organizationId: c.get('organizationId'), orgRole: c.get('orgRole') }),
            )
          },
        },
      ],
    })
    const post = (query: string) =>
      app.request(`/api/ext/scoped/settings${query}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      })
    const res = await post(`?org=${TEST_ORG_SLUG}`)
    expect(res.status).toBe(200)
    expect((await res.json()).organizationId).toBe(TEST_ORG_ID)
    expect((await post('')).status).toBe(400)
    expect((await post('?org=someone-else')).status).toBe(404)
  })

  it('refuses at startup an id that is not a URL segment, or one used twice', () => {
    for (const id of ['', 'Upper', 'a/b', '-lead', 'trail-', 'a_b', 'x'.repeat(65)]) {
      expect(() => checkExtensions([{ id }])).toThrow(/not valid/)
    }
    expect(() => checkExtensions([{ id: 'a' }, { id: 'a' }])).toThrow(/twice/)
    expect(() =>
      checkExtensions([{ id: 'a' }, { id: 'b-2' }, { id: 'x'.repeat(64) }]),
    ).not.toThrow()
    expect(() => createTestApp({ extensions: [{ id: 'Bad' }] })).toThrow(/not valid/)
  })
})
