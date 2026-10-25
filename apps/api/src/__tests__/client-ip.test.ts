import { describe, it, expect, beforeEach } from 'vitest'
import { createTestApp, resetStore, lastAuthHandlerRequest, TEST_PROJECT_ID } from './helpers.js'
import { CLIENT_IP_HEADER } from '../lib/client-ip.js'
import { createAuth } from '../auth/config.js'

/**
 * Who the client is, end to end: the rate limiters' key and the address
 * better-auth records and limits on. Tests have no socket, so the address the
 * entry point would read off the connection is carried in a test-only header.
 */
const peerHeader = 'x-test-peer'

function app() {
  return createTestApp({ connectionAddress: (c) => c.req.header(peerHeader) })
}

describe('client address', () => {
  beforeEach(() => resetStore())

  it('keys a direct client on its connection, however it rotates forwarding headers', async () => {
    // The spoof: a fresh X-Forwarded-For / CF-Connecting-IP on every request
    // used to mean a fresh bucket every time.
    const instance = app()
    const hit = (peer: string, i: number) =>
      instance.request(`/api/workflows?projectId=${TEST_PROJECT_ID}`, {
        headers: {
          [peerHeader]: peer,
          'x-forwarded-for': `10.9.${i % 250}.${i % 200}`,
          'cf-connecting-ip': `10.8.${i % 250}.1`,
        },
      })

    for (let i = 0; i < 200; i++) {
      expect((await hit('203.0.113.50', i)).status, `request ${i}`).not.toBe(429)
    }
    expect((await hit('203.0.113.50', 999)).status).toBe(429)
    // Another client is another bucket.
    expect((await hit('203.0.113.51', 0)).status).not.toBe(429)
  })

  it('hands better-auth the resolved address and drops any copy the client sent', async () => {
    const instance = app()
    await instance.request('/api/auth/sign-in/magic-link', {
      method: 'POST',
      headers: { [peerHeader]: '203.0.113.50', [CLIENT_IP_HEADER]: '6.6.6.6' },
    })

    expect(lastAuthHandlerRequest()?.headers.get(CLIENT_IP_HEADER)).toBe('203.0.113.50')
  })

  it('hands better-auth the client behind a trusted proxy', async () => {
    const instance = app()
    await instance.request('/api/auth/sign-in/magic-link', {
      method: 'POST',
      headers: { [peerHeader]: '127.0.0.1', 'x-forwarded-for': '6.6.6.6, 198.51.100.7' },
    })

    expect(lastAuthHandlerRequest()?.headers.get(CLIENT_IP_HEADER)).toBe('198.51.100.7')
  })

  it('gives better-auth no address rather than a client-chosen one', async () => {
    const instance = createTestApp({ clientIpPolicy: { mode: 'edge', header: 'cf-connecting-ip' } })
    await instance.request('/api/auth/sign-in/magic-link', {
      method: 'POST',
      headers: { [CLIENT_IP_HEADER]: '6.6.6.6' },
    })

    expect(lastAuthHandlerRequest()?.headers.has(CLIENT_IP_HEADER)).toBe(false)
  })
})

describe('better-auth configuration', () => {
  it('reads only the app-resolved address, and limits unless told not to', () => {
    const auth = createAuth({
      baseURL: 'http://localhost:8080',
      secret: 's'.repeat(32),
      database: undefined,
    })
    expect(auth.options.advanced?.ipAddress?.ipAddressHeaders).toEqual([CLIENT_IP_HEADER])
    expect(auth.options.rateLimit?.enabled).toBe(true)

    const dev = createAuth({
      baseURL: 'http://localhost:8080',
      secret: 's'.repeat(32),
      database: undefined,
      rateLimit: false,
    })
    expect(dev.options.rateLimit?.enabled).toBe(false)
  })
})
