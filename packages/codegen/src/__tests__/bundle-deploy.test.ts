import { describe, expect, it } from 'vitest'
import {
  bundleDeployFiles,
  bundlePackageManifest,
  projectBundleFiles,
  validateBundle,
} from '../bundle.js'
import type { GeneratedBundle, GeneratedFile } from '../types.js'

function bundleOf(...files: GeneratedFile[]): GeneratedBundle {
  return { entry: 'worker.ts', files: [{ path: 'worker.ts', source: '', role: 'entry' }, ...files] }
}

describe('bundleDeployFiles', () => {
  it('writes code and assets only — never config or meta roles', () => {
    const bundle = bundleOf(
      { path: 'config/env.ts', source: '', role: 'module' },
      { path: 'data/x.json', source: '', role: 'asset' },
      { path: 'tsconfig.json', source: '{}', role: 'config' },
      { path: 'package.json', source: '{}', role: 'meta' },
      { path: 'package-lock.json', source: '{}', role: 'meta' },
      { path: 'wrangler.json', source: '{}', role: 'config' },
    )
    expect(bundleDeployFiles(bundle).map((f) => f.path)).toEqual([
      'worker.ts',
      'config/env.ts',
      'data/x.json',
    ])
    expect(bundlePackageManifest(bundle)).toBe('{}')
  })
})

describe('projectBundleFiles', () => {
  it('assigns roles by path', () => {
    expect(
      projectBundleFiles([
        { path: 'config/env.ts', source: '' },
        { path: 'data/x.json', source: '' },
        { path: 'package.json', source: '{}' },
        { path: 'tsconfig.json', source: '{}' },
      ]).map((f) => `${f.role}:${f.path}`),
    ).toEqual([
      'module:config/env.ts',
      'asset:data/x.json',
      'meta:package.json',
      'config:tsconfig.json',
    ])
  })
})

describe('validateBundle hardening', () => {
  it('rejects toolchain names on assets and anything but the root allowlist for config/meta', () => {
    expect(() =>
      validateBundle(bundleOf({ path: 'config/package.json', source: '{}', role: 'asset' })),
    ).toThrow(/Reserved toolchain filename/)
    for (const [path, role] of [
      ['config/package.json', 'meta'],
      ['node_modules/x.json', 'config'],
      ['package-lock.json', 'meta'],
      ['wrangler.json', 'config'],
    ] as const) {
      expect(
        () => validateBundle(bundleOf({ path, source: '{}', role })),
        `${role}:${path}`,
      ).toThrow(/Config\/meta files are limited to/)
    }
    expect(() =>
      validateBundle(bundleOf({ path: 'package.json', source: '{}', role: 'meta' })),
    ).not.toThrow()
  })

  it('treats case and TypeScript extension variants as the same output path', () => {
    expect(() =>
      validateBundle(bundleOf({ path: 'Worker.js', source: '', role: 'module' })),
    ).toThrow(/collide/)
    expect(() =>
      validateBundle(
        bundleOf(
          { path: 'lib/a.mts', source: '', role: 'module' },
          { path: 'lib/a.mjs', source: '', role: 'module' },
        ),
      ),
    ).toThrow(/collide/)
  })
})
