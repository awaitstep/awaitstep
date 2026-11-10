import { afterEach, describe, expect, it, vi } from 'vitest'
import { checkCloudflareToken } from '../token-check.js'

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

const ACC = 'a'.repeat(32)
const ACTIVE = json(200, { result: { status: 'active', expires_on: '2026-11-05T13:00:00Z' } })
const REFUSED = json(401, { success: false, errors: [{ code: 1000 }] })

/** Answers by path; anything not listed is a 404. */
function stubCloudflare(answers: Record<string, Response | Error>) {
  const fetchMock = vi.fn((url: string) => {
    const path = url.replace('https://api.cloudflare.com/client/v4', '')
    const answer = answers[path] ?? json(404, {})
    return answer instanceof Error ? Promise.reject(answer) : Promise.resolve(answer.clone())
  })
  vi.stubGlobal('fetch', fetchMock)
  return () => fetchMock.mock.calls.map(([url]) => String(url).replace(/^.*\/v4/, ''))
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('checkCloudflareToken', () => {
  it('reads an active user token with its expiry, asking only about the named account', async () => {
    const paths = stubCloudflare({
      '/user/tokens/verify': ACTIVE,
      [`/accounts/${ACC}`]: json(200, { result: { id: ACC } }),
    })
    await expect(checkCloudflareToken('tok', ACC)).resolves.toEqual({
      status: 'active',
      expiresAt: '2026-11-05T13:00:00.000Z',
      accounts: [],
      accountReachable: true,
    })
    expect(paths()).toEqual(['/user/tokens/verify', `/accounts/${ACC}`])
  })

  it('says a token that can’t read the account doesn’t reach it', async () => {
    stubCloudflare({ '/user/tokens/verify': ACTIVE, [`/accounts/${ACC}`]: json(403, {}) })
    expect((await checkCloudflareToken('tok', ACC)).accountReachable).toBe(false)
  })

  it('verifies an account-owned token at its account when the user endpoint refuses it', async () => {
    const paths = stubCloudflare({
      '/user/tokens/verify': REFUSED,
      [`/accounts/${ACC}/tokens/verify`]: ACTIVE,
    })
    await expect(checkCloudflareToken('tok', ACC)).resolves.toMatchObject({
      status: 'active',
      expiresAt: '2026-11-05T13:00:00.000Z',
      accountReachable: true,
    })
    expect(paths()).toEqual(['/user/tokens/verify', `/accounts/${ACC}/tokens/verify`])
  })

  it('reads a token refused at both endpoints as invalid', async () => {
    stubCloudflare({ '/user/tokens/verify': REFUSED, [`/accounts/${ACC}/tokens/verify`]: REFUSED })
    expect((await checkCloudflareToken('tok', ACC)).status).toBe('invalid')
  })

  it('settles a refusal whose fallback can’t be answered, when asked to', async () => {
    const answers = {
      '/user/tokens/verify': REFUSED,
      [`/accounts/${ACC}/tokens/verify`]: json(503, {}),
    }
    stubCloudflare(answers)
    expect((await checkCloudflareToken('tok', ACC)).status).toBe('unknown')
    stubCloudflare(answers)
    expect((await checkCloudflareToken('tok', ACC, { settleRefusals: true })).status).toBe(
      'invalid',
    )
  })

  it('reads a refused token as invalid when no account is named', async () => {
    const paths = stubCloudflare({ '/user/tokens/verify': REFUSED })
    expect((await checkCloudflareToken('tok')).status).toBe('invalid')
    expect(paths()).toEqual(['/user/tokens/verify'])
  })

  it('lists the accounts only when asked', async () => {
    stubCloudflare({
      '/user/tokens/verify': json(200, { result: { status: 'active' } }),
      '/accounts?per_page=50': json(200, { result: [{ id: ACC, name: 'Acme' }] }),
    })
    await expect(checkCloudflareToken('tok', undefined, { listAccounts: true })).resolves.toEqual({
      status: 'active',
      expiresAt: null,
      accounts: [{ id: ACC, name: 'Acme' }],
      accountReachable: null,
    })
  })

  it('skips the account question when told to', async () => {
    const paths = stubCloudflare({ '/user/tokens/verify': ACTIVE })
    const result = await checkCloudflareToken('tok', ACC, { checkAccount: false })
    expect(result.accountReachable).toBeNull()
    expect(paths()).toEqual(['/user/tokens/verify'])
  })

  it('reads a disabled or expired token as invalid, keeping its expiry', async () => {
    stubCloudflare({
      '/user/tokens/verify': json(200, {
        result: { status: 'expired', expires_on: '2026-10-01T00:00:00Z' },
      }),
    })
    await expect(checkCloudflareToken('tok')).resolves.toEqual({
      status: 'invalid',
      expiresAt: '2026-10-01T00:00:00.000Z',
      accounts: [],
      accountReachable: null,
    })
  })

  it('reads an empty token as invalid without calling Cloudflare', async () => {
    const paths = stubCloudflare({})
    expect((await checkCloudflareToken('')).status).toBe('invalid')
    expect(paths()).toEqual([])
  })

  it('reads an outage, a rate limit or a network error as unknown, not invalid', async () => {
    for (const answer of [json(503, {}), json(429, {}), new Error('ECONNRESET')]) {
      stubCloudflare({ '/user/tokens/verify': answer })
      expect((await checkCloudflareToken('tok', ACC)).status).toBe('unknown')
    }
  })

  it('never puts an unsafe account id in a path', async () => {
    const paths = stubCloudflare({ '/user/tokens/verify': REFUSED })
    expect((await checkCloudflareToken('tok', '../x')).status).toBe('invalid')
    expect(paths()).toEqual(['/user/tokens/verify'])
  })
})

describe('checkCloudflareToken for an OAuth access token', () => {
  const EXPIRES = '2026-11-10T12:00:00.000Z'

  it('reads active when the granted account is still reachable', async () => {
    const paths = stubCloudflare({ [`/accounts/${ACC}`]: json(200, { result: { id: ACC } }) })
    await expect(
      checkCloudflareToken('tok', ACC, { authKind: 'oauth', expiresAt: EXPIRES }),
    ).resolves.toEqual({
      status: 'active',
      expiresAt: EXPIRES,
      accounts: [],
      accountReachable: true,
    })
    expect(paths()).toEqual([`/accounts/${ACC}`])
  })

  it('reads invalid when the grant no longer reaches the account', async () => {
    stubCloudflare({ [`/accounts/${ACC}`]: json(401, {}) })
    await expect(
      checkCloudflareToken('tok', ACC, { authKind: 'oauth', expiresAt: EXPIRES }),
    ).resolves.toEqual({
      status: 'invalid',
      expiresAt: EXPIRES,
      accounts: [],
      accountReachable: false,
    })
  })

  it('reads an outage as unknown, not invalid', async () => {
    for (const answer of [json(503, {}), json(429, {}), new Error('ECONNRESET')]) {
      stubCloudflare({ [`/accounts/${ACC}`]: answer })
      expect(
        (await checkCloudflareToken('tok', ACC, { authKind: 'oauth', expiresAt: EXPIRES })).status,
      ).toBe('unknown')
    }
  })

  it('leaves an expired token refused during a refresh outage unknown', async () => {
    stubCloudflare({ [`/accounts/${ACC}`]: json(401, {}) })
    await expect(
      checkCloudflareToken('tok', ACC, {
        authKind: 'oauth',
        expiresAt: EXPIRES,
        expired: true,
      }),
    ).resolves.toMatchObject({ status: 'unknown' })
  })

  it('reads a 403 as unknown, not a dead grant', async () => {
    stubCloudflare({ [`/accounts/${ACC}`]: json(403, {}) })
    await expect(
      checkCloudflareToken('tok', ACC, { authKind: 'oauth', expiresAt: EXPIRES }),
    ).resolves.toMatchObject({ status: 'unknown' })
  })

  it('probes the account list when no account is named', async () => {
    const paths = stubCloudflare({ '/accounts?per_page=1': json(200, { result: [] }) })
    await expect(
      checkCloudflareToken('tok', undefined, { authKind: 'oauth', expiresAt: EXPIRES }),
    ).resolves.toMatchObject({ status: 'active', accountReachable: null })
    expect(paths()).toEqual(['/accounts?per_page=1'])
  })
})
