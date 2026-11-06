import { describe, expect, it } from 'vitest'
import { contentHash } from '../content-hash.js'

describe('contentHash', () => {
  it('is pinned: file ETags, graph hashes and step manifests all depend on these values', () => {
    // With no input each FNV pass returns its seed unchanged.
    expect(contentHash('')).toBe('811c9dc5deadbeef')
    expect(contentHash('return 1;')).toBe('1dfcb79d1090514b')
  })

  it('is deterministic and 16 hex characters long', () => {
    expect(contentHash('hello world')).toBe(contentHash('hello world'))
    expect(contentHash('hello world')).toMatch(/^[0-9a-f]{16}$/)
  })

  it('tells near-identical inputs apart', () => {
    expect(contentHash('a')).not.toBe(contentHash('b'))
    expect(contentHash('')).not.toBe(contentHash(' '))
    expect(contentHash('ab')).not.toBe(contentHash('ba'))
  })
})
