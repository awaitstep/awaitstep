import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { stubCloudflare } from './fixtures/cloudflare.js'
import { createSqliteApp, seedAcme, type SqliteApp } from './sqlite-app.js'
import { createTestApp, resetStore, TEST_ORG_SLUG } from './helpers.js'
import { Hono } from 'hono'
import type { CloudflareOAuthRuntime } from '../lib/cloudflare-oauth-config.js'
import { requireFeature } from '../lib/feature-switches.js'
import type { AppEnv } from '../types.js'

// An instance that switches open-source features off: `GET /api/instance`
// lists them, and with `connections.apiTokens` off every route that takes a
// pasted token refuses it before checking it, while OAuth and the
// connections themselves stay.

const ACCOUNT = 'a'.repeat(32)
const TOKENS_OFF =
  'This instance connects Cloudflare accounts through OAuth only. Pasted API tokens aren’t accepted.'

describe('GET /api/instance → disabled', () => {
  beforeEach(() => resetStore())

  it('switches nothing off by default', async () => {
    const res = await createTestApp().request('/api/instance')
    expect(await res.json()).toEqual({ features: [], disabled: [] })
  })

  it('lists the switched-off features, each once, in list order', async () => {
    const app = createTestApp({
      disabledFeatures: ['connections.apiTokens', 'playground', 'connections.ui', 'playground'],
    })
    const res = await app.request('/api/instance')
    expect(await res.json()).toEqual({
      features: [],
      disabled: ['playground', 'connections.ui', 'connections.apiTokens'],
    })
  })

  it('refuses an unknown switch name at startup', () => {
    // A misspelt switch would otherwise leave the feature on without a word.
    expect(() =>
      createTestApp({ disabledFeatures: ['connections.tokens' as 'connections.ui'] }),
    ).toThrow(/Unknown feature switch "connections\.tokens"/)
  })
})

describe('connections.apiTokens switched off', () => {
  let h: SqliteApp
  let verify: { verify: number }
  let orgConnection: string
  let ownConnection: string

  beforeEach(async () => {
    h = createSqliteApp({ disabledFeatures: ['connections.apiTokens'] })
    await seedAcme(h)
    await h.seed.projectGrant('p-101', 'u-fay', 'admin')
    verify = stubCloudflare({ accounts: [{ id: ACCOUNT, name: 'Acme' }] })
    // Connections made before the switch (or by OAuth) are still there.
    const org = await h.adapter.createConnection({
      id: 'conn-org',
      organizationId: 'org-acme',
      createdBy: 'u-ben',
      provider: 'cloudflare',
      credentials: JSON.stringify({ accountId: ACCOUNT, apiToken: 'old' }),
      name: 'Acme production',
      allProjects: true,
      projectIds: [],
    })
    orgConnection = org!.id
    const own = await h.adapter.createProjectConnection({
      id: 'conn-own',
      projectId: 'p-101',
      organizationId: 'org-acme',
      createdBy: 'u-fay',
      provider: 'cloudflare',
      name: 'Checkout staging',
      credentials: JSON.stringify({ accountId: ACCOUNT, apiToken: 'old' }),
      makeDefault: true,
    })
    ownConnection = own!.id
  })

  afterEach(() => vi.unstubAllGlobals())

  const send = (who: string, path: string, body: unknown, method = 'POST') =>
    h.app.request(`/api${path}`, h.as(who, h.json(body, method)))

  async function expectRefused(res: Response) {
    expect(res.status).toBe(403)
    expect(await res.json()).toEqual({ error: TOKENS_OFF })
  }

  it('refuses connecting an org account with a token, before checking it', async () => {
    await expectRefused(
      await send('u-ben', '/connections?org=acme', {
        provider: 'cloudflare',
        name: 'New',
        credentials: { accountId: ACCOUNT, apiToken: 'tok' },
      }),
    )
    expect(verify.verify).toBe(0)
  })

  it('refuses before validating the body, so a malformed one gets the same reason', async () => {
    await expectRefused(await send('u-ben', '/connections?org=acme', {}))
  })

  it('refuses checking a pasted token', async () => {
    await expectRefused(
      await send('u-ben', '/connections/verify-token?org=acme', {
        provider: 'cloudflare',
        credentials: { apiToken: 'tok' },
      }),
    )
    expect(verify.verify).toBe(0)
  })

  it('refuses replacing an org account’s token, but still renames it', async () => {
    await expectRefused(
      await send(
        'u-ben',
        `/connections/${orgConnection}?org=acme`,
        { credentials: { apiToken: 'new' } },
        'PATCH',
      ),
    )
    const renamed = await send(
      'u-ben',
      `/connections/${orgConnection}?org=acme`,
      { name: 'Acme prod' },
      'PATCH',
    )
    expect(renamed.status).toBe(200)
    expect(((await renamed.json()) as { name: string }).name).toBe('Acme prod')
  })

  it('refuses connecting a project’s own account with a token', async () => {
    await expectRefused(
      await send('u-fay', '/projects/p-101/connections/new', {
        name: 'Checkout prod',
        accountId: ACCOUNT,
        token: 'tok',
      }),
    )
    expect(verify.verify).toBe(0)
  })

  it('refuses replacing a project account’s token, but still renames it', async () => {
    const path = `/projects/p-101/connections/${ownConnection}`
    await expectRefused(await send('u-fay', path, { token: 'new' }, 'PATCH'))
    const renamed = await send('u-fay', path, { name: 'Checkout' }, 'PATCH')
    expect(renamed.status).toBe(200)
    expect(verify.verify).toBe(0)
  })

  it('keeps the connections readable for deploys and the project page', async () => {
    const res = await h.app.request('/api/projects/p-101/connections', h.as('u-fay'))
    expect(res.status).toBe(200)
    const body = (await res.json()) as { connections: { id: string }[] }
    expect(body.connections.map((c) => c.id)).toContain(ownConnection)
  })

  it('still answers the token routes on an instance that switches nothing off', async () => {
    const open = createSqliteApp()
    await seedAcme(open)
    const res = await open.app.request(
      '/api/connections?org=acme',
      open.as(
        'u-ben',
        open.json({
          provider: 'cloudflare',
          name: 'New',
          credentials: { accountId: ACCOUNT, apiToken: 'tok' },
        }),
      ),
    )
    expect(res.status).toBe(201)
  })
})

describe('Cloudflare OAuth with connections.apiTokens switched off', () => {
  const CONFIG: CloudflareOAuthRuntime = {
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

  beforeEach(() => resetStore())

  it('still starts an authorization', async () => {
    const app = createTestApp({
      cloudflareOAuth: CONFIG,
      webUrl: 'http://web.test',
      disabledFeatures: ['connections.apiTokens', 'connections.ui'],
    })
    const res = await app.request('/api/oauth/cloudflare/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ org: TEST_ORG_SLUG }),
    })
    expect(res.status).toBe(200)
    const { url } = (await res.json()) as { url: string }
    expect(url.startsWith(CONFIG.authorizeUrl)).toBe(true)
  })
})

describe('the gate outside createApp', () => {
  it('refuses with an error rather than reading the feature as on', async () => {
    // A route mounted without the app's context middleware: no switches known.
    const app = new Hono<AppEnv>()
    app.post('/x', requireFeature('connections.apiTokens'), (c) => c.json({ ok: true }))
    const res = await app.request('/x', { method: 'POST' })
    expect(res.status).toBe(500)
  })
})
