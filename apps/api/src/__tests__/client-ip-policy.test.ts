import { describe, it, expect } from 'vitest'
import {
  compileClientIpPolicy,
  parseTrustedProxies,
  PROXY_CLIENT_HEADER,
  PROXY_SECRET_HEADER,
  rateLimitKey,
  resolveClientIp,
} from '../lib/client-ip.js'

function headers(values: Record<string, string>) {
  return { header: (name: string) => values[name.toLowerCase()] }
}

const SECRET = 'a'.repeat(64)

const secretOnly = compileClientIpPolicy({
  mode: 'proxied',
  proxySecrets: [SECRET],
  trustedProxies: [],
})
const platform = compileClientIpPolicy({
  mode: 'proxied',
  proxySecrets: [],
  trustedProxies: ['10.0.0.0/8'],
})
const edge = compileClientIpPolicy({ mode: 'edge', header: 'cf-connecting-ip' })

describe('resolveClientIp — proxied (Node)', () => {
  it('keys any caller without proof on its own connection, whatever it claims', () => {
    // The spoof, from a direct client or from workflow code on this host.
    const claims = headers({
      'x-forwarded-for': '1.2.3.4',
      'x-real-ip': '5.6.7.8',
      'cf-connecting-ip': '9.9.9.9',
      [PROXY_CLIENT_HEADER]: '6.6.6.6',
    })
    expect(resolveClientIp(claims, '203.0.113.50', secretOnly)).toBe('203.0.113.50')
    // Loopback is not trusted by address: test sessions and local dev run
    // user code on this host.
    expect(resolveClientIp(claims, '127.0.0.1', secretOnly)).toBe('127.0.0.1')
  })

  it('takes the client a hop names when it proves itself with the secret', () => {
    const req = headers({ [PROXY_SECRET_HEADER]: SECRET, [PROXY_CLIENT_HEADER]: '198.51.100.7' })
    expect(resolveClientIp(req, '127.0.0.1', secretOnly)).toBe('198.51.100.7')
  })

  it('refuses a wrong or partial secret', () => {
    for (const proof of ['', 'b'.repeat(64), SECRET.slice(0, 63), `${SECRET}x`]) {
      const req = headers({ [PROXY_SECRET_HEADER]: proof, [PROXY_CLIENT_HEADER]: '6.6.6.6' })
      expect(resolveClientIp(req, '127.0.0.1', secretOnly), proof).toBe('127.0.0.1')
    }
  })

  it('falls back to the standard headers a proven hop set itself', () => {
    // Traefik: a static header carries the secret; it sets X-Real-IP and
    // appends to X-Forwarded-For on its own.
    expect(
      resolveClientIp(
        headers({ [PROXY_SECRET_HEADER]: SECRET, 'x-real-ip': '198.51.100.8' }),
        '172.18.0.2',
        secretOnly,
      ),
    ).toBe('198.51.100.8')
    expect(
      resolveClientIp(
        headers({ [PROXY_SECRET_HEADER]: SECRET, 'x-forwarded-for': '6.6.6.6, 198.51.100.9' }),
        '172.18.0.2',
        secretOnly,
      ),
    ).toBe('198.51.100.9')
  })

  it('gives no address when a proven hop names nothing usable', () => {
    const req = headers({ [PROXY_SECRET_HEADER]: SECRET, [PROXY_CLIENT_HEADER]: 'nonsense' })
    expect(resolveClientIp(req, '127.0.0.1', secretOnly)).toBe(undefined)
  })

  it('reads X-Forwarded-For right to left from an opted-in platform range', () => {
    // A managed load balancer appends the address it saw.
    const req = headers({ 'x-forwarded-for': '6.6.6.6, 198.51.100.7' })
    expect(resolveClientIp(req, '10.1.2.3', platform)).toBe('198.51.100.7')
    // The same chain from outside the range is just a claim.
    expect(resolveClientIp(req, '203.0.113.9', platform)).toBe('203.0.113.9')
  })

  it('strips ports a balancer writes, in X-Forwarded-For and on the peer', () => {
    expect(
      resolveClientIp(headers({ 'x-forwarded-for': '198.51.100.7:41234' }), '10.0.0.1', platform),
    ).toBe('198.51.100.7')
    expect(
      resolveClientIp(headers({ 'x-forwarded-for': '[2001:db8::1]:443' }), '10.0.0.1', platform),
    ).toBe('2001:db8:0:0:0:0:0:1')
  })

  it('ignores empty and garbage forwarding entries', () => {
    expect(resolveClientIp(headers({ 'x-forwarded-for': ' , ' }), '10.0.0.1', platform)).toBe(
      '10.0.0.1',
    )
    expect(
      resolveClientIp(headers({ 'x-forwarded-for': 'evil, junk' }), '10.0.0.1', platform),
    ).toBe('10.0.0.1')
  })

  it('normalizes IPv4-mapped and bracketed IPv6 peers', () => {
    expect(resolveClientIp(headers({}), '::ffff:203.0.113.5', secretOnly)).toBe('203.0.113.5')
    expect(resolveClientIp(headers({}), '[2001:db8::1]', secretOnly)).toBe('2001:db8:0:0:0:0:0:1')
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

describe('compileClientIpPolicy', () => {
  it('refuses a malformed trusted-proxy entry at startup instead of ignoring it', () => {
    for (const bad of ['172.16.0.0/40', '10.0.0.0/abc', 'caddy', '10.0.0.0/8/1']) {
      expect(
        () => compileClientIpPolicy({ mode: 'proxied', proxySecrets: [], trustedProxies: [bad] }),
        bad,
      ).toThrow(/TRUSTED_PROXIES/)
    }
  })

  it('refuses a short secret', () => {
    expect(() =>
      compileClientIpPolicy({ mode: 'proxied', proxySecrets: ['short'], trustedProxies: [] }),
    ).toThrow(/TRUSTED_PROXY_SECRET/)
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
  it('splits a comma list; validation is the compiler’s', () => {
    expect(parseTrustedProxies('172.16.0.0/12, 10.0.0.5 ,,fd00::/8')).toEqual([
      '172.16.0.0/12',
      '10.0.0.5',
      'fd00::/8',
    ])
    expect(parseTrustedProxies(undefined)).toEqual([])
  })
})
