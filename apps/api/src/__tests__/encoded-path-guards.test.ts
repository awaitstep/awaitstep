import { afterEach, describe, expect, it, vi } from 'vitest'
import { Hono } from 'hono'
import { RegExpRouter } from 'hono/router/reg-exp-router'
import type { CloudflareOAuthRuntime } from '../lib/cloudflare-oauth-config.js'
import { createTestApp, mockAuth } from './helpers.js'

/**
 * hono < 4.13.16 (GHSA-h7mg-cq63-vhpq): RegExpRouter could skip wildcard
 * middleware for some route sets, and for a path holding an encoded line
 * terminator (the request then reached the not-found handler unchecked). Our
 * sign-in check is wildcard middleware on /api/*.
 *
 * The app runs TrieRouter today (SmartRouter falls back because RegExpRouter
 * refuses some of our paths), which was never affected; these tests keep it
 * that way through a route reshuffle or a hono downgrade.
 */

const TERMINATORS = ['%0A', '%0D', '%E2%80%A8', '%E2%80%A9']

// Open to everyone by design.
const OPEN = (path: string) =>
  path.startsWith('/api/auth/') ||
  path === '/api/health' ||
  path === '/api/instance' ||
  path.startsWith('/api/images/')

const OAUTH: CloudflareOAuthRuntime = {
  stub: false,
  clientId: 'client-id',
  clientSecret: 'client-secret',
  authorizeUrl: 'https://cf.test/oauth2/auth',
  tokenUrl: 'https://cf.test/oauth2/token',
  revokeUrl: 'https://cf.test/oauth2/revoke',
  apiBaseUrl: 'https://cf.test/client/v4',
  redirectUri: 'http://api.test/api/oauth/cloudflare/callback',
  scopes: ['account.read'],
}

function variants(path: string): string[] {
  const concrete = path.replace(/:[A-Za-z]+/g, 'x')
  const parts = concrete.split('/')
  const out: string[] = []
  for (const t of TERMINATORS) {
    out.push(`${concrete}${t}`)
    for (let i = 2; i < parts.length; i++) {
      const before = [...parts]
      before[i] = `${t}${before[i]}`
      out.push(before.join('/'))
      const after = [...parts]
      after[i] = `${after[i]}${t}`
      out.push(after.join('/'))
    }
  }
  return out
}

describe('signed-out requests with encoded line terminators in the path', () => {
  afterEach(() => vi.restoreAllMocks())

  it('are refused by the sign-in check on every API route, and on unknown ones', async () => {
    vi.spyOn(mockAuth.api, 'getSession').mockResolvedValue(null as never)
    // Every request from its own address, so the rate limit (which runs
    // before sign-in) never answers in its place.
    let n = 1
    const app = createTestApp({
      enableLocalDev: true,
      cloudflareOAuth: OAUTH,
      connectionAddress: () => `10.${(n >> 16) & 255}.${(n >> 8) & 255}.${n++ & 255}`,
    })
    const requests = new Set<string>()
    for (const route of app.routes) {
      if (!route.path.startsWith('/api/') || OPEN(route.path) || route.path.includes('*')) continue
      if (!['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].includes(route.method)) continue
      for (const path of variants(route.path)) requests.add(`${route.method} ${path}`)
    }
    // The advisory's shape exactly: a path no route matches.
    for (const t of TERMINATORS) {
      requests.add(`GET /api/${t}`)
      requests.add(`GET /api/nope${t}`)
      requests.add(`POST /api/nope${t}`)
    }

    const answered: string[] = []
    for (const request of requests) {
      const [method, path] = request.split(' ')
      const res = await app.request(path!, { method })
      const body = await res.text()
      if (res.status !== 401 || !body.includes('Unauthorized'))
        answered.push(`${request} → ${res.status}`)
    }
    expect(requests.size).toBeGreaterThan(1000)
    expect(answered).toEqual([])
  }, 30_000)
})

describe('the hono this app runs on', () => {
  it('runs wildcard middleware for an unmatched path with an encoded line break under RegExpRouter', async () => {
    const app = new Hono({ router: new RegExpRouter() })
    let checked = 0
    app.use('/api/*', async (_c, next) => {
      checked++
      await next()
    })
    app.get('/api/x', (c) => c.text('x'))
    await app.request('/api/y%0A')
    expect(checked).toBe(1)
  })
})
