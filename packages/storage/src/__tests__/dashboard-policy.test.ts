import { describe, expect, it } from 'vitest'
import {
  createCspNonce,
  dashboardContentSecurityPolicy,
  withDashboardPolicy,
} from '../dashboard-policy.js'

const NONCE = 'AAAAAAAAAAAAAAAAAAAAAA=='

function directives(policy: string): Map<string, string> {
  return new Map(
    policy.split('; ').map((part) => {
      const [name, ...sources] = part.split(' ')
      return [name!, sources.join(' ')]
    }),
  )
}

describe('createCspNonce', () => {
  it('makes a different base64 nonce of 16 random bytes every time', () => {
    const a = createCspNonce()
    const b = createCspNonce()
    expect(a).toMatch(/^[A-Za-z0-9+/]{22}==$/)
    expect(atob(a)).toHaveLength(16)
    expect(a).not.toBe(b)
  })
})

describe('dashboardContentSecurityPolicy', () => {
  it('allows scripts from this origin and the nonce only', () => {
    const policy = directives(dashboardContentSecurityPolicy({ nonce: NONCE }))
    expect(policy.get('script-src')).toBe(`'self' 'nonce-${NONCE}'`)
    expect(policy.get('default-src')).toBe("'self'")
    expect(policy.get('object-src')).toBe("'none'")
    expect(policy.get('base-uri')).toBe("'self'")
    expect(policy.get('form-action')).toBe("'self'")
    expect(policy.get('frame-ancestors')).toBe("'none'")
    expect(policy.get('frame-src')).toBe("'self'")
    expect(policy.get('worker-src')).toBe("'self'")
  })

  it('names exactly the outside origins the browser fetches', () => {
    const policy = directives(dashboardContentSecurityPolicy({ nonce: NONCE }))
    expect(policy.get('connect-src')).toBe(
      "'self' https://data.jsdelivr.com https://cdn.jsdelivr.net",
    )
    expect(policy.get('style-src')).toBe("'self' 'unsafe-inline' https://fonts.googleapis.com")
    expect(policy.get('font-src')).toBe("'self' data: https://fonts.gstatic.com")
  })

  it('keeps the image policy, the configured registry’s origin included', () => {
    const policy = directives(
      dashboardContentSecurityPolicy({
        nonce: NONCE,
        registryUrl: 'https://nodes.example.com:8443/registry',
      }),
    )
    expect(policy.get('img-src')).toBe(
      "'self' data: blob: https://avatars.githubusercontent.com https://lh3.googleusercontent.com https://nodes.example.com:8443",
    )
  })

  it('refuses a nonce that could add sources of its own', () => {
    expect(() => dashboardContentSecurityPolicy({ nonce: "x' 'unsafe-inline" })).toThrow()
    expect(() => dashboardContentSecurityPolicy({ nonce: `${NONCE}; script-src *` })).toThrow()
    expect(() => dashboardContentSecurityPolicy({ nonce: '' })).toThrow()
  })
})

describe('withDashboardPolicy', () => {
  it('puts the nonce it handed the page into the header', async () => {
    let handed = ''
    const response = await withDashboardPolicy((nonce) => {
      handed = nonce
      return new Response(`<script nonce="${nonce}"></script>`, {
        headers: { 'Content-Type': 'text/html' },
      })
    })
    expect(handed).not.toBe('')
    const policy = response.headers.get('Content-Security-Policy')!
    expect(directives(policy).get('script-src')).toBe(`'self' 'nonce-${handed}'`)
    expect(await response.text()).toContain(`nonce="${handed}"`)
  })

  it('hands every response a fresh nonce', async () => {
    const seen = new Set<string>()
    for (let i = 0; i < 5; i++)
      await withDashboardPolicy((nonce) => (seen.add(nonce), new Response()))
    expect(seen.size).toBe(5)
  })

  it('sets the header on a copy, so immutable headers are not a problem', async () => {
    const immutable = Response.redirect('https://example.com/', 302)
    const response = await withDashboardPolicy(() => immutable)
    expect(response.status).toBe(302)
    expect(response.headers.get('Location')).toBe('https://example.com/')
    expect(response.headers.get('Content-Security-Policy')).toContain("script-src 'self'")
  })

  it('leaves a response that states its own policy alone', async () => {
    const response = await withDashboardPolicy(
      () => new Response('', { headers: { 'Content-Security-Policy': 'sandbox allow-scripts' } }),
    )
    expect(response.headers.get('Content-Security-Policy')).toBe('sandbox allow-scripts')
  })

  it('keeps pages out of shared caches, since each carries its own nonce', async () => {
    const response = await withDashboardPolicy(() => new Response('<html></html>'))
    expect(response.headers.get('Cache-Control')).toBe('private, no-store')
  })

  it('leaves caching a response set for itself alone', async () => {
    const response = await withDashboardPolicy(
      () => new Response('', { headers: { 'Cache-Control': 'public, max-age=60' } }),
    )
    expect(response.headers.get('Cache-Control')).toBe('public, max-age=60')
  })

  it('uses the configured registry for node icons', async () => {
    const response = await withDashboardPolicy(() => new Response(), {
      registryUrl: 'https://icons.example.org/r',
    })
    expect(response.headers.get('Content-Security-Policy')).toContain('https://icons.example.org')
  })
})
