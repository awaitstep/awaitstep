import { afterEach, describe, expect, it, vi } from 'vitest'
import { createPkcePair } from '@awaitstep/provider-cloudflare'
import {
  createCloudflareOAuthStub,
  STUB_ACCOUNTS,
  type CloudflareOAuthStubOptions,
} from '../dev/cloudflare-oauth-stub.js'

const REDIRECT = 'http://api.test/api/oauth/cloudflare/callback'
const CLIENT_ID = 'stub-client-id'
const CLIENT_SECRET = 'stub-client-secret'

function makeStub(overrides: Partial<CloudflareOAuthStubOptions> = {}) {
  return createCloudflareOAuthStub({
    clientId: CLIENT_ID,
    clientSecret: CLIENT_SECRET,
    redirectUri: REDIRECT,
    ...overrides,
  })
}

function basic(): string {
  return `Basic ${btoa(`${CLIENT_ID}:${CLIENT_SECRET}`)}`
}

function form(body: Record<string, string>): RequestInit {
  return {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(body).toString(),
  }
}

async function authorize(stub: ReturnType<typeof makeStub>, challenge: string) {
  const url = new URL('http://stub.test/oauth2/auth')
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('client_id', CLIENT_ID)
  url.searchParams.set('redirect_uri', REDIRECT)
  url.searchParams.set('scope', 'account.read workers-scripts.write offline_access')
  url.searchParams.set('state', 'state-1')
  url.searchParams.set('code_challenge', challenge)
  url.searchParams.set('code_challenge_method', 'S256')
  return stub.request(url.toString())
}

async function approve(
  stub: ReturnType<typeof makeStub>,
  pendingId: string,
  account = STUB_ACCOUNTS[0]!.id,
  decision = 'approve',
) {
  return stub.request(
    'http://stub.test/oauth2/auth',
    form({ pending_id: pendingId, account, decision }),
  )
}

function pendingIdOf(html: string): string {
  const match = /name="pending_id" value="([^"]+)"/.exec(html)
  if (!match?.[1]) throw new Error('the consent page has no pending_id')
  return match[1]
}

async function exchange(
  stub: ReturnType<typeof makeStub>,
  code: string,
  verifier: string,
  redirectUri = REDIRECT,
) {
  return stub.request('http://stub.test/oauth2/token', {
    ...form({
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
      code_verifier: verifier,
    }),
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
      authorization: basic(),
    },
  })
}

/** Runs authorize + approve + exchange and returns the token response body. */
async function tokensFor(stub: ReturnType<typeof makeStub>) {
  const pkce = await createPkcePair()
  const consent = await authorize(stub, pkce.challenge)
  const pendingId = pendingIdOf(await consent.text())
  const callback = await approve(stub, pendingId)
  const location = new URL(callback.headers.get('location')!)
  const res = await exchange(stub, location.searchParams.get('code')!, pkce.verifier)
  expect(res.status).toBe(200)
  return (await res.json()) as {
    access_token: string
    refresh_token: string
    expires_in: number
  }
}

afterEach(() => {
  vi.useRealTimers()
})

describe('Cloudflare OAuth stub: authorize', () => {
  it('shows the scopes and the test accounts', async () => {
    const stub = makeStub()
    const { challenge } = await createPkcePair()
    const res = await authorize(stub, challenge)
    expect(res.status).toBe(200)
    const html = await res.text()
    expect(html).toContain('local test backend')
    expect(html).toContain('account.read')
    expect(html).toContain('offline_access')
    for (const account of STUB_ACCOUNTS) expect(html).toContain(account.name)
    expect(html).toContain('name="pending_id"')
  })

  it('refuses an unregistered redirect URI without redirecting', async () => {
    const stub = makeStub()
    const url = new URL('http://stub.test/oauth2/auth')
    url.searchParams.set('response_type', 'code')
    url.searchParams.set('client_id', CLIENT_ID)
    url.searchParams.set('redirect_uri', 'http://evil.test/callback')
    url.searchParams.set('state', 's')
    url.searchParams.set('code_challenge', 'c')
    url.searchParams.set('code_challenge_method', 'S256')
    const res = await stub.request(url.toString())
    expect(res.status).toBe(400)
    expect(res.headers.get('location')).toBeNull()
  })

  it('refuses a missing PKCE challenge', async () => {
    const stub = makeStub()
    const url = new URL('http://stub.test/oauth2/auth')
    url.searchParams.set('response_type', 'code')
    url.searchParams.set('client_id', CLIENT_ID)
    url.searchParams.set('redirect_uri', REDIRECT)
    url.searchParams.set('state', 's')
    const res = await stub.request(url.toString())
    expect(res.status).toBe(400)
  })

  it('sends access_denied back when the user cancels', async () => {
    const stub = makeStub()
    const { challenge } = await createPkcePair()
    const consent = await authorize(stub, challenge)
    const pendingId = pendingIdOf(await consent.text())
    const res = await approve(stub, pendingId, STUB_ACCOUNTS[0]!.id, 'deny')
    expect(res.status).toBe(302)
    const location = new URL(res.headers.get('location')!)
    expect(location.origin + location.pathname).toBe(REDIRECT)
    expect(location.searchParams.get('error')).toBe('access_denied')
    expect(location.searchParams.get('state')).toBe('state-1')
  })
})

describe('Cloudflare OAuth stub: token', () => {
  it('exchanges a code and PKCE verifier for tokens', async () => {
    const stub = makeStub()
    const pkce = await createPkcePair()
    const consent = await authorize(stub, pkce.challenge)
    const pendingId = pendingIdOf(await consent.text())
    const callback = await approve(stub, pendingId)
    const location = new URL(callback.headers.get('location')!)
    const res = await exchange(stub, location.searchParams.get('code')!, pkce.verifier)
    expect(res.status).toBe(200)
    const body = (await res.json()) as Record<string, unknown>
    expect(typeof body.access_token).toBe('string')
    expect(typeof body.refresh_token).toBe('string')
    expect(body.expires_in).toBe(3600)
    expect(body.token_type).toBe('Bearer')
  })

  it('refuses a code replayed a second time', async () => {
    const stub = makeStub()
    const pkce = await createPkcePair()
    const consent = await authorize(stub, pkce.challenge)
    const pendingId = pendingIdOf(await consent.text())
    const callback = await approve(stub, pendingId)
    const code = new URL(callback.headers.get('location')!).searchParams.get('code')!
    expect((await exchange(stub, code, pkce.verifier)).status).toBe(200)
    const replay = await exchange(stub, code, pkce.verifier)
    expect(replay.status).toBe(400)
    await expect(replay.json()).resolves.toMatchObject({ error: 'invalid_grant' })
  })

  it('refuses a verifier that does not match the challenge', async () => {
    const stub = makeStub()
    const pkce = await createPkcePair()
    const consent = await authorize(stub, pkce.challenge)
    const pendingId = pendingIdOf(await consent.text())
    const callback = await approve(stub, pendingId)
    const code = new URL(callback.headers.get('location')!).searchParams.get('code')!
    const res = await exchange(stub, code, 'not-the-verifier')
    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toMatchObject({ error: 'invalid_grant' })
  })

  it('refuses a different redirect URI at exchange time', async () => {
    const stub = makeStub()
    const pkce = await createPkcePair()
    const consent = await authorize(stub, pkce.challenge)
    const pendingId = pendingIdOf(await consent.text())
    const callback = await approve(stub, pendingId)
    const code = new URL(callback.headers.get('location')!).searchParams.get('code')!
    const res = await exchange(stub, code, pkce.verifier, 'http://api.test/other')
    expect(res.status).toBe(400)
  })

  it('refuses an expired code', async () => {
    const stub = makeStub()
    const pkce = await createPkcePair()
    const consent = await authorize(stub, pkce.challenge)
    const pendingId = pendingIdOf(await consent.text())
    const callback = await approve(stub, pendingId)
    const code = new URL(callback.headers.get('location')!).searchParams.get('code')!

    vi.useFakeTimers()
    vi.setSystemTime(Date.now() + 11 * 60_000)
    const res = await exchange(stub, code, pkce.verifier)
    expect(res.status).toBe(400)
  })

  it('requires client authentication', async () => {
    const stub = makeStub()
    const res = await stub.request(
      'http://stub.test/oauth2/token',
      form({
        grant_type: 'authorization_code',
        code: 'nope',
        redirect_uri: REDIRECT,
        code_verifier: 'nope',
      }),
    )
    expect(res.status).toBe(401)
    await expect(res.json()).resolves.toMatchObject({ error: 'invalid_client' })
  })

  it('accepts client_secret_post credentials', async () => {
    const stub = makeStub()
    const pkce = await createPkcePair()
    const consent = await authorize(stub, pkce.challenge)
    const pendingId = pendingIdOf(await consent.text())
    const callback = await approve(stub, pendingId)
    const code = new URL(callback.headers.get('location')!).searchParams.get('code')!
    const res = await stub.request(
      'http://stub.test/oauth2/token',
      form({
        grant_type: 'authorization_code',
        code,
        redirect_uri: REDIRECT,
        code_verifier: pkce.verifier,
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
      }),
    )
    expect(res.status).toBe(200)
  })

  it('rotates a refresh token and refuses the old one', async () => {
    const stub = makeStub()
    const tokens = await tokensFor(stub)
    const refresh = await stub.request('http://stub.test/oauth2/token', {
      ...form({ grant_type: 'refresh_token', refresh_token: tokens.refresh_token }),
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
        authorization: basic(),
      },
    })
    expect(refresh.status).toBe(200)
    const rotated = (await refresh.json()) as { access_token: string; refresh_token: string }
    expect(rotated.access_token).not.toBe(tokens.access_token)
    expect(rotated.refresh_token).not.toBe(tokens.refresh_token)

    const replay = await stub.request('http://stub.test/oauth2/token', {
      ...form({ grant_type: 'refresh_token', refresh_token: tokens.refresh_token }),
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
        authorization: basic(),
      },
    })
    expect(replay.status).toBe(400)
  })

  it('refuses an unsupported grant', async () => {
    const stub = makeStub()
    const res = await stub.request('http://stub.test/oauth2/token', {
      ...form({ grant_type: 'client_credentials' }),
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
        authorization: basic(),
      },
    })
    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toMatchObject({ error: 'unsupported_grant_type' })
  })
})

describe('Cloudflare OAuth stub: accounts and revoke', () => {
  it('answers the account the consent picked, and only it', async () => {
    const stub = makeStub()
    const tokens = await tokensFor(stub)
    const res = await stub.request('http://stub.test/client/v4/accounts', {
      headers: { authorization: `Bearer ${tokens.access_token}` },
    })
    expect(res.status).toBe(200)
    const body = (await res.json()) as { result: { id: string; name: string }[] }
    expect(body.result).toEqual([STUB_ACCOUNTS[0]])
  })

  it('answers one account by id, and refuses another', async () => {
    const stub = makeStub()
    const tokens = await tokensFor(stub)
    const mine = await stub.request(`http://stub.test/client/v4/accounts/${STUB_ACCOUNTS[0]!.id}`, {
      headers: { authorization: `Bearer ${tokens.access_token}` },
    })
    expect(mine.status).toBe(200)
    const other = await stub.request(
      `http://stub.test/client/v4/accounts/${STUB_ACCOUNTS[1]!.id}`,
      { headers: { authorization: `Bearer ${tokens.access_token}` } },
    )
    expect(other.status).toBe(403)
  })

  it('refuses a missing or expired token', async () => {
    const stub = makeStub()
    expect((await stub.request('http://stub.test/client/v4/accounts')).status).toBe(401)

    const tokens = await tokensFor(stub)
    vi.useFakeTimers()
    vi.setSystemTime(Date.now() + 2 * 3600_000)
    const expired = await stub.request('http://stub.test/client/v4/accounts', {
      headers: { authorization: `Bearer ${tokens.access_token}` },
    })
    expect(expired.status).toBe(401)
  })

  it('revokes an access token', async () => {
    const stub = makeStub()
    const tokens = await tokensFor(stub)
    const revoke = await stub.request(
      'http://stub.test/oauth2/revoke',
      form({ token: tokens.access_token }),
    )
    expect(revoke.status).toBe(200)
    const after = await stub.request('http://stub.test/client/v4/accounts', {
      headers: { authorization: `Bearer ${tokens.access_token}` },
    })
    expect(after.status).toBe(401)
  })
})
