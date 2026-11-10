import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createTestApp,
  mockDb,
  resetStore,
  setTestOrgRole,
  TEST_ORG_ID,
  TEST_ORG_SLUG,
  TEST_PROJECT_ID,
  TEST_PROJECT_SLUG,
  TEST_USER_ID,
  TEST_WORKSPACE_ID,
} from './helpers.js'
import type { CloudflareOAuthRuntime } from '../lib/cloudflare-oauth-config.js'

const CONFIG: CloudflareOAuthRuntime = {
  stub: false,
  clientId: 'client-id',
  clientSecret: 'client-secret',
  authorizeUrl: 'https://cf.test/oauth2/auth',
  tokenUrl: 'https://cf.test/oauth2/token',
  revokeUrl: 'https://cf.test/oauth2/revoke',
  apiBaseUrl: 'https://cf.test/client/v4',
  redirectUri: 'http://api.test/api/oauth/cloudflare/callback',
  scopes: ['account.read', 'workers-scripts.write'],
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

function stubCloudflare(overrides?: { token?: Response; accounts?: Response }) {
  const mock = vi.fn<typeof fetch>(async (input) => {
    const url = String(input)
    if (url === CONFIG.tokenUrl) {
      return (
        overrides?.token ??
        json({ access_token: 'access-1', refresh_token: 'refresh-1', expires_in: 3600 })
      )
    }
    if (url.startsWith(`${CONFIG.apiBaseUrl}/accounts`)) {
      return overrides?.accounts ?? json({ result: [{ id: 'acct-1', name: 'Acme' }] })
    }
    if (url === CONFIG.revokeUrl) return new Response(null, { status: 200 })
    throw new Error(`unexpected Cloudflare call: ${url}`)
  })
  vi.stubGlobal('fetch', mock)
  return mock
}

async function start(app: ReturnType<typeof createTestApp>): Promise<URL> {
  const res = await app.request(`/api/oauth/cloudflare/start?org=${TEST_ORG_SLUG}`)
  expect(res.status).toBe(302)
  return new URL(res.headers.get('location')!)
}

describe('Cloudflare OAuth routes', () => {
  let app: ReturnType<typeof createTestApp>

  beforeEach(() => {
    resetStore()
    app = createTestApp({ cloudflareOAuth: CONFIG, webUrl: 'http://web.test' })
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('sends the browser to authorization with state and PKCE', async () => {
    const location = await start(app)
    expect(location.origin + location.pathname).toBe(CONFIG.authorizeUrl)
    expect(location.searchParams.get('client_id')).toBe('client-id')
    expect(location.searchParams.get('redirect_uri')).toBe(CONFIG.redirectUri)
    expect(location.searchParams.get('response_type')).toBe('code')
    expect(location.searchParams.get('code_challenge_method')).toBe('S256')
    expect(location.searchParams.get('code_challenge')).toBeTruthy()
    expect(location.searchParams.get('scope')).toBe(
      'account.read workers-scripts.write offline_access',
    )
    expect(location.searchParams.get('state')).toBeTruthy()
  })

  it('refuses a start without an org', async () => {
    const res = await app.request('/api/oauth/cloudflare/start')
    expect(res.status).toBe(400)
  })

  it('refuses a start for an org the caller is not in', async () => {
    const res = await app.request('/api/oauth/cloudflare/start?org=somebody-else')
    expect(res.status).toBe(404)
  })

  it('refuses a start by a member who cannot manage the organization', async () => {
    setTestOrgRole('member')
    const res = await app.request(`/api/oauth/cloudflare/start?org=${TEST_ORG_SLUG}`)
    expect(res.status).toBe(403)
  })

  it('exchanges the code and reports the account back on the connections page', async () => {
    const fetchMock = stubCloudflare()
    const location = await start(app)
    const state = location.searchParams.get('state')!

    const res = await app.request(
      `/api/oauth/cloudflare/callback?code=code-1&state=${encodeURIComponent(state)}`,
    )
    expect(res.status).toBe(302)
    const back = new URL(res.headers.get('location')!)
    expect(back.origin).toBe('http://web.test')
    expect(back.pathname).toBe(`/${TEST_ORG_SLUG}/connections`)
    expect(back.searchParams.get('oauth')).toBe('ok')
    expect(back.searchParams.get('account')).toBe('Acme')
    expect(back.searchParams.get('connected')).toBe('1')
    expect(back.toString()).not.toContain('access-1')
    expect(back.toString()).not.toContain('refresh-1')

    const saved = (await mockDb.listConnections(TEST_ORG_ID)).data[0]
    expect(saved?.name).toBe('Acme')
    expect(saved?.tokenStatus).toBe('active')
    // The row carries no expiry: the access token's hour is in credentials.
    expect(saved?.tokenExpiresAt).toBeNull()
    expect(JSON.parse(saved!.credentials)).toMatchObject({
      authKind: 'oauth',
      accountId: 'acct-1',
      apiToken: 'access-1',
      refreshToken: 'refresh-1',
      scopes: 'account.read workers-scripts.write',
    })

    const listed = await app.request(`/api/connections?organizationId=${TEST_ORG_ID}`)
    const summary = (await listed.json()).data[0]
    expect(summary.authKind).toBe('oauth')
    expect(summary.canDeploy).toBe(true)
    expect(summary).not.toHaveProperty('credentials')

    const tokenCall = fetchMock.mock.calls.find(([url]) => String(url) === CONFIG.tokenUrl)
    expect(tokenCall).toBeDefined()
    const body = new URLSearchParams(String(tokenCall![1]?.body))
    expect(body.get('grant_type')).toBe('authorization_code')
    expect(body.get('code')).toBe('code-1')
    expect(body.get('code_verifier')).toBeTruthy()
    expect(body.get('redirect_uri')).toBe(CONFIG.redirectUri)
  })

  it('uses each state once', async () => {
    stubCloudflare()
    const location = await start(app)
    const state = location.searchParams.get('state')!
    const path = `/api/oauth/cloudflare/callback?code=code-1&state=${encodeURIComponent(state)}`
    expect((await app.request(path)).status).toBe(302)
    expect((await app.request(path)).status).toBe(400)
  })

  it('reports the grant but saves no connection from the stub', async () => {
    stubCloudflare()
    const stubApp = createTestApp({
      cloudflareOAuth: { ...CONFIG, stub: true },
      webUrl: 'http://web.test',
    })
    const location = await start(stubApp)
    const state = location.searchParams.get('state')!
    const res = await stubApp.request(
      `/api/oauth/cloudflare/callback?code=code-1&state=${encodeURIComponent(state)}`,
    )
    const back = new URL(res.headers.get('location')!)
    expect(back.searchParams.get('oauth')).toBe('ok')
    expect(back.searchParams.get('connected')).toBeNull()
    expect((await mockDb.listConnections(TEST_ORG_ID)).data).toHaveLength(0)
  })

  it('reports a refusal without exchanging a code', async () => {
    const fetchMock = stubCloudflare()
    const location = await start(app)
    const state = location.searchParams.get('state')!
    const res = await app.request(
      `/api/oauth/cloudflare/callback?error=access_denied&state=${encodeURIComponent(state)}`,
    )
    expect(res.status).toBe(302)
    const back = new URL(res.headers.get('location')!)
    expect(back.searchParams.get('oauth')).toBe('denied')
    expect(back.searchParams.get('reason')).toBe('access_denied')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('reports a scope refusal as a failure, not a cancellation', async () => {
    const fetchMock = stubCloudflare()
    const location = await start(app)
    const state = location.searchParams.get('state')!
    const query = new URLSearchParams({
      error: 'invalid_scope',
      error_description: "The OAuth 2.0 Client is not allowed to request scope 'account.read'.",
      state,
    })
    const res = await app.request(`/api/oauth/cloudflare/callback?${query}`)
    expect(res.status).toBe(302)
    const back = new URL(res.headers.get('location')!)
    expect(back.searchParams.get('oauth')).toBe('error')
    expect(back.searchParams.get('reason')).toBe('invalid_scope')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('reports a failed exchange back on the page', async () => {
    stubCloudflare({
      token: json({ error: 'invalid_grant', error_description: 'code expired' }, 400),
    })
    const location = await start(app)
    const state = location.searchParams.get('state')!
    const res = await app.request(
      `/api/oauth/cloudflare/callback?code=code-1&state=${encodeURIComponent(state)}`,
    )
    expect(res.status).toBe(302)
    const back = new URL(res.headers.get('location')!)
    expect(back.searchParams.get('oauth')).toBe('error')
    expect(back.searchParams.get('reason')).toBe('exchange')
  })

  it('reports a grant that reaches no accounts', async () => {
    const fetchMock = stubCloudflare({ accounts: json({ result: [] }) })
    const location = await start(app)
    const state = location.searchParams.get('state')!
    const res = await app.request(
      `/api/oauth/cloudflare/callback?code=code-1&state=${encodeURIComponent(state)}`,
    )
    expect(res.status).toBe(302)
    const back = new URL(res.headers.get('location')!)
    expect(back.searchParams.get('oauth')).toBe('error')
    expect(back.searchParams.get('reason')).toBe('no_accounts')
    const revoke = fetchMock.mock.calls.find(([url]) => String(url) === CONFIG.revokeUrl)
    expect(revoke).toBeDefined()
    expect(new URLSearchParams(String(revoke![1]?.body)).get('token')).toBe('refresh-1')
  })

  it('refuses a grant that covers several accounts and withdraws it', async () => {
    const fetchMock = stubCloudflare({
      accounts: json({
        result: [
          { id: 'acct-1', name: 'Acme' },
          { id: 'acct-2', name: 'Beta' },
        ],
      }),
    })
    const location = await start(app)
    const state = location.searchParams.get('state')!
    const res = await app.request(
      `/api/oauth/cloudflare/callback?code=code-1&state=${encodeURIComponent(state)}`,
    )
    const back = new URL(res.headers.get('location')!)
    expect(back.searchParams.get('reason')).toBe('multiple_accounts')
    const revoke = fetchMock.mock.calls.find(([url]) => String(url) === CONFIG.revokeUrl)
    expect(revoke).toBeDefined()
  })

  it('refuses a callback after the caller loses manage settings', async () => {
    const org = await mockDb.getOrganizationIfMember(TEST_USER_ID, { slug: TEST_ORG_SLUG })
    vi.spyOn(mockDb, 'getOrganizationIfMember')
      .mockResolvedValueOnce(org)
      .mockResolvedValueOnce(null)
    const fetchMock = stubCloudflare()
    const location = await start(app)
    const state = location.searchParams.get('state')!
    const res = await app.request(
      `/api/oauth/cloudflare/callback?code=code-1&state=${encodeURIComponent(state)}`,
    )
    const back = new URL(res.headers.get('location')!)
    expect(back.searchParams.get('reason')).toBe('forbidden')
    expect(fetchMock.mock.calls.some(([url]) => String(url) === CONFIG.tokenUrl)).toBe(false)
  })

  it('caps how many authorizations one person can keep pending', async () => {
    for (let i = 0; i < 5; i++) {
      expect((await app.request(`/api/oauth/cloudflare/start?org=${TEST_ORG_SLUG}`)).status).toBe(
        302,
      )
    }
    const sixth = await app.request(`/api/oauth/cloudflare/start?org=${TEST_ORG_SLUG}`)
    expect(sixth.status).toBe(429)
  })

  it('answers an unknown state with a readable page', async () => {
    const res = await app.request('/api/oauth/cloudflare/callback?code=c&state=nope')
    expect(res.status).toBe(400)
    expect(res.headers.get('content-type')).toContain('text/html')
    await expect(res.text()).resolves.toContain('expired')
  })

  it('does not exist when no client is configured', async () => {
    const unconfigured = createTestApp()
    const res = await unconfigured.request(`/api/oauth/cloudflare/start?org=${TEST_ORG_SLUG}`)
    expect(res.status).toBe(404)
  })

  it('adds a project-owned connection from the project page', async () => {
    stubCloudflare()
    const create = vi
      .spyOn(mockDb, 'createProjectConnection')
      .mockResolvedValue({ id: 'pc-1', name: 'Acme', isDefault: true })
    const location = await app.request(
      `/api/oauth/cloudflare/start?org=${TEST_ORG_SLUG}&project=${TEST_PROJECT_SLUG}`,
    )
    expect(location.status).toBe(302)
    const state = new URL(location.headers.get('location')!).searchParams.get('state')!
    const res = await app.request(
      `/api/oauth/cloudflare/callback?code=code-1&state=${encodeURIComponent(state)}`,
    )
    expect(res.status).toBe(302)
    const back = new URL(res.headers.get('location')!)
    expect(back.pathname).toBe(`/${TEST_ORG_SLUG}/${TEST_PROJECT_SLUG}/connections`)
    expect(back.searchParams.get('connected')).toBe('1')
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: TEST_PROJECT_ID,
        organizationId: TEST_ORG_ID,
        makeDefault: true,
        name: 'Acme',
      }),
    )
  })

  it('makes the account a workspace default when connected from that workspace', async () => {
    stubCloudflare()
    const create = vi
      .spyOn(mockDb, 'createProjectConnection')
      .mockResolvedValue({ id: 'pc-2', name: 'Acme', isDefault: false })
    const setWorkspace = vi.spyOn(mockDb, 'setWorkspaceConnection').mockResolvedValue({
      workspaceName: 'Sales',
      connectionName: 'Acme',
      changed: true,
    })
    const location = await app.request(
      `/api/oauth/cloudflare/start?org=${TEST_ORG_SLUG}&project=${TEST_PROJECT_SLUG}&workspaceId=${TEST_WORKSPACE_ID}`,
    )
    const state = new URL(location.headers.get('location')!).searchParams.get('state')!
    const res = await app.request(
      `/api/oauth/cloudflare/callback?code=code-1&state=${encodeURIComponent(state)}`,
    )
    expect(res.status).toBe(302)
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ makeDefault: false }))
    expect(setWorkspace).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: TEST_PROJECT_ID,
        workspaceId: TEST_WORKSPACE_ID,
        connectionId: 'pc-2',
      }),
    )
  })

  it('says whether OAuth is available', async () => {
    const configured = await app.request('/api/oauth/cloudflare/status')
    expect(await configured.json()).toEqual({ enabled: true })

    const unconfigured = createTestApp()
    const disabled = await unconfigured.request('/api/oauth/cloudflare/status')
    expect(await disabled.json()).toEqual({ enabled: false })
  })

  it('does not leave a project account when the workspace default cannot be set', async () => {
    stubCloudflare()
    const create = vi
      .spyOn(mockDb, 'createProjectConnection')
      .mockResolvedValue({ id: 'pc-x', name: 'Acme', isDefault: false })
    const setWorkspace = vi.spyOn(mockDb, 'setWorkspaceConnection').mockResolvedValue({
      workspaceName: 'Sales',
      connectionName: null,
      changed: false,
    })
    const remove = vi.spyOn(mockDb, 'removeProjectConnection').mockResolvedValue({
      owned: true,
      name: 'Acme',
      blockedBy: [],
      blockedElsewhere: 0,
      wasDefault: false,
      workspacesCleared: 0,
    })
    const location = await app.request(
      `/api/oauth/cloudflare/start?org=${TEST_ORG_SLUG}&project=${TEST_PROJECT_SLUG}&workspaceId=${TEST_WORKSPACE_ID}`,
    )
    const state = new URL(location.headers.get('location')!).searchParams.get('state')!
    const res = await app.request(
      `/api/oauth/cloudflare/callback?code=code-1&state=${encodeURIComponent(state)}`,
    )
    expect(res.status).toBe(302)
    const back = new URL(res.headers.get('location')!)
    expect(back.searchParams.get('oauth')).toBe('error')
    expect(back.searchParams.get('reason')).toBe('save')
    expect(create).toHaveBeenCalled()
    expect(setWorkspace).toHaveBeenCalled()
    expect(remove).toHaveBeenCalledWith(TEST_PROJECT_ID, 'pc-x')
  })

  it('re-authorizes an existing connection in place', async () => {
    const fetchMock = stubCloudflare()
    const clearNotices = vi.spyOn(mockDb, 'clearNotificationsByPrefix').mockResolvedValue(undefined)
    await mockDb.createConnection({
      id: 'c-reconnect',
      organizationId: TEST_ORG_ID,
      createdBy: TEST_USER_ID,
      provider: 'cloudflare',
      credentials: JSON.stringify({
        authKind: 'oauth',
        accountId: 'acct-1',
        apiToken: 'old-access',
        refreshToken: 'old-refresh',
        scopes: 'account-settings.read',
      }),
      name: 'Acme',
      token: { status: 'active', expiresAt: null, checkedAt: new Date().toISOString() },
    })

    const location = await app.request(
      `/api/oauth/cloudflare/start?org=${TEST_ORG_SLUG}&connection=c-reconnect`,
    )
    expect(location.status).toBe(302)
    const state = new URL(location.headers.get('location')!).searchParams.get('state')!
    const res = await app.request(
      `/api/oauth/cloudflare/callback?code=code-1&state=${encodeURIComponent(state)}`,
    )
    expect(res.status).toBe(302)
    const back = new URL(res.headers.get('location')!)
    expect(back.searchParams.get('connected')).toBe('1')

    const rows = (await mockDb.listConnections(TEST_ORG_ID)).data
    expect(rows).toHaveLength(1)
    expect(rows[0]?.id).toBe('c-reconnect')
    expect(rows[0]?.name).toBe('Acme')
    expect(JSON.parse(rows[0]!.credentials)).toMatchObject({
      authKind: 'oauth',
      apiToken: 'access-1',
      refreshToken: 'refresh-1',
    })
    const revoke = fetchMock.mock.calls.find(([url]) => String(url) === CONFIG.revokeUrl)
    expect(revoke).toBeDefined()
    const revokeBody = new URLSearchParams(String(revoke![1]?.body))
    expect(revokeBody.get('token')).toBe('old-refresh')
    expect(revokeBody.get('token_type_hint')).toBe('refresh_token')
    expect(clearNotices).toHaveBeenCalled()
  })

  it('re-authorizes a project connection without creating another', async () => {
    const fetchMock = stubCloudflare()
    const projectConnection = {
      id: 'pc-1',
      organizationId: TEST_ORG_ID,
      createdBy: TEST_USER_ID,
      provider: 'cloudflare',
      name: 'Acme',
      credentials: JSON.stringify({
        authKind: 'oauth',
        accountId: 'acct-1',
        apiToken: 'old-access',
        refreshToken: 'old-refresh',
      }),
      projectId: TEST_PROJECT_ID,
      allProjects: true,
      tokenStatus: 'active',
      tokenExpiresAt: null,
      tokenCheckedAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }
    vi.spyOn(mockDb, 'getProviderConnectionById').mockResolvedValue(projectConnection)
    const update = vi.spyOn(mockDb, 'updateConnection').mockResolvedValue({
      ...projectConnection,
      projects: [],
      deployments: { count: 0, lastAt: null },
      createdByName: null,
      hiddenProjects: 0,
    } as never)
    const createProject = vi.spyOn(mockDb, 'createProjectConnection')

    const location = await app.request(
      `/api/oauth/cloudflare/start?org=${TEST_ORG_SLUG}&project=${TEST_PROJECT_SLUG}&connection=pc-1`,
    )
    const state = new URL(location.headers.get('location')!).searchParams.get('state')!
    const res = await app.request(
      `/api/oauth/cloudflare/callback?code=code-1&state=${encodeURIComponent(state)}`,
    )
    expect(res.status).toBe(302)
    expect(update).toHaveBeenCalledWith(
      'pc-1',
      expect.objectContaining({ credentials: expect.any(String) }),
    )
    expect(createProject).not.toHaveBeenCalled()
    const revoke = fetchMock.mock.calls.find(([url]) => String(url) === CONFIG.revokeUrl)
    expect(new URLSearchParams(String(revoke![1]?.body)).get('token')).toBe('old-refresh')
  })

  it('refuses a callback whose authorization is older than the state TTL', async () => {
    stubCloudflare()
    vi.useFakeTimers({ now: Date.now() })
    const location = await app.request(`/api/oauth/cloudflare/start?org=${TEST_ORG_SLUG}`)
    const state = new URL(location.headers.get('location')!).searchParams.get('state')!
    vi.setSystemTime(Date.now() + 11 * 60_000)
    const res = await app.request(
      `/api/oauth/cloudflare/callback?code=code-1&state=${encodeURIComponent(state)}`,
    )
    expect(res.status).toBe(400)
    vi.useRealTimers()
  })

  it('refuses token replacement on an OAuth connection', async () => {
    await mockDb.createConnection({
      id: 'c-oauth',
      organizationId: TEST_ORG_ID,
      createdBy: TEST_USER_ID,
      provider: 'cloudflare',
      credentials: JSON.stringify({
        authKind: 'oauth',
        accountId: 'acct-1',
        apiToken: 'at',
        refreshToken: 'rt',
      }),
      name: 'Acme',
    })
    const res = await app.request(`/api/connections/c-oauth?organizationId=${TEST_ORG_ID}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ credentials: { apiToken: 'new-token' } }),
    })
    expect(res.status).toBe(400)
  })

  it('refuses to re-authorize an API-token connection', async () => {
    await mockDb.createConnection({
      id: 'c-token',
      organizationId: TEST_ORG_ID,
      createdBy: TEST_USER_ID,
      provider: 'cloudflare',
      credentials: JSON.stringify({ accountId: 'acct-1', apiToken: 'tok' }),
      name: 'Acme',
    })
    const res = await app.request(
      `/api/oauth/cloudflare/start?org=${TEST_ORG_SLUG}&connection=c-token`,
    )
    expect(res.status).toBe(400)
  })

  it('revokes a project-owned OAuth grant when the project account is deleted', async () => {
    const fetchMock = vi.fn<typeof fetch>(async (input) => {
      expect(String(input)).toBe(CONFIG.revokeUrl)
      return new Response(null, { status: 200 })
    })
    vi.stubGlobal('fetch', fetchMock)
    const connection = {
      id: 'pc-oauth',
      organizationId: TEST_ORG_ID,
      createdBy: TEST_USER_ID,
      provider: 'cloudflare',
      name: 'Acme',
      credentials: JSON.stringify({
        authKind: 'oauth',
        accountId: 'acct-1',
        apiToken: 'at',
        refreshToken: 'rt',
      }),
      projectId: TEST_PROJECT_ID,
      allProjects: true,
      tokenStatus: 'active',
      tokenExpiresAt: null,
      tokenCheckedAt: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }
    vi.spyOn(mockDb, 'getProjectOwnedConnection').mockResolvedValue(connection)
    vi.spyOn(mockDb, 'removeProjectConnection').mockResolvedValue({
      owned: true,
      name: 'Acme',
      blockedBy: [],
      blockedElsewhere: 0,
      wasDefault: false,
      workspacesCleared: 0,
    })

    const res = await app.request(
      `/api/projects/${TEST_PROJECT_ID}/connections/pc-oauth?organizationId=${TEST_ORG_ID}`,
      { method: 'DELETE' },
    )
    expect(res.status).toBe(200)
    const body = new URLSearchParams(String(fetchMock.mock.calls[0]![1]?.body))
    expect(body.get('token')).toBe('rt')
    expect(body.get('token_type_hint')).toBe('refresh_token')
  })

  it('refuses token replacement on a project OAuth account', async () => {
    vi.spyOn(mockDb, 'getProjectOwnedConnection').mockResolvedValue({
      id: 'pc-oauth',
      organizationId: TEST_ORG_ID,
      createdBy: TEST_USER_ID,
      provider: 'cloudflare',
      name: 'Acme',
      credentials: JSON.stringify({
        authKind: 'oauth',
        accountId: 'acct-1',
        apiToken: 'at',
        refreshToken: 'rt',
      }),
      projectId: TEST_PROJECT_ID,
      allProjects: true,
      tokenStatus: 'active',
      tokenExpiresAt: null,
      tokenCheckedAt: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    })
    const res = await app.request(
      `/api/projects/${TEST_PROJECT_ID}/connections/pc-oauth?organizationId=${TEST_ORG_ID}`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: 'new-token' }),
      },
    )
    expect(res.status).toBe(400)
  })

  it('flags an OAuth grant that has no Workers deploy scope', async () => {
    await mockDb.createConnection({
      id: 'c-read-only',
      organizationId: TEST_ORG_ID,
      createdBy: TEST_USER_ID,
      provider: 'cloudflare',
      credentials: JSON.stringify({
        authKind: 'oauth',
        accountId: 'acct-1',
        apiToken: 'at',
        scopes: 'account-settings.read',
      }),
      name: 'Acme read-only',
    })
    const res = await app.request(`/api/connections?organizationId=${TEST_ORG_ID}`)
    const summary = (await res.json()).data[0]
    expect(summary.canDeploy).toBe(false)
  })

  it('revokes the OAuth grant when the connection is deleted', async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => new Response(null, { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    await mockDb.createConnection({
      id: 'c-oauth',
      organizationId: TEST_ORG_ID,
      createdBy: TEST_USER_ID,
      provider: 'cloudflare',
      credentials: JSON.stringify({
        authKind: 'oauth',
        accountId: 'acct-1',
        apiToken: 'at',
        refreshToken: 'rt',
      }),
      name: 'Acme',
      token: { status: 'active', expiresAt: null, checkedAt: new Date().toISOString() },
    })

    const res = await app.request(`/api/connections/c-oauth?organizationId=${TEST_ORG_ID}`, {
      method: 'DELETE',
    })
    expect(res.status).toBe(200)
    const [url, init] = fetchMock.mock.calls[0]!
    expect(String(url)).toBe(CONFIG.revokeUrl)
    expect(new URLSearchParams(String(init?.body)).get('token')).toBe('rt')
  })
})
