import { MAX_SLUG_LENGTH } from '@awaitstep/ir'
import { describe, expect, it } from 'vitest'
import { availableSlug } from '../available-slug'

describe('availableSlug', () => {
  it('keeps a free base, else steps past siblings and reserved pages', () => {
    expect(availableSlug('workspace', 'ops', () => false)).toBe('ops')
    expect(availableSlug('workspace', 'ops', (s) => s === 'ops')).toBe('ops-2')
    expect(availableSlug('workspace', 'ops', (s) => s === 'ops' || s === 'ops-2')).toBe('ops-3')
    expect(availableSlug('workspace', 'settings', () => false)).toBe('settings-2')
  })

  it('never exceeds the slug cap when suffixing', () => {
    const long = 'a'.repeat(MAX_SLUG_LENGTH)
    const slug = availableSlug('project', long, (s) => s === long)
    expect(slug).toHaveLength(MAX_SLUG_LENGTH)
    expect(slug.endsWith('-2')).toBe(true)
    const hyphenEdge = `${'b'.repeat(MAX_SLUG_LENGTH - 3)}-cc`
    expect(availableSlug('project', hyphenEdge, (s) => s === hyphenEdge)).toBe(
      `${'b'.repeat(MAX_SLUG_LENGTH - 3)}-2`,
    )
  })
})
