import { describe, it, expect } from 'vitest'
import { contentHash, bundleHash } from '../manifest.js'
import type { GeneratedBundle } from '../types.js'

describe('contentHash', () => {
  it('is deterministic for equal input', () => {
    expect(contentHash('hello world')).toBe(contentHash('hello world'))
  })

  it('differs for different input', () => {
    expect(contentHash('a')).not.toBe(contentHash('b'))
    expect(contentHash('')).not.toBe(contentHash(' '))
  })

  it('emits 16 hex chars', () => {
    expect(contentHash('anything')).toMatch(/^[0-9a-f]{16}$/)
  })
})

describe('bundleHash', () => {
  const bundle = (files: [string, string][]): GeneratedBundle => ({
    entry: 'worker.ts',
    files: files.map(([path, source]) => ({ path, source, role: 'entry' as const })),
  })

  it('ignores file order', () => {
    expect(
      bundleHash(
        bundle([
          ['a.ts', 'x'],
          ['b.ts', 'y'],
        ]),
      ),
    ).toBe(
      bundleHash(
        bundle([
          ['b.ts', 'y'],
          ['a.ts', 'x'],
        ]),
      ),
    )
  })

  it('changes when any file content changes', () => {
    expect(bundleHash(bundle([['a.ts', 'x']]))).not.toBe(bundleHash(bundle([['a.ts', 'x2']])))
  })
})
