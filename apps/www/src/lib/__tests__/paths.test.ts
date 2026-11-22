import { describe, expect, it } from 'vitest'
import { inlineJson, pagePath } from '../paths'

describe('pagePath', () => {
  it('reads the built home page as the site root', () => {
    expect(pagePath('/index.html')).toBe('/')
    expect(pagePath('/')).toBe('/')
  })

  it('drops the .html the build writes and the slash the dev server adds', () => {
    expect(pagePath('/pricing.html')).toBe('/pricing')
    expect(pagePath('/pricing/')).toBe('/pricing')
    expect(pagePath('/pricing')).toBe('/pricing')
  })

  it('keeps a page whose name only ends in index', () => {
    expect(pagePath('/reindex.html')).toBe('/reindex')
  })
})

describe('inlineJson', () => {
  it('escapes < so the data cannot close its script tag', () => {
    const out = inlineJson({ d: '</script><script>alert(1)</script>' })
    expect(out).not.toContain('<')
    expect(JSON.parse(out)).toEqual({ d: '</script><script>alert(1)</script>' })
  })
})
