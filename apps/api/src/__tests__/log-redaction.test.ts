import { afterEach, describe, expect, it, vi } from 'vitest'
import { CloudflareApiError } from '@awaitstep/provider-cloudflare'
import { redactText, redactValue } from '../lib/log-redaction.js'
import { createLogger } from '../lib/logger.js'

// A log line reaches the console and, when set, Better Stack: nothing in it
// may identify a provider account or work as a credential.

const ACCOUNT = '0123456789abcdef0123456789abcdef'

afterEach(() => vi.restoreAllMocks())

// What the logger printed, as one string.
function printed(spy: { mock: { calls: unknown[][] } }): string {
  return JSON.stringify(spy.mock.calls)
}

describe('redactText', () => {
  it('takes the account out of a Cloudflare path', () => {
    expect(redactText(`Could not route to /client/v4/accounts/${ACCOUNT}/workflows/x`)).toBe(
      'Could not route to /client/v4/accounts/[account]/workflows/x',
    )
  })

  it.each([
    ['an API key', 'key ask_q5AbCdEf123 used', 'key ask_[redacted] used'],
    ['a Bearer token', 'Authorization: Bearer abc.def-123', 'Authorization: Bearer [redacted]'],
    ['a JWT', 'jwt eyJhbGciOi.eyJzdWIiOjF9.c2lnbmF0dXJl x', 'jwt [jwt] x'],
    ['a token in a query', 'GET /cb?code=abc123&state=s', 'GET /cb?code=[redacted]&state=s'],
    ['a 32-hex id', `zone ${ACCOUNT} gone`, 'zone [id] gone'],
    ['a long opaque token', `t ${'Ab1_'.repeat(10)} end`, 't [redacted] end'],
    [
      'a secret in JSON text',
      '{"apiToken":"tok-1","name":"x"}',
      '{"apiToken":"[redacted]","name":"x"}',
    ],
  ])('redacts %s', (_, input, output) => {
    expect(redactText(input)).toBe(output)
  })

  it('masks an email address to its first letter and domain', () => {
    expect(redactText('Magic link for ama@acme.test not sent')).toBe(
      'Magic link for a…@acme.test not sent',
    )
  })

  it('keeps AwaitStep’s ids, a provider instance id and a worker name', () => {
    const line =
      'run aFJ_f68zKxWmKEUSOYd95 instance 0bc058e5-2a3b-4c5d-8e9f-0123456789ab worker awaitstep-afj-f68zkxwmkeusoyd95 req HhjL43eP1wWHXhf5lYSN0'
    expect(redactText(line)).toBe(line)
  })
})

describe('redactValue', () => {
  it('replaces values under secret-named keys, at any depth', () => {
    expect(
      redactValue({
        credentials: { accountId: ACCOUNT, apiToken: 't' },
        nested: { authorization: 'Bearer abc', list: [{ refreshToken: 'r' }] },
        workflowId: 'wf-1',
      }),
    ).toEqual({
      credentials: '[redacted]',
      nested: { authorization: '[redacted]', list: [{ refreshToken: '[redacted]' }] },
      workflowId: 'wf-1',
    })
  })

  it('redacts an error’s message, stack and cause', () => {
    const cause = new Error(`fetch /accounts/${ACCOUNT}/workers failed`)
    const error = new Error('deploy failed', { cause })
    const out = JSON.stringify(redactValue(error))
    expect(out).not.toContain(ACCOUNT)
    expect(out).toContain('/accounts/[account]/workers')
  })

  it('logs a circular object without throwing', () => {
    const a: Record<string, unknown> = { name: 'a' }
    a.self = a
    expect(redactValue(a)).toEqual({ name: 'a', self: '[circular]' })
  })
})

describe('the logger', () => {
  it('prints no account id from a Cloudflare error, in its message or stack', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    createLogger('t').error(
      'Provider refused to start a run',
      new CloudflareApiError(`Could not route to /client/v4/accounts/${ACCOUNT}/workflows`, 404),
    )
    const out = printed(spy)
    expect(out).not.toContain(ACCOUNT)
    expect(out).toContain('/accounts/[account]/workflows')
  })

  it('prints neither credential nor email from the data, and keeps the run id', () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    createLogger('t').warn('Refresh failed for ama@acme.test', {
      runId: 'aFJ_f68zKxWmKEUSOYd95',
      credentials: { apiToken: 'secret-token-value' },
    })
    const out = printed(spy)
    expect(out).not.toContain('secret-token-value')
    expect(out).not.toContain('ama@acme.test')
    expect(out).toContain('a…@acme.test')
    expect(out).toContain('aFJ_f68zKxWmKEUSOYd95')
  })

  it('sends Better Stack the redacted line', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null))
    createLogger('t', { sourceToken: 'bs', endpoint: 'https://logs.example' }).error(
      `boom /accounts/${ACCOUNT}/x`,
      { apiToken: 'tok' },
    )
    const body = String((fetchSpy.mock.calls[0]![1] as RequestInit).body)
    expect(body).not.toContain(ACCOUNT)
    expect(body).not.toContain('"tok"')
  })

  it('logs a link LOG_EMAIL_LINKS asks for as is', () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const link = 'Magic link for ama@acme.test: https://app/api/auth/magic-link/verify?token=abc123'
    createLogger('t').warnAsIs(link)
    expect(printed(spy)).toContain(link)
  })
})

describe('the request log line', () => {
  it('redacts a token in the query, as a sign-in link carries one', async () => {
    const { createTestApp } = await import('./helpers.js')
    const spy = vi.spyOn(console, 'log').mockImplementation(() => undefined)
    await createTestApp().request('/api/health?token=abc123secret&next=/x')
    const out = printed(spy)
    expect(out).toContain('token=[redacted]')
    expect(out).not.toContain('abc123secret')
  })
})

describe('after review', () => {
  it('stays fast on a long run a caller chose (dots, `%2`)', () => {
    for (const text of ['a.'.repeat(32_000), 'a%2'.repeat(20_000)]) {
      const started = performance.now()
      redactText(text)
      expect(performance.now() - started).toBeLessThan(200)
    }
  })

  it('cuts a very long string before redacting it', () => {
    const out = redactText(`${'x '.repeat(10_000)}200 4ms`)
    expect(out).toMatch(/… \[\d+ cut\] …/)
    expect(out.endsWith('200 4ms')).toBe(true)
  })

  it('keeps the line’s own message when the data is an error, the error under `error`', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    createLogger('t').error('Provider deploy threw (request r1, workflow wf1)', new Error('boom'))
    const line = spy.mock.calls[0]![0] as { message: string; error: { message: string } }
    expect(line.message).toBe('Provider deploy threw (request r1, workflow wf1)')
    expect(line.error.message).toBe('boom')
  })

  it('keeps an error’s own status and code, withholding secret-named fields', () => {
    const error = Object.assign(new Error('refused'), { status: 404, code: 10200, apiToken: 't' })
    expect(redactValue(error)).toMatchObject({ status: 404, code: 10200, apiToken: '[redacted]' })
  })

  it.each([
    ['a worker name', 'awaitstep-afj-68zkxwmkeusoyd95'],
    ['a dev worker name', 'awaitstep-dev-afj-68zkxwmkeusoyd95x'],
    ['a digest', 'expected sha256:' + 'ab12'.repeat(16)],
    ['a long code identifier', 'at createWorkflowContextWithPlatformHostFactory (x.js:1:2)'],
    ['prose with “basic”', 'the basic plan'],
    ['an exit code', 'exit code=1'],
  ])('keeps %s', (_, text) => {
    expect(redactText(text)).toBe(text)
  })

  it.each([
    ['a Bearer value, not the next line', 'Bearer abcdef123456\nnext', 'Bearer [redacted]\nnext'],
    ['client_secret=', 'client_secret=s3cr3tvalue&x=1', 'client_secret=[redacted]&x=1'],
    ['escaped JSON', '{\\"apiToken\\":\\"tok-1234\\"}', '{\\"apiToken\\":"[redacted]"}'],
    ['a URL-encoded email', 'to=ama%40acme.test', 'to=a…@acme.test'],
    [
      'a password in a URL',
      'postgres://user:hunter2@db:5432/x',
      'postgres://user:[redacted]@db:5432/x',
    ],
    [
      'a workers.dev subdomain',
      'https://fn.acme-team.workers.dev/',
      'https://fn.[account].workers.dev/',
    ],
  ])('redacts %s', (_, input, output) => {
    expect(redactText(input)).toBe(output)
  })

  it('withholds keys that end in a secret’s name, and keeps a boolean under one', () => {
    expect(
      redactValue({ sessionToken: 's', webhookSecret: 'w', 'x-api-key': 'k', refreshToken: true }),
    ).toEqual({
      sessionToken: '[redacted]',
      webhookSecret: '[redacted]',
      'x-api-key': '[redacted]',
      refreshToken: true,
    })
  })

  it('logs dates, URLs, maps, bytes and a value met twice as they read', () => {
    const shared = { n: 1 }
    expect(
      redactValue({
        at: new Date('2026-11-22T00:00:00.000Z'),
        url: new URL(`https://api.cloudflare.com/client/v4/accounts/${ACCOUNT}/x`),
        map: new Map([['authorization', 'Bearer abcdefgh123']]),
        bytes: new Uint8Array(3),
        a: shared,
        b: shared,
      }),
    ).toEqual({
      at: '2026-11-22T00:00:00.000Z',
      url: 'https://api.cloudflare.com/client/v4/accounts/[account]/x',
      map: { authorization: '[redacted]' },
      bytes: '[3 bytes]',
      a: { n: 1 },
      b: { n: 1 },
    })
  })

  it('never throws on a throwing getter', () => {
    const value = Object.defineProperty({}, 'boom', {
      enumerable: true,
      get() {
        throw new Error('no')
      },
    })
    expect(redactValue(value)).toEqual({ boom: '[unreadable]' })
  })

  it('sends better-auth’s own lines through the redacting logger', async () => {
    const { betterAuthLogger } = await import('../auth/config.js')
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    betterAuthLogger.log(
      'error',
      'Failed to create verification',
      new Error('Failed query: insert …\nparams: ama@acme.test,AbCdEf0123456789AbCdEf0123456789x'),
    )
    const out = printed(spy)
    expect(out).not.toContain('ama@acme.test')
    expect(out).not.toContain('AbCdEf0123456789AbCdEf0123456789x')
  })

  it('logs only a link line as is: other notes stay redacted with LOG_EMAIL_LINKS on', async () => {
    const { createAppEmails } = await import('../lib/email.js')
    const log = vi.fn()
    const logLink = vi.fn()
    const emails = createAppEmails({
      webUrl: 'https://app',
      service: null,
      logLinks: true,
      log,
      logLink,
    })
    await emails.sendInvitation({
      to: 'ama@acme.test',
      orgName: 'Acme',
      url: 'https://app/invite/x',
    } as never)
    expect(logLink).toHaveBeenCalledTimes(1)
    expect(log).not.toHaveBeenCalled()
  })
})

describe('after the security review', () => {
  it('keeps a long request line’s status and timing', async () => {
    const { createTestApp } = await import('./helpers.js')
    const spy = vi.spyOn(console, 'log').mockImplementation(() => undefined)
    await createTestApp().request(`/api/health?${'a=b&'.repeat(2_500)}`)
    // The second line is the answer's; its status is coloured: `\x1b[32m200\x1b[0m 3ms`.
    // eslint-disable-next-line no-control-regex -- the colour codes are what is stripped
    const done = String(spy.mock.calls.at(-1)?.[0] ?? '').replace(/\x1b\[\d+m/g, '')
    expect(done).toMatch(/ \d{3} \d+m?s$/)
  })

  it.each([
    [
      'a standard-base64 blob',
      `v=${'T3k5Tv/PQS43ppk8truGX2vCSZxJ+abGIQc5tn3qr4kPiM'}==`,
      'v=[redacted]',
    ],
    [
      'a lowercase bearer',
      'authorization: bearer abcdefgh1234',
      'authorization: bearer [redacted]',
    ],
    ['a Token header', 'Authorization: Token abcdefgh1234', 'Authorization: Token [redacted]'],
    ['an inspected secret', "{ password: 'hunter22' }", "{ password: '[redacted]' }"],
    ['a `name: value` dump', 'refresh_token: abcdef1', 'refresh_token: [redacted]'],
    [
      'other token names',
      'api-key=SECRETabc&auth_token=SECRETdef',
      'api-key=[redacted]&auth_token=[redacted]',
    ],
    [
      'a session cookie',
      'Set-Cookie: better-auth.session_data=abcdef12',
      'Set-Cookie: better-auth.session_data=[redacted]',
    ],
    [
      'a query’s params',
      'Failed query: insert …\nparams: ak_12345678,ama',
      'Failed query: insert …\nparams: [redacted]',
    ],
    ['a URL password with no user', 'redis://:pw123456@h:6379', 'redis://:[redacted]@h:6379'],
    ['a URL password holding @', 'postgres://u:p@ss@db/x', 'postgres://u:[redacted]@db/x'],
    ['a nested encoded token', 'next=%2F%3Ftoken%3DSECRETSECRET', 'next=/?token=[redacted]'],
  ])('redacts %s', (_, input, output) => {
    expect(redactText(input)).toBe(output)
  })

  it.each([
    ['an error code', "code: 'ECONNREFUSED'"],
    ['a word after ask_', 'invitation.ask_again'],
    ['a path', '/api/workflows/aFJ_f68zKxWmKEUSOYd95/runs/HhjL43eP1wWHXhf5lYSN0'],
  ])('keeps %s', (_, text) => {
    expect(redactText(text)).toBe(text)
  })

  it('shows a decoded line break escaped, so it can’t start a log line', () => {
    expect(redactText('a%0Afake')).toBe('a\\x0afake')
  })

  it('withholds more secret-named keys, and functions', () => {
    expect(
      redactValue({ secretKey: 's', accessKey: 'a', auth: 'x', pwd: 'p', toJSON: () => 'raw' }),
    ).toEqual({
      secretKey: '[redacted]',
      accessKey: '[redacted]',
      auth: '[redacted]',
      pwd: '[redacted]',
      toJSON: '[function]',
    })
  })

  it('stops after a budget of values, quickly', () => {
    const wide = Array.from({ length: 50 }, () =>
      Array.from({ length: 200 }, () => 'x'.repeat(100)),
    )
    const started = performance.now()
    const out = JSON.stringify(redactValue(wide))
    expect(out).toContain('[more]')
    expect(performance.now() - started).toBeLessThan(1_000)
  })
})
