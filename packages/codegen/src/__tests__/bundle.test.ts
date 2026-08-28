import { describe, it, expect } from 'vitest'
import { toBundle, bundleEntry, bundleCodeFiles } from '../bundle.js'
import type { GeneratedBundle } from '../types.js'

describe('toBundle', () => {
  it('wraps a legacy artifact as a single-entry bundle', () => {
    const bundle = toBundle({ filename: 'worker.ts', source: 'export {}' })
    expect(bundle).toEqual({
      entry: 'worker.ts',
      files: [{ path: 'worker.ts', source: 'export {}', role: 'entry' }],
    })
  })

  it('carries compiled output through when present', () => {
    const bundle = toBundle({ filename: 'worker.js', source: 'ts', compiled: 'js' })
    expect(bundleEntry(bundle).compiled).toBe('js')
  })
})

describe('bundleEntry', () => {
  it('throws on a bundle whose entry file is missing — a generator bug', () => {
    const broken: GeneratedBundle = { entry: 'gone.ts', files: [] }
    expect(() => bundleEntry(broken)).toThrow('no entry file')
  })
})

describe('bundleCodeFiles', () => {
  it('returns entry and module files, excluding config/meta', () => {
    const bundle: GeneratedBundle = {
      entry: 'worker.ts',
      files: [
        { path: 'worker.ts', source: '', role: 'entry' },
        { path: 'src/nodes/a.ts', source: '', role: 'module' },
        { path: 'wrangler.jsonc', source: '', role: 'config' },
        { path: 'manifest.json', source: '', role: 'meta' },
      ],
    }
    expect(bundleCodeFiles(bundle).map((f) => f.path)).toEqual(['worker.ts', 'src/nodes/a.ts'])
  })
})
