import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  createTestApp,
  resetStore,
  lastAuthHandlerRequest,
  lastSessionHeaders,
  TEST_PROJECT_ID,
} from './helpers.js'
import { CLIENT_IP_HEADER, PROXY_CLIENT_HEADER, PROXY_SECRET_HEADER } from '../lib/client-ip.js'
import { createAuth } from '../auth/config.js'
import { createLogger } from '../lib/logger.js'

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

  it('hands better-auth the client a proven hop names — and not one from loopback alone', async () => {
    const secret = 's'.repeat(64)
    const instance = createTestApp({
      connectionAddress: (c) => c.req.header(peerHeader),
      clientIpPolicy: { mode: 'proxied', proxySecrets: [secret], trustedProxies: [] },
    })
    await instance.request('/api/auth/sign-in/magic-link', {
      method: 'POST',
      headers: {
        [peerHeader]: '127.0.0.1',
        [PROXY_SECRET_HEADER]: secret,
        [PROXY_CLIENT_HEADER]: '198.51.100.7',
      },
    })
    expect(lastAuthHandlerRequest()?.headers.get(CLIENT_IP_HEADER)).toBe('198.51.100.7')

    // Workflow code on this host: loopback, forwarding headers, no secret.
    await instance.request('/api/auth/sign-in/magic-link', {
      method: 'POST',
      headers: {
        [peerHeader]: '127.0.0.1',
        'x-forwarded-for': '6.6.6.6',
        [PROXY_CLIENT_HEADER]: '6.6.6.6',
      },
    })
    expect(lastAuthHandlerRequest()?.headers.get(CLIENT_IP_HEADER)).toBe('127.0.0.1')
  })

  it('gives better-auth no address rather than a client-chosen one', async () => {
    const instance = createTestApp({ clientIpPolicy: { mode: 'edge', header: 'cf-connecting-ip' } })
    await instance.request('/api/auth/sign-in/magic-link', {
      method: 'POST',
      headers: { [CLIENT_IP_HEADER]: '6.6.6.6' },
    })

    expect(lastAuthHandlerRequest()?.headers.has(CLIENT_IP_HEADER)).toBe(false)
  })

  it('looks sessions up with the resolved address, never a client-sent copy', async () => {
    // getSession is a second way into better-auth: it records and limits on
    // the same header the auth handler does.
    await app().request(`/api/workflows?projectId=${TEST_PROJECT_ID}`, {
      headers: { [peerHeader]: '203.0.113.50', [CLIENT_IP_HEADER]: '6.6.6.6' },
    })
    expect(lastSessionHeaders()?.get(CLIENT_IP_HEADER)).toBe('203.0.113.50')
  })

  it('warns once when it ignores a forwarding header nobody proved', async () => {
    // The upgrade path: a proxy that predates TRUSTED_PROXY_SECRET still
    // sends X-Forwarded-For, and every user silently shares its bucket.
    const logger = createLogger('test')
    const warn = vi.spyOn(logger, 'warn').mockImplementation(() => {})
    const instance = createTestApp({
      connectionAddress: (c) => c.req.header(peerHeader),
      corsOrigin: 'http://localhost:3000',
      logger,
    })
    const hit = (extra: Record<string, string>) =>
      instance.request('/api/health', { headers: { [peerHeader]: '172.18.0.2', ...extra } })

    await hit({})
    expect(warn).not.toHaveBeenCalled()
    await hit({ 'x-forwarded-for': '198.51.100.7' })
    await hit({ 'x-real-ip': '198.51.100.8' })
    expect(warn).toHaveBeenCalledTimes(1)
    expect(warn.mock.calls[0]![0]).toContain('TRUSTED_PROXY_SECRET')
  })

  it('stays quiet when the forwarding header comes from a proven hop', async () => {
    const secret = 's'.repeat(64)
    const logger = createLogger('test')
    const warn = vi.spyOn(logger, 'warn').mockImplementation(() => {})
    const instance = createTestApp({
      connectionAddress: (c) => c.req.header(peerHeader),
      clientIpPolicy: { mode: 'proxied', proxySecrets: [secret], trustedProxies: ['10.0.0.0/8'] },
      corsOrigin: 'http://localhost:3000',
      logger,
    })
    await instance.request('/api/health', {
      headers: {
        [peerHeader]: '172.18.0.2',
        [PROXY_SECRET_HEADER]: secret,
        'x-forwarded-for': '1.1.1.1',
      },
    })
    await instance.request('/api/health', {
      headers: { [peerHeader]: '10.0.0.4', 'x-forwarded-for': '1.1.1.1' },
    })
    expect(warn).not.toHaveBeenCalled()
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
    // Tighter than better-auth's defaults where a request costs something:
    // an email sent to any address, an organization created.
    expect(auth.options.rateLimit?.customRules?.['/sign-in/magic-link']).toEqual({
      window: 60,
      max: 5,
    })
    expect(auth.options.rateLimit?.customRules?.['/organization/create']).toEqual({
      window: 60,
      max: 10,
    })

    const dev = createAuth({
      baseURL: 'http://localhost:8080',
      secret: 's'.repeat(32),
      database: undefined,
      rateLimit: false,
    })
    expect(dev.options.rateLimit?.enabled).toBe(false)
  })
})
