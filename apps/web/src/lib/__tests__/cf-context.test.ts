import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

/**
 * On Node the web server reaches the API over loopback. The API keys an SSR
 * call on the client the server entry stamped, proven by its per-process
 * secret; a call that drops those headers is keyed on 127.0.0.1 — every user
 * in one rate-limit bucket.
 */

const requestHeaders = new Map<string, string>()
let outsideRequest = false

vi.mock('@tanstack/react-start/server', () => ({
  getRequestHeader: (name: string) => {
    if (outsideRequest) throw new Error('no request in scope')
    return requestHeaders.get(name)
  },
}))

const { apiFetch } = await import('../cf-context')

const calls: { url: string; headers: Headers }[] = []

beforeEach(() => {
  requestHeaders.clear()
  outsideRequest = false
  calls.length = 0
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, headers: new Headers(init?.headers) })
      return new Response('{}')
    }),
  )
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('apiFetch on Node', () => {
  it('forwards the hop proof and the resolved client the server entry stamped', async () => {
    requestHeaders.set('x-awaitstep-proxy', 'proof')
    requestHeaders.set('x-awaitstep-client', '198.51.100.7')

    await apiFetch('/api/auth/organization/list', { headers: { cookie: 'session=1' } })

    expect(calls[0]!.headers.get('x-awaitstep-proxy')).toBe('proof')
    expect(calls[0]!.headers.get('x-awaitstep-client')).toBe('198.51.100.7')
    expect(calls[0]!.headers.get('cookie')).toBe('session=1')
  })

  it('forwards no raw X-Forwarded-For — the API would not believe it anyway', async () => {
    requestHeaders.set('x-forwarded-for', '6.6.6.6')

    await apiFetch('/api/auth/get-session')

    expect(calls[0]!.headers.has('x-forwarded-for')).toBe(false)
    expect(calls[0]!.headers.has('x-awaitstep-proxy')).toBe(false)
  })

  it('still works outside a request', async () => {
    outsideRequest = true

    await apiFetch('/api/health')

    expect(calls).toHaveLength(1)
  })
})
