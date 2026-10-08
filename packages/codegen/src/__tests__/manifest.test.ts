import { describe, it, expect } from 'vitest'
import { contentHash, bundleHash, resolveStepNode } from '../manifest.js'
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

describe('resolveStepNode', () => {
  const manifest = {
    irHash: 'x',
    steps: [
      { nodeId: 'fetch', stepName: 'fetch', kind: 'do' as const, varName: 'Fetch_data' },
      { nodeId: 'nap', stepName: 'nap', kind: 'sleep' as const, varName: 'Nap' },
      { nodeId: 'sub-1', varName: 'Run_child' },
    ],
  }

  it('maps an exact label to its node', () => {
    expect(resolveStepNode(manifest, 'fetch')).toBe('fetch')
    expect(resolveStepNode(manifest, 'nap')).toBe('nap')
  })

  it('strips loop iteration suffixes before matching', () => {
    expect(resolveStepNode(manifest, 'fetch [3]')).toBe('fetch')
  })

  it('maps derived multi-step labels back through the node id', () => {
    expect(resolveStepNode(manifest, 'sub-1--create')).toBe('sub-1')
    expect(resolveStepNode(manifest, 'sub-1--await')).toBe('sub-1')
  })

  it('returns undefined for labels the manifest cannot claim', () => {
    expect(resolveStepNode(manifest, 'unknown-step')).toBeUndefined()
  })
})
