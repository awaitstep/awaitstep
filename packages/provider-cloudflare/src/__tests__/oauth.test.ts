import { createHash } from 'node:crypto'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  authorizationUrl,
  canDeployWithScopes,
  CloudflareOAuthError,
  createPkcePair,
  exchangeAuthorizationCode,
  listAuthorizedAccounts,
  refreshAccessToken,
  revokeToken,
  type CloudflareOAuthClientConfig,
} from '../oauth.js'

const CONFIG: CloudflareOAuthClientConfig = {
  clientId: 'client-id',
  clientSecret: 'client-secret',
  authorizeUrl: 'https://dash.cloudflare.com/oauth2/auth',
  tokenUrl: 'https://dash.cloudflare.com/oauth2/token',
  revokeUrl: 'https://dash.cloudflare.com/oauth2/revoke',
  apiBaseUrl: 'https://api.cloudflare.com/client/v4',
  redirectUri: 'https://app.example.com/api/oauth/cloudflare/callback',
  scopes: ['account.read', 'workers-scripts.write'],
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

function stubFetch(response: Response) {
  const mock = vi.fn(async () => response)
  vi.stubGlobal('fetch', mock)
  return mock
}

function base64Url(bytes: Buffer): string {
  return bytes.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('canDeployWithScopes', () => {
  it('needs Admin, because creating a Worker is not an Editor action', () => {
    expect(canDeployWithScopes(['workers-scripts.admin'])).toBe(true)
    expect(canDeployWithScopes(['workers-scripts.edit'])).toBe(false)
    expect(canDeployWithScopes(['workers-scripts.write'])).toBe(false)
    expect(canDeployWithScopes(undefined)).toBe(true)
  })
})

describe('authorizationUrl', () => {
  it('carries the client, redirect, state, PKCE and offline_access', () => {
    const url = new URL(
      authorizationUrl(CONFIG, { state: 'state-1', codeChallenge: 'challenge-1' }),
    )
    expect(url.origin + url.pathname).toBe('https://dash.cloudflare.com/oauth2/auth')
    expect(url.searchParams.get('response_type')).toBe('code')
    expect(url.searchParams.get('client_id')).toBe('client-id')
    expect(url.searchParams.get('redirect_uri')).toBe(CONFIG.redirectUri)
    expect(url.searchParams.get('state')).toBe('state-1')
    expect(url.searchParams.get('code_challenge')).toBe('challenge-1')
    expect(url.searchParams.get('code_challenge_method')).toBe('S256')
    expect(url.searchParams.get('scope')?.split(' ')).toEqual([
      'account.read',
      'workers-scripts.write',
      'offline_access',
    ])
  })

  it('does not ask for offline_access twice', () => {
    const url = new URL(
      authorizationUrl(
        { ...CONFIG, scopes: ['account.read', 'offline_access'] },
        { state: 's', codeChallenge: 'c' },
      ),
    )
    expect(url.searchParams.get('scope')).toBe('account.read offline_access')
  })

  it('leaves offline_access out when the flow keeps no token', () => {
    const url = new URL(
      authorizationUrl(CONFIG, { state: 's', codeChallenge: 'c', offlineAccess: false }),
    )
    expect(url.searchParams.get('scope')).toBe('account.read workers-scripts.write')
  })
})

describe('createPkcePair', () => {
  it('answers a verifier whose SHA-256 is the challenge', async () => {
    const { verifier, challenge } = await createPkcePair()
    expect(verifier.length).toBeGreaterThanOrEqual(43)
    expect(verifier).toMatch(/^[A-Za-z0-9_-]+$/)
    const expected = base64Url(createHash('sha256').update(verifier).digest())
    expect(challenge).toBe(expected)
  })

  it('makes a new pair every time', async () => {
    const first = await createPkcePair()
    const second = await createPkcePair()
    expect(first.verifier).not.toBe(second.verifier)
  })
})

describe('exchangeAuthorizationCode', () => {
  it('posts the code and verifier with basic auth, and reads the tokens', async () => {
    const fetchMock = stubFetch(
      json({
        access_token: 'access-1',
        refresh_token: 'refresh-1',
        expires_in: 3600,
        scope: 'account.read workers-scripts.write',
      }),
    )

    const tokens = await exchangeAuthorizationCode(CONFIG, {
      code: 'code-1',
      codeVerifier: 'verifier-1',
    })

    expect(tokens).toEqual({
      accessToken: 'access-1',
      refreshToken: 'refresh-1',
      expiresIn: 3600,
      scope: 'account.read workers-scripts.write',
    })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0]!
    expect(url).toBe(CONFIG.tokenUrl)
    expect(init?.method).toBe('POST')
    expect(init?.headers).toMatchObject({
      'content-type': 'application/x-www-form-urlencoded',
      authorization: `Basic ${btoa('client-id:client-secret')}`,
    })
    const body = new URLSearchParams(String(init?.body))
    expect(body.get('grant_type')).toBe('authorization_code')
    expect(body.get('code')).toBe('code-1')
    expect(body.get('redirect_uri')).toBe(CONFIG.redirectUri)
    expect(body.get('code_verifier')).toBe('verifier-1')
    expect(body.get('client_id')).toBe('client-id')
  })

  it('reads a missing refresh_token as null and a missing expiry as 0', async () => {
    stubFetch(json({ access_token: 'access-1' }))
    const tokens = await exchangeAuthorizationCode(CONFIG, { code: 'c', codeVerifier: 'v' })
    expect(tokens.refreshToken).toBeNull()
    expect(tokens.expiresIn).toBe(0)
  })

  it('refuses an empty access token as a bad response', async () => {
    stubFetch(json({ access_token: '' }))
    await expect(
      exchangeAuthorizationCode(CONFIG, { code: 'c', codeVerifier: 'v' }),
    ).rejects.toMatchObject({ code: 'invalid_response', status: 502 })
  })

  it('surfaces the OAuth error code from a refusal', async () => {
    stubFetch(json({ error: 'invalid_grant', error_description: 'code expired' }, 400))
    const error = await exchangeAuthorizationCode(CONFIG, {
      code: 'c',
      codeVerifier: 'v',
    }).catch((err: unknown) => err)
    expect(error).toBeInstanceOf(CloudflareOAuthError)
    expect(error).toMatchObject({ code: 'invalid_grant', status: 400, message: 'code expired' })
  })

  it('keeps the status when the refusal is not JSON', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('bad gateway', { status: 502 })),
    )
    await expect(
      exchangeAuthorizationCode(CONFIG, { code: 'c', codeVerifier: 'v' }),
    ).rejects.toMatchObject({ code: 'http_error', status: 502 })
  })
})

describe('refreshAccessToken', () => {
  it('sends the refresh grant and keeps a rotated refresh token', async () => {
    const fetchMock = stubFetch(
      json({ access_token: 'access-2', refresh_token: 'refresh-2', expires_in: 3600 }),
    )
    const tokens = await refreshAccessToken(CONFIG, 'refresh-1')
    expect(tokens.accessToken).toBe('access-2')
    expect(tokens.refreshToken).toBe('refresh-2')
    const body = new URLSearchParams(String(fetchMock.mock.calls[0]![1]?.body))
    expect(body.get('grant_type')).toBe('refresh_token')
    expect(body.get('refresh_token')).toBe('refresh-1')
  })

  it('keeps the old refresh token when none comes back', async () => {
    stubFetch(json({ access_token: 'access-2', expires_in: 60 }))
    const tokens = await refreshAccessToken(CONFIG, 'refresh-1')
    expect(tokens.refreshToken).toBeNull()
  })
})

describe('listAuthorizedAccounts', () => {
  it('reads the accounts the grant reaches', async () => {
    const fetchMock = stubFetch(
      json({
        result: [
          { id: 'account-1', name: 'Acme' },
          { id: 'account-2', name: 'Beta' },
          { id: 3, name: 'ignored' },
        ],
      }),
    )
    const accounts = await listAuthorizedAccounts(CONFIG, 'access-1')
    expect(accounts).toEqual([
      { id: 'account-1', name: 'Acme' },
      { id: 'account-2', name: 'Beta' },
    ])
    const [url, init] = fetchMock.mock.calls[0]!
    expect(url).toBe(`${CONFIG.apiBaseUrl}/accounts?per_page=50`)
    expect(init?.headers).toMatchObject({ authorization: 'Bearer access-1' })
  })

  it('refuses a token Cloudflare rejects', async () => {
    stubFetch(json({ error: 'invalid_token' }, 401))
    await expect(listAuthorizedAccounts(CONFIG, 'access-1')).rejects.toMatchObject({
      code: 'invalid_token',
      status: 401,
    })
  })
})

describe('revokeToken', () => {
  it('posts the token with basic auth and the hint its kind needs', async () => {
    const fetchMock = stubFetch(new Response(null, { status: 200 }))
    await revokeToken(CONFIG, 'refresh-1', 'refresh_token')
    const body = new URLSearchParams(String(fetchMock.mock.calls[0]![1]?.body))
    expect(body.get('token')).toBe('refresh-1')
    expect(body.get('token_type_hint')).toBe('refresh_token')
    expect(fetchMock.mock.calls[0]![1]?.headers).toMatchObject({
      authorization: `Basic ${btoa('client-id:client-secret')}`,
    })
  })

  it('throws a refusal for the caller to log', async () => {
    stubFetch(json({ error: 'invalid_token' }, 401))
    await expect(revokeToken(CONFIG, 'access-1')).rejects.toMatchObject({ status: 401 })
  })
})
