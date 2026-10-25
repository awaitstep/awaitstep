import { describe, it, expect } from 'vitest'
import {
  LOOPBACK_PROXIES,
  parseTrustedProxies,
  rateLimitKey,
  resolveClientIp,
  type ClientIpPolicy,
} from '../lib/client-ip.js'

function headers(values: Record<string, string>) {
  return { header: (name: string) => values[name.toLowerCase()] }
}

const proxied: ClientIpPolicy = { mode: 'proxied', trustedProxies: [...LOOPBACK_PROXIES] }
const dockerProxy: ClientIpPolicy = {
  mode: 'proxied',
  trustedProxies: [...LOOPBACK_PROXIES, '172.16.0.0/12'],
}
const edge: ClientIpPolicy = { mode: 'edge', header: 'cf-connecting-ip' }

describe('resolveClientIp — proxied (Node)', () => {
  it('keys a direct client on its own connection, whatever headers it sends', () => {
    // The spoof: an attacker reaching :8080 directly claims any address.
    const req = headers({
      'x-forwarded-for': '1.2.3.4',
      'x-real-ip': '5.6.7.8',
      'cf-connecting-ip': '9.9.9.9',
    })
    expect(resolveClientIp(req, '203.0.113.50', proxied)).toBe('203.0.113.50')
  })

  it('reads the client a same-host nginx appended, ignoring what the client prepended', () => {
    // nginx: X-Forwarded-For $proxy_add_x_forwarded_for — the client's own
    // value, then the address nginx saw.
    const req = headers({ 'x-forwarded-for': '6.6.6.6, 198.51.100.7' })
    expect(resolveClientIp(req, '127.0.0.1', proxied)).toBe('198.51.100.7')
  })

  it('walks past every trusted hop — SSR through the web server behind a proxy', () => {
    // client → Caddy (same host) → web server (appends its peer, Caddy) → API
    const req = headers({ 'x-forwarded-for': '198.51.100.7, 127.0.0.1' })
    expect(resolveClientIp(req, '127.0.0.1', proxied)).toBe('198.51.100.7')
  })

  it('trusts a configured proxy network, e.g. a Caddy container', () => {
    const req = headers({ 'x-forwarded-for': '198.51.100.7' })
    expect(resolveClientIp(req, '172.18.0.3', dockerProxy)).toBe('198.51.100.7')
    // Not configured: the proxy itself is the client — throttling, not spoofing.
    expect(resolveClientIp(req, '172.18.0.3', proxied)).toBe('172.18.0.3')
  })

  it('falls back to X-Real-IP only when a trusted peer sends no chain', () => {
    expect(resolveClientIp(headers({ 'x-real-ip': '198.51.100.9' }), '127.0.0.1', proxied)).toBe(
      '198.51.100.9',
    )
    expect(resolveClientIp(headers({}), '127.0.0.1', proxied)).toBe('127.0.0.1')
  })

  it('ignores empty and garbage headers instead of keying on them', () => {
    expect(resolveClientIp(headers({ 'x-forwarded-for': ' , ' }), '127.0.0.1', proxied)).toBe(
      '127.0.0.1',
    )
    expect(
      resolveClientIp(headers({ 'x-forwarded-for': 'evil, not-an-ip' }), '127.0.0.1', proxied),
    ).toBe('127.0.0.1')
    expect(resolveClientIp(headers({ 'x-real-ip': '' }), '127.0.0.1', proxied)).toBe('127.0.0.1')
  })

  it('normalizes IPv4-mapped and bracketed IPv6 peers', () => {
    expect(resolveClientIp(headers({}), '::ffff:203.0.113.5', proxied)).toBe('203.0.113.5')
    expect(resolveClientIp(headers({}), '[2001:db8::1]', proxied)).toBe('2001:db8:0:0:0:0:0:1')
    // A mapped loopback peer is loopback, so it is trusted.
    expect(
      resolveClientIp(headers({ 'x-forwarded-for': '198.51.100.7' }), '::ffff:127.0.0.1', proxied),
    ).toBe('198.51.100.7')
  })

  it('has no address without a peer', () => {
    expect(resolveClientIp(headers({ 'x-forwarded-for': '1.2.3.4' }), undefined, proxied)).toBe(
      undefined,
    )
  })
})

describe('resolveClientIp — edge (Workers)', () => {
  it('trusts the edge header and nothing else', () => {
    expect(
      resolveClientIp(
        headers({ 'cf-connecting-ip': '198.51.100.7', 'x-forwarded-for': '6.6.6.6' }),
        undefined,
        edge,
      ),
    ).toBe('198.51.100.7')
    expect(resolveClientIp(headers({ 'x-forwarded-for': '6.6.6.6' }), undefined, edge)).toBe(
      undefined,
    )
    expect(resolveClientIp(headers({ 'cf-connecting-ip': '' }), undefined, edge)).toBe(undefined)
  })
})

describe('rateLimitKey', () => {
  it('keys IPv4 by address and IPv6 by /64', () => {
    expect(rateLimitKey('203.0.113.5')).toBe('203.0.113.5')
    expect(rateLimitKey('2001:db8:1:2:aaaa::1')).toBe(rateLimitKey('2001:db8:1:2:bbbb::9'))
    expect(rateLimitKey('2001:db8:1:2::1')).not.toBe(rateLimitKey('2001:db8:1:3::1'))
    expect(rateLimitKey(undefined)).toBe('unknown')
  })
})

describe('parseTrustedProxies', () => {
  it('reads a comma list and drops what does not parse', () => {
    expect(parseTrustedProxies('172.16.0.0/12, 10.0.0.5 ,nonsense,,fd00::/8')).toEqual([
      '172.16.0.0/12',
      '10.0.0.5',
      'fd00::/8',
    ])
    expect(parseTrustedProxies(undefined)).toEqual([])
  })
})
