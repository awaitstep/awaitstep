import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Connection } from '@awaitstep/db'
import type { CloudflareOAuthRuntime } from '../lib/cloudflare-oauth-config.js'
import { createConnectionRefresh } from '../lib/connection-refresh.js'

const CONFIG: CloudflareOAuthRuntime = {
  stub: false,
  clientId: 'client-id',
  clientSecret: 'client-secret',
  authorizeUrl: 'https://cf.test/oauth2/auth',
  tokenUrl: 'https://cf.test/oauth2/token',
  revokeUrl: 'https://cf.test/oauth2/revoke',
  apiBaseUrl: 'https://cf.test/client/v4',
  redirectUri: 'http://api.test/api/oauth/cloudflare/callback',
  scopes: ['account-settings.read'],
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

function connection(credentials: Record<string, unknown>): Connection {
  const now = new Date().toISOString()
  return {
    id: 'conn-1',
    organizationId: 'org-1',
    createdBy: 'user-1',
    provider: 'cloudflare',
    name: 'Acme',
    credentials: JSON.stringify({
      authKind: 'oauth',
      accountId: 'acct-1',
      apiToken: 'old-access',
      refreshToken: 'old-refresh',
      expiresAt: new Date(Date.now() - 60_000).toISOString(),
      ...credentials,
    }),
    allProjects: true,
    tokenStatus: 'active',
    tokenExpiresAt: new Date(Date.now() - 60_000).toISOString(),
    tokenCheckedAt: now,
    projectId: null,
    createdAt: now,
    updatedAt: now,
  }
}

function stubFetch(response: Response | (() => Promise<Response>)) {
  const mock = vi.fn<typeof fetch>(async () =>
    typeof response === 'function' ? response() : response,
  )
  vi.stubGlobal('fetch', mock)
  return mock
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe('createConnectionRefresh', () => {
  it('refreshes an expired OAuth token and rotates the refresh token', async () => {
    const fetchMock = stubFetch(
      json({ access_token: 'new-access', refresh_token: 'new-refresh', expires_in: 3600 }),
    )
    const refresh = createConnectionRefresh(CONFIG)!
    const result = await refresh(connection({}))
    expect(result).not.toBeNull()
    const stored = JSON.parse(result!.credentials)
    expect(stored).toMatchObject({
      authKind: 'oauth',
      accountId: 'acct-1',
      apiToken: 'new-access',
      refreshToken: 'new-refresh',
    })
    expect(Date.parse(stored.expiresAt)).toBeGreaterThan(Date.now())
    expect(result!.token).toMatchObject({ status: 'active', expiresAt: null })
    const body = new URLSearchParams(String(fetchMock.mock.calls[0]![1]?.body))
    expect(body.get('grant_type')).toBe('refresh_token')
    expect(body.get('refresh_token')).toBe('old-refresh')
  })

  it('keeps the old refresh token when Cloudflare does not rotate it', async () => {
    stubFetch(json({ access_token: 'new-access', expires_in: 3600 }))
    const refresh = createConnectionRefresh(CONFIG)!
    const result = await refresh(connection({}))
    expect(JSON.parse(result!.credentials).refreshToken).toBe('old-refresh')
  })

  it('does nothing while the token is still fresh', async () => {
    const fetchMock = stubFetch(json({}))
    const refresh = createConnectionRefresh(CONFIG)!
    const result = await refresh(
      connection({ expiresAt: new Date(Date.now() + 10 * 60_000).toISOString() }),
    )
    expect(result).toBeNull()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('does not re-refresh a grant already known dead', async () => {
    const fetchMock = stubFetch(json({}))
    const refresh = createConnectionRefresh(CONFIG)!
    const dead = connection({})
    dead.tokenStatus = 'invalid'
    expect(await refresh(dead)).toBeNull()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('leaves API-token connections alone', async () => {
    const fetchMock = stubFetch(json({}))
    const refresh = createConnectionRefresh(CONFIG)!
    const result = await refresh(connection({ authKind: 'api-token', refreshToken: undefined }))
    expect(result).toBeNull()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('marks the connection invalid when the grant was revoked', async () => {
    stubFetch(json({ error: 'invalid_grant', error_description: 'revoked' }, 400))
    const refresh = createConnectionRefresh(CONFIG)!
    const result = await refresh(connection({}))
    expect(result).toMatchObject({
      token: { status: 'invalid', expiresAt: null },
    })
    expect(JSON.parse(result!.credentials).apiToken).toBe('old-access')
  })

  it('leaves the row untouched when Cloudflare is unreachable', async () => {
    stubFetch(json({ error: 'temporarily_unavailable' }, 503))
    const refresh = createConnectionRefresh(CONFIG)!
    expect(await refresh(connection({}))).toBeNull()
  })

  it('shares one refresh between concurrent reads', async () => {
    let release: (response: Response) => void = () => {}
    const pending = new Promise<Response>((resolve) => {
      release = resolve
    })
    const fetchMock = stubFetch(() => pending)
    const refresh = createConnectionRefresh(CONFIG)!
    const first = refresh(connection({}))
    const second = refresh(connection({}))
    await Promise.resolve()
    expect(fetchMock).toHaveBeenCalledTimes(1)
    release(json({ access_token: 'new-access', expires_in: 3600 }))
    expect(await first).toEqual(await second)
  })

  it('is not installed for the stub', () => {
    expect(createConnectionRefresh({ ...CONFIG, stub: true })).toBeUndefined()
    expect(createConnectionRefresh(undefined)).toBeUndefined()
  })
})
