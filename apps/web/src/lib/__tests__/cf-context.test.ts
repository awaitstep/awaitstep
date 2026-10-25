import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

/**
 * On Node the web server reaches the API over loopback. The API keys a
 * loopback caller on its X-Forwarded-For chain, so an SSR call that drops the
 * chain is keyed on 127.0.0.1 — every user in one rate-limit bucket.
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
  it('forwards the X-Forwarded-For chain alongside the caller’s headers', async () => {
    requestHeaders.set('x-forwarded-for', '198.51.100.7, 127.0.0.1')

    await apiFetch('/api/auth/organization/list', { headers: { cookie: 'session=1' } })

    expect(calls[0]!.headers.get('x-forwarded-for')).toBe('198.51.100.7, 127.0.0.1')
    expect(calls[0]!.headers.get('cookie')).toBe('session=1')
  })

  it('sends no chain when the request carries none', async () => {
    await apiFetch('/api/auth/get-session', { headers: { cookie: 'session=1' } })

    expect(calls[0]!.headers.has('x-forwarded-for')).toBe(false)
  })

  it('still works outside a request', async () => {
    outsideRequest = true

    await apiFetch('/api/health')

    expect(calls).toHaveLength(1)
  })
})
