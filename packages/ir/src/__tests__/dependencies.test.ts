import { describe, it, expect } from 'vitest'
import {
  validateDependencySpecs,
  assertRegistryDependencies,
  MAX_WORKFLOW_DEPENDENCIES,
} from '../dependencies.js'
import { validateArtifact } from '../validate.js'

describe('validateDependencySpecs', () => {
  it('accepts registry semver ranges and dist-tags', () => {
    expect(
      validateDependencySpecs({
        zod: '^3.24.0',
        '@scope/pkg': '~2.3',
        exact: '1.2.3',
        wildcard: '*',
        tag: 'latest',
        union: '^1.0.0 || ^2.0.0',
        prerelease: '3.0.0-beta.1',
      }),
    ).toEqual([])
  })

  it('rejects file: specs that would read paths on the deploy host', () => {
    const errors = validateDependencySpecs({ loot: 'file:/srv/awaitstep' })
    expect(errors).toHaveLength(1)
    expect(errors[0]!.path).toBe('runtime.dependencies.loot')
  })

  it('rejects URL and git specs that would fetch attacker-chosen hosts', () => {
    for (const spec of [
      'https://attacker.example/payload.tgz',
      'git+https://attacker.example/repo.git',
      'github:attacker/repo',
      'git://attacker.example/repo',
    ]) {
      expect(validateDependencySpecs({ x: spec })).not.toEqual([])
    }
  })

  it('rejects invalid package names', () => {
    expect(validateDependencySpecs({ '../escape': '1.0.0' })).not.toEqual([])
    expect(validateDependencySpecs({ 'UPPER CASE': '1.0.0' })).not.toEqual([])
  })

  it('enforces the dependency count cap', () => {
    const deps = Object.fromEntries(
      Array.from({ length: MAX_WORKFLOW_DEPENDENCIES + 1 }, (_, i) => [`pkg-${i}`, '1.0.0']),
    )
    const errors = validateDependencySpecs(deps)
    expect(errors.some((e) => e.message.includes('Maximum'))).toBe(true)
  })
})

describe('assertRegistryDependencies', () => {
  it('passes registry specs through silently', () => {
    expect(() => assertRegistryDependencies({ zod: '^3.24.0' })).not.toThrow()
  })

  it('throws on non-registry specs before any install could run', () => {
    expect(() => assertRegistryDependencies({ loot: 'file:/etc' })).toThrow(/non-registry/)
  })
})

describe('validateArtifact runtime.dependencies gate', () => {
  const baseIR = {
    irVersion: 2,
    metadata: { name: 'DepGate', version: 1, createdAt: '', updatedAt: '' },
    entryNodeId: 'a',
    nodes: [
      {
        id: 'a',
        type: 'step',
        name: 'Step',
        position: { x: 0, y: 0 },
        version: '1.0.0',
        provider: 'cloudflare',
        data: { code: 'return 1;' },
      },
    ],
    edges: [],
  }

  it('accepts an IR with registry dependency specs', () => {
    const result = validateArtifact({
      ...baseIR,
      runtime: { dependencies: { zod: '^3.24.0' } },
    })
    expect(result.ok).toBe(true)
  })

  it('rejects an IR whose runtime.dependencies carries a file: spec', () => {
    const result = validateArtifact({
      ...baseIR,
      runtime: { dependencies: { loot: 'file:/srv/awaitstep' } },
    })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.errors.some((e) => e.path === 'runtime.dependencies.loot')).toBe(true)
    }
  })

  it('rejects a script IR the same way', () => {
    const result = validateArtifact({
      ...baseIR,
      kind: 'script',
      trigger: { type: 'http' },
      runtime: { dependencies: { x: 'git+https://attacker.example/r.git' } },
    })
    expect(result.ok).toBe(false)
  })
})
