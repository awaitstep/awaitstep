import { describe, expect, it } from 'vitest'
import { PROJECT_IMPORTS_FIELD } from '@awaitstep/ir'
import { buildWorkerPackageJson, hasDependencies } from '../deploy/package-manifest.js'

describe('buildWorkerPackageJson', () => {
  it('always carries the #app import map, even with no dependencies or manifest', () => {
    expect(JSON.parse(buildWorkerPackageJson({ name: 'awaitstep-worker' }))).toEqual({
      name: 'awaitstep-worker',
      private: true,
      type: 'module',
      imports: PROJECT_IMPORTS_FIELD,
    })
  })

  it('adds the resolved dependencies only when there are some', () => {
    const parsed = JSON.parse(buildWorkerPackageJson({ name: 'w', dependencies: { zod: '^4' } }))
    expect(parsed.dependencies).toEqual({ zod: '^4' })
    expect(JSON.parse(buildWorkerPackageJson({ name: 'w', dependencies: {} }))).not.toHaveProperty(
      'dependencies',
    )
  })

  it('merges the honoured fields of a project manifest and forces the deploy invariants', () => {
    const parsed = JSON.parse(
      buildWorkerPackageJson({
        name: 'fallback',
        dependencies: { zod: '^4.0.0', 'node-dep': '1.0.0' },
        manifestSource: JSON.stringify({
          name: 'my-worker',
          version: '2.0.0',
          description: 'd',
          license: 'MIT',
          type: 'commonjs',
          private: false,
          engines: { node: '>=22' },
          imports: { '#utils/*': './utils/*.js', '#app/*': './elsewhere/*.js' },
          dependencies: { zod: '^3.0.0' },
          scripts: { postinstall: 'echo pwned' },
          workspaces: ['packages/*'],
        }),
      }),
    )
    expect(parsed).toEqual({
      name: 'my-worker',
      version: '2.0.0',
      description: 'd',
      license: 'MIT',
      private: true,
      type: 'module',
      engines: { node: '>=22' },
      imports: { '#utils/*': './utils/*.js', ...PROJECT_IMPORTS_FIELD },
      dependencies: { zod: '^4.0.0', 'node-dep': '1.0.0' },
    })
  })

  it('ignores an unparsable manifest', () => {
    expect(JSON.parse(buildWorkerPackageJson({ name: 'w', manifestSource: '{' })).name).toBe('w')
  })
})

describe('hasDependencies', () => {
  it('treats undefined and empty maps as none', () => {
    expect(hasDependencies(undefined)).toBe(false)
    expect(hasDependencies({})).toBe(false)
    expect(hasDependencies({ zod: '*' })).toBe(true)
  })
})
