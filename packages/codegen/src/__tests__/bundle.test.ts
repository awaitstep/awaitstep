import { describe, it, expect } from 'vitest'
import {
  toBundle,
  bundleEntry,
  bundleCodeFiles,
  bundleDeployFiles,
  projectBundleFiles,
  validateBundle,
} from '../bundle.js'
import { GenerateInputError } from '../errors.js'
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
  function bundleWith(
    path: string,
    role: GeneratedBundle['files'][number]['role'],
  ): GeneratedBundle {
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

  it('limits config/meta roles to the root toolchain files a project may own', () => {
    expect(() => validateBundle(bundleWith('package.json', 'meta'))).not.toThrow()
    expect(() => validateBundle(bundleWith('tsconfig.json', 'config'))).not.toThrow()
    expect(() => validateBundle(bundleWith('jsconfig.json', 'config'))).not.toThrow()
    for (const [path, role] of [
      ['wrangler.json', 'config'],
      ['package-lock.json', 'meta'],
      ['config/package.json', 'meta'],
      ['node_modules/x.json', 'config'],
      ['notes.json', 'meta'],
    ] as const) {
      expect(() => validateBundle(bundleWith(path, role)), `${role}:${path}`).toThrow(
        'Config/meta files are limited to',
      )
    }
  })

  it('allows ordinary module paths', () => {
    expect(() => validateBundle(bundleWith('nodes/fetch_user.ts', 'module'))).not.toThrow()
  })

  it('pins the handlers role to the root handlers.ts', () => {
    expect(() => validateBundle(bundleWith('handlers.ts', 'handlers'))).not.toThrow()
    expect(() => validateBundle(bundleWith('src/handlers.ts', 'handlers'))).toThrow(
      'handlers role belongs to handlers.ts',
    )
  })
})

describe('project file roles', () => {
  const artifact = { filename: 'worker.ts', source: 'export {}' }
  const files = projectBundleFiles([
    { path: 'handlers.ts', source: '@fetch function handler() {}' },
    { path: 'config/env.ts', source: 'export const a = 1' },
    { path: 'package.json', source: '{}' },
    { path: 'data.json', source: '[]' },
  ])

  it('marks handlers.ts as a handlers input, not a module', () => {
    expect(files.map((f) => `${f.role}:${f.path}`)).toEqual([
      'handlers:handlers.ts',
      'module:config/env.ts',
      'meta:package.json',
      'asset:data.json',
    ])
  })

  it('keeps the handlers input out of the deploy', () => {
    const bundle = { entry: 'worker.ts', files: [...toBundle(artifact).files, ...files] }
    expect(bundleDeployFiles(bundle).map((f) => f.path)).toEqual([
      'worker.ts',
      'config/env.ts',
      'data.json',
    ])
  })
})

describe('GenerateInputError', () => {
  it('marks a bundle invariant as the input\u2019s fault, not the generator\u2019s', () => {
    // A caller that reports problems answers these with diagnostics; it
    // rethrows anything else, so a generator bug cannot be blamed on the
    // workflow being checked.
    expect(() =>
      validateBundle({
        entry: 'worker.ts',
        files: [
          { path: 'worker.ts', source: '', role: 'entry' },
          { path: '../escape.ts', source: '', role: 'module' },
        ],
      }),
    ).toThrow(GenerateInputError)
    expect(new GenerateInputError('x')).toBeInstanceOf(Error)
  })

  it('leaves a missing entry as a generator bug, not the workflow\u2019s fault', () => {
    // A bundle without an entry means the generator built one that way,
    // which has to surface as a 500 and a log, not as "your workflow is
    // broken".
    expect(() => validateBundle({ entry: 'missing.ts', files: [] })).toThrow(/no entry file/)
    expect(() => validateBundle({ entry: 'missing.ts', files: [] })).not.toThrow(GenerateInputError)
  })
})
