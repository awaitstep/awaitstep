import { describe, expect, it } from 'vitest'
import config from '../../../astro.config.mjs'
import headers from '../../../public/_headers?raw'

/** The header lines under one path rule in `_headers`. */
function rule(path: string): string[] {
  const lines = (headers as string).split('\n')
  const at = lines.indexOf(path)
  expect(at, `${path} rule`).toBeGreaterThanOrEqual(0)
  const out: string[] = []
  for (const line of lines.slice(at + 1)) {
    if (!line.startsWith('  ')) break
    if (!line.trimStart().startsWith('#')) out.push(line.trim())
  }
  return out
}

describe('the site’s security headers', () => {
  it('sandboxes everything under /_astro/, where registry icons are served as SVG files', () => {
    expect(rule('/_astro/*')).toContain(
      "Content-Security-Policy: default-src 'none'; style-src 'unsafe-inline'; sandbox",
    )
  })

  it('refuses framing and sniffing, and keeps to HTTPS, on every path', () => {
    const all = rule('/*')
    expect(all).toContain('X-Frame-Options: DENY')
    expect(all).toContain('X-Content-Type-Options: nosniff')
    expect(all.some((h) => h.startsWith('Strict-Transport-Security: max-age='))).toBe(true)
  })

  it('gives every page a CSP that runs only the page’s own scripts and loads only from the site', () => {
    const csp = config.security?.csp
    expect(csp).toBeTypeOf('object')
    const directives = typeof csp === 'object' ? (csp.directives ?? []) : []
    expect(directives).toContain("default-src 'self'")
    expect(directives).toContain("object-src 'none'")
    expect(directives).toContain("base-uri 'self'")
    // 'unsafe-inline' on scripts would switch the hashes off.
    expect(typeof csp === 'object' && csp.scriptDirective?.resources).toBeFalsy()
  })
})
