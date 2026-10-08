import { describe, it, expect } from 'vitest'
import { toBundle, bundleEntry, bundleCodeFiles, validateBundle } from '../bundle.js'
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

describe('validateBundle reserved filenames', () => {
  function bundleWith(path: string, role: 'entry' | 'module' | 'config'): GeneratedBundle {
    return {
      entry: 'worker.ts',
      files: [
        { path: 'worker.ts', source: '', role: 'entry' },
        { path, source: '', role },
      ],
    }
  }

  it.each([
    'package.json',
    'package-lock.json',
    'npm-shrinkwrap.json',
    'tsconfig.json',
    'wrangler.json',
    'wrangler.jsonc',
    'wrangler.toml',
  ])('rejects a code file named %s that the deploy toolchain would interpret', (path) => {
    expect(() => validateBundle(bundleWith(path, 'module'))).toThrow('Reserved toolchain filename')
  })

  it('rejects reserved names at any nesting depth, since Node resolves the nearest package.json', () => {
    expect(() => validateBundle(bundleWith('nodes/package.json', 'module'))).toThrow(
      'Reserved toolchain filename',
    )
  })

  it('rejects reserved names case-insensitively for case-insensitive filesystems', () => {
    expect(() => validateBundle(bundleWith('Package.JSON', 'module'))).toThrow(
      'Reserved toolchain filename',
    )
  })

  it('rejects any code file under a node_modules directory', () => {
    expect(() => validateBundle(bundleWith('node_modules/x/index.ts', 'module'))).toThrow(
      'Reserved toolchain filename',
    )
  })

  it('allows server-authored config-role files to use toolchain names', () => {
    expect(() => validateBundle(bundleWith('wrangler.json', 'config'))).not.toThrow()
  })

  it('allows ordinary module paths', () => {
    expect(() => validateBundle(bundleWith('nodes/fetch_user.ts', 'module'))).not.toThrow()
  })
})
