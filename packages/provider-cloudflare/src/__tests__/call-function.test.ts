import { describe, expect, it, vi } from 'vitest'
import { CALL_MAX_BYTES, NOT_CALLABLE, callFunction, isCallableUrl } from '../call-function.js'

// Calling a deployment's URL from the server (24i): https on a host name,
// never followed through a redirect, time- and size-bounded. Whether the
// name resolves to a private address is the injected fetch's to refuse.

describe('isCallableUrl', () => {
  it('takes a workers.dev address, a route’s URL and a custom domain', () => {
    expect(isCallableUrl('https://awaitstep-abc.acme.workers.dev')).toBe(true)
    expect(isCallableUrl('https://awaitstep-abc.acme.workers.dev/path?x=1')).toBe(true)
    expect(isCallableUrl('https://wf.99listed.com/v1/2026/amce/')).toBe(true)
    expect(isCallableUrl('https://api.acme.com/')).toBe(true)
  })

  it('passes the headers it is given along with the content type', async () => {
    const fetcher = vi.fn(async () => new Response('{}', { status: 200 }))
    await callFunction(
      { url: 'https://wf.acme.com/', body: '{}', headers: { 'x-awaitstep-instance-id': 'run-1' } },
      fetcher as unknown as typeof fetch,
    )
    const [, init] = fetcher.mock.calls[0] as unknown as [string, RequestInit]
    expect(init.headers).toEqual({
      'x-awaitstep-instance-id': 'run-1',
      'content-type': 'application/json',
    })
  })

  it('refuses anything a user could point at another host', () => {
    for (const url of [
      'http://awaitstep-abc.acme.workers.dev',
      'https://169.254.169.254/latest',
      'https://10.0.0.1/',
      'https://[::1]/',
      'https://localhost/',
      'https://intranet/',
      'https://api.localhost/',
      'https://db.internal/',
      'https://printer.local/',
      'https://user:pw@a.workers.dev',
      'https://a.workers.dev:8443',
      'https://wf.acme.com.:443/',
      'https://*.acme.com',
      'https://wf.acme.com/v1/*/x',
      'not a url',
    ]) {
      expect(isCallableUrl(url), url).toBe(false)
    }
  })
})

describe('callFunction', () => {
  it('POSTs the body as JSON and answers status, time and body', async () => {
    const fetcher = vi.fn(
      async () =>
        new Response('{"city":"Paris"}', {
          status: 200,
          statusText: 'OK',
          headers: { 'content-type': 'application/json' },
        }),
    )
    const result = await callFunction(
      { url: 'https://fn.acme.workers.dev', body: '{"address":"12 Rue de Rivoli"}' },
      fetcher as unknown as typeof fetch,
    )
    expect(result).toMatchObject({
      ok: true,
      status: 200,
      contentType: 'application/json',
      body: '{"city":"Paris"}',
      truncated: false,
    })
    const [, init] = fetcher.mock.calls[0] as unknown as [string, RequestInit]
    expect(init.method).toBe('POST')
    expect(init.redirect).toBe('manual')
    expect(init.body).toBe('{"address":"12 Rue de Rivoli"}')
    expect(init.headers).toEqual({ 'content-type': 'application/json' })
  })

  it('sends the body with the content type it came with', async () => {
    const fetcher = vi.fn(async () => new Response('ok'))
    await callFunction(
      { url: 'https://fn.acme.workers.dev', body: 'a=1', contentType: 'text/plain' },
      fetcher as unknown as typeof fetch,
    )
    const [, init] = fetcher.mock.calls[0] as unknown as [string, RequestInit]
    expect(init.headers).toEqual({ 'content-type': 'text/plain' })
  })

  it('refuses a URL it won’t call, without calling it', async () => {
    const fetcher = vi.fn()
    expect(
      await callFunction(
        { url: 'https://10.0.0.5/run', body: '{}' },
        fetcher as unknown as typeof fetch,
      ),
    ).toEqual({ ok: false, kind: 'refused', reason: NOT_CALLABLE })
    expect(fetcher).not.toHaveBeenCalled()
  })

  it('cuts a long answer at the cap and says so', async () => {
    const big = 'x'.repeat(CALL_MAX_BYTES + 500)
    const result = await callFunction(
      { url: 'https://fn.acme.workers.dev', body: '{}' },
      (async () => new Response(big)) as unknown as typeof fetch,
    )
    expect(result.ok && result.body.length).toBe(CALL_MAX_BYTES)
    expect(result.ok && result.truncated).toBe(true)
  })

  it('says it got no answer when the call times out or can’t connect', async () => {
    const timeout = Object.assign(new Error('timed out'), { name: 'TimeoutError' })
    expect(
      await callFunction({ url: 'https://fn.acme.workers.dev', body: '{}' }, (async () => {
        throw timeout
      }) as unknown as typeof fetch),
    ).toEqual({ ok: false, kind: 'failed', reason: 'The function didn’t answer within 30 s.' })
    expect(
      await callFunction({ url: 'https://fn.acme.workers.dev', body: '{}' }, (async () => {
        throw new TypeError('fetch failed')
      }) as unknown as typeof fetch),
    ).toMatchObject({ ok: false, kind: 'failed', reason: 'Couldn’t reach the function.' })
  })

  it('gives up on an answer whose body never finishes', async () => {
    const stalled = (async (_url: string, init: RequestInit) => {
      // Like a real fetch: the request's signal ends the body stream too.
      const body = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new TextEncoder().encode('{"partial":'))
          init.signal?.addEventListener('abort', () => controller.error(init.signal?.reason))
        },
      })
      return new Response(body)
    }) as unknown as typeof fetch
    expect(
      await callFunction({ url: 'https://fn.acme.workers.dev', body: '{}' }, stalled, 30),
    ).toMatchObject({ ok: false, kind: 'failed', reason: 'The function didn’t answer within 0 s.' })
  })
})
