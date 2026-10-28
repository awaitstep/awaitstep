import { describe, expect, it } from 'vitest'
import {
  MAX_SLUG_LENGTH,
  RESERVED_SLUGS,
  SLUG_PATTERN,
  isReservedSlug,
  isValidSlug,
  slugify,
} from '../slugs.js'

describe('SLUG_PATTERN', () => {
  it('accepts lowercase words, digits and inner hyphens', () => {
    for (const slug of ['a', 'v2', 'my-project', 'a-b-c', '101']) {
      expect(SLUG_PATTERN.test(slug), slug).toBe(true)
    }
  })

  it('refuses capitals, spaces, and leading or trailing hyphens', () => {
    for (const slug of ['', 'My-Project', 'my project', '-a', 'a-', 'a_b', 'é']) {
      expect(SLUG_PATTERN.test(slug), slug).toBe(false)
    }
  })
})

describe('isReservedSlug', () => {
  it('names the pages a route already owns at each level', () => {
    expect(isReservedSlug('org', 'dashboard')).toBe(true)
    expect(isReservedSlug('org', 'acme')).toBe(false)
    expect(isReservedSlug('project', 'settings')).toBe(true)
    expect(isReservedSlug('project', 'dashboard')).toBe(false)
    expect(isReservedSlug('workspace', 'settings')).toBe(true)
    expect(isReservedSlug('workspace', 'workflows')).toBe(false)
  })

  it('every reserved slug is itself a well-formed slug', () => {
    for (const list of Object.values(RESERVED_SLUGS)) {
      for (const slug of list) expect(SLUG_PATTERN.test(slug), slug).toBe(true)
    }
  })
})

describe('isValidSlug', () => {
  it('combines the shape, the length cap and the reserved list', () => {
    expect(isValidSlug('project', 'sales')).toBe(true)
    expect(isValidSlug('project', 'settings')).toBe(false)
    expect(isValidSlug('project', 'Sales')).toBe(false)
    expect(isValidSlug('project', 'a'.repeat(MAX_SLUG_LENGTH))).toBe(true)
    expect(isValidSlug('project', 'a'.repeat(MAX_SLUG_LENGTH + 1))).toBe(false)
  })
})

describe('slugify', () => {
  it('lowercases and hyphenates, trimming the ends', () => {
    expect(slugify('My Project!')).toBe('my-project')
    expect(slugify('  Sales & Marketing  ')).toBe('sales-marketing')
    expect(slugify('v2.0')).toBe('v2-0')
  })

  it('is empty when nothing usable is left, unless a fallback is given', () => {
    expect(slugify('!!!')).toBe('')
    expect(slugify('!!!', 'org')).toBe('org')
  })

  it('caps the length so the result always validates, even when the cut lands on a hyphen', () => {
    const slug = slugify('x'.repeat(MAX_SLUG_LENGTH + 20))
    expect(slug).toHaveLength(MAX_SLUG_LENGTH)
    expect(isValidSlug('workspace', slug)).toBe(true)
    const onHyphen = slugify(`${'y'.repeat(MAX_SLUG_LENGTH - 1)} z`)
    expect(onHyphen).toBe('y'.repeat(MAX_SLUG_LENGTH - 1))
    expect(isValidSlug('workspace', onHyphen)).toBe(true)
  })
})
