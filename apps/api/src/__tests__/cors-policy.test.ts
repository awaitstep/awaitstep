import { describe, it, expect, beforeEach } from 'vitest'
import { Hono } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { corsPolicy } from '../middleware/cors-policy.js'
import type { AppEnv } from '../types.js'
import { hashApiKey } from '../lib/api-key-hash.js'
import {
  createTestApp,
  mockDb,
  resetStore,
  TEST_ORG_ID,
  TEST_PROJECT_ID,
  TEST_USER_ID,
} from './helpers.js'

const APP = 'https://app.example.com'
const OTHER = 'https://evil.example.com'
const KEY = 'as_corspolicytestkey000000000000'

async function seedKey() {
  await mockDb.createApiKey({
    id: 'key-cors',
    level: 'project',
    organizationId: TEST_ORG_ID,
    projectIds: [TEST_PROJECT_ID],
    createdBy: TEST_USER_ID,
    name: 'browser key',
    keyHash: await hashApiKey(KEY),
    keyPrefix: KEY.slice(0, 8),
    scopes: '[]',
    permissions: JSON.stringify({ workflows: ['read'] }),
    expiresAt: null,
  })
}

describe('CORS policy', () => {
  let app: ReturnType<typeof createTestApp>

  beforeEach(() => {
    resetStore()
    app = createTestApp({ corsOrigin: APP })
  })

  const preflight = (path: string, origin: string, requestHeaders: string) =>
    app.request(path, {
      method: 'OPTIONS',
      headers: {
        Origin: origin,
        'Access-Control-Request-Method': 'POST',
        'Access-Control-Request-Headers': requestHeaders,
      },
    })

  it('answers the dashboard’s preflight with its origin and credentials', async () => {
    const res = await preflight('/api/workflows', APP, 'content-type')
    expect(res.status).toBe(204)
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe(APP)
    expect(res.headers.get('Access-Control-Allow-Credentials')).toBe('true')
  })

  it('answers another origin’s preflight with * and no credentials', async () => {
    const res = await preflight('/api/workflows', OTHER, 'authorization')
    expect(res.status).toBe(204)
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*')
    expect(res.headers.get('Access-Control-Allow-Headers')).toContain('Authorization')
    expect(res.headers.get('Access-Control-Allow-Credentials')).toBeNull()
    expect(res.headers.get('Vary')).toContain('Origin')
  })

  it('gives another origin nothing for sign-in', async () => {
    const res = await preflight('/api/auth/sign-in/email', OTHER, 'content-type')
    expect(res.headers.get('Access-Control-Allow-Origin')).toBeNull()
  })

  it('keeps images unreadable from another origin, even with a Bearer header', async () => {
    // Images answer without a key, so any Bearer header would have opened them.
    const res = await app.request('/api/images/whatever', {
      headers: { Origin: OTHER, Authorization: 'Bearer junk' },
    })
    expect(res.headers.get('Access-Control-Allow-Origin')).toBeNull()
    const pre = await preflight('/api/images/whatever', OTHER, 'authorization')
    expect(pre.headers.get('Access-Control-Allow-Origin')).toBeNull()
  })

  it('lets another origin read an API-key answer, with the request id', async () => {
    await seedKey()
    const res = await app.request(`/api/workflows?projectId=${TEST_PROJECT_ID}`, {
      headers: { Origin: OTHER, Authorization: `Bearer ${KEY}` },
    })
    expect(res.status).toBe(200)
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*')
    expect(res.headers.get('Access-Control-Allow-Credentials')).toBeNull()
    expect(res.headers.get('Access-Control-Expose-Headers')).toContain('X-Request-Id')
    // A page calling POST /api/run/:id can read which run it was, and its instance.
    expect(res.headers.get('Access-Control-Expose-Headers')).toContain('X-AwaitStep-Run-Id')
    expect(res.headers.get('Access-Control-Expose-Headers')).toContain('X-AwaitStep-Instance-Id')
  })

  it('still keeps a key out of a session-only route from another origin', async () => {
    await seedKey()
    const res = await app.request('/api/scope', {
      headers: { Origin: OTHER, Authorization: `Bearer ${KEY}` },
    })
    expect(res.status).toBe(403)
  })

  it('gives a cookie request from another origin no CORS headers', async () => {
    const res = await app.request(`/api/workflows?projectId=${TEST_PROJECT_ID}`, {
      headers: { Origin: OTHER, Cookie: 'session=whatever' },
    })
    expect(res.headers.get('Access-Control-Allow-Origin')).toBeNull()
    expect(res.headers.get('Vary')).toContain('Origin')
  })

  it('answers a dashboard request with its origin and credentials, varying by origin', async () => {
    const res = await app.request(`/api/workflows?projectId=${TEST_PROJECT_ID}`, {
      headers: { Origin: APP, Cookie: 'session=whatever' },
    })
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe(APP)
    expect(res.headers.get('Access-Control-Allow-Credentials')).toBe('true')
    expect(res.headers.get('Vary')).toContain('Origin')
  })

  it('varies by Origin when a handler answers with its own Response', async () => {
    // better-auth and onError build raw Responses; a header set before the
    // handler ran was dropped from them.
    app.post('/api/auth/__raw', () => new Response('ok', { headers: { Vary: 'Accept-Encoding' } }))
    const cases: Record<string, string>[] = [{}, { Origin: OTHER }]
    for (const headers of cases) {
      const res = await app.request('/api/auth/__raw', { method: 'POST', headers })
      expect(res.headers.get('Vary')).toContain('Origin')
    }
  })

  it('keeps a raw Response’s own Vary on a key request from another origin', async () => {
    // On the bare middleware: through the app, auth answers before a test route.
    const bare = new Hono<AppEnv>()
    bare.use('/api/*', corsPolicy([APP]))
    bare.get('/api/raw', () => new Response('ok', { headers: { Vary: 'Accept-Encoding' } }))
    const res = await bare.request('/api/raw', {
      headers: { Origin: OTHER, Authorization: `Bearer ${KEY}` },
    })
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*')
    expect(res.headers.get('Vary')).toContain('Accept-Encoding')
    expect(res.headers.get('Vary')).toContain('Origin')
  })

  it('varies by Origin on a refusal built by the error handler', async () => {
    app.get('/api/__refused', () => {
      throw new HTTPException(401, { res: new Response('no', { status: 401 }) })
    })
    const res = await app.request('/api/__refused', { headers: { Origin: OTHER } })
    expect(res.status).toBe(401)
    expect(res.headers.get('Vary')).toContain('Origin')
  })

  it('keeps * on a key request from another origin that auth refuses', async () => {
    const res = await app.request(`/api/workflows?projectId=${TEST_PROJECT_ID}`, {
      headers: { Origin: OTHER, Authorization: 'Bearer as_unknown' },
    })
    expect(res.status).toBe(401)
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*')
  })

  it('accepts each of several app origins', async () => {
    const second = 'https://admin.example.com'
    const multi = createTestApp({ corsOrigin: [APP, second] })
    const res = await multi.request('/api/workflows', {
      method: 'OPTIONS',
      headers: { Origin: second, 'Access-Control-Request-Method': 'POST' },
    })
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe(second)
    expect(res.headers.get('Access-Control-Allow-Credentials')).toBe('true')
  })
})
