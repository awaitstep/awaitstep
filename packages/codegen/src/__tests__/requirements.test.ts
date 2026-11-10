import { describe, expect, it } from 'vitest'
import type { WorkflowIR } from '@awaitstep/ir'
import {
  checkRequirements,
  collectProviderImports,
  collectRuntimeRequirements,
  formatUnsupportedRequirements,
  importSpecifiers,
  mergeRequirements,
  providerFromAwaitstepImport,
  providerFromSpecifier,
  withoutComments,
  type RequirementTarget,
} from '../requirements.js'

function ir(overrides: Partial<WorkflowIR> = {}): WorkflowIR {
  return {
    metadata: { name: 'primitive-test', version: 1, createdAt: '', updatedAt: '' },
    nodes: [],
    edges: [],
    entryNodeId: 'n1',
    ...overrides,
  }
}

const cloudflareTarget: RequirementTarget = {
  name: 'cloudflare',
  supportedBindingKinds: ['kv', 'd1', 'r2', 'queue', 'service', 'workflow'],
}

const inngestTarget: RequirementTarget = {
  name: 'inngest',
  supportedBindingKinds: [],
}

describe('providerFromAwaitstepImport', () => {
  it('reads a provider only from a provider-scoped primitive, not from the generated graph modules', () => {
    expect(providerFromAwaitstepImport('#awaitstep/cloudflare')).toBe('cloudflare')
    expect(providerFromAwaitstepImport('#awaitstep/cloudflare/kv')).toBe('cloudflare')
    expect(providerFromAwaitstepImport('#awaitstep/runtime')).toBeNull()
    expect(providerFromAwaitstepImport('#awaitstep/workflow')).toBeNull()
    expect(providerFromAwaitstepImport('#awaitstep/function')).toBeNull()
    expect(providerFromAwaitstepImport('zod')).toBeNull()
  })
})

describe('providerFromAwaitstepImport', () => {
  it('reads the provider from a provider-scoped primitive import', () => {
    expect(providerFromAwaitstepImport('#awaitstep/cloudflare')).toBe('cloudflare')
    expect(providerFromAwaitstepImport('#awaitstep/inngest/anything')).toBe('inngest')
  })

  it('does not treat the core runtime as a provider requirement', () => {
    expect(providerFromAwaitstepImport('#awaitstep/runtime')).toBeNull()
    expect(providerFromAwaitstepImport('#app/worker')).toBeNull()
  })
})

describe('importSpecifiers', () => {
  it('finds static, side-effect, type-only and dynamic imports', () => {
    const source = `
      import { kv } from '#awaitstep/cloudflare'
      import type { Env } from './env.js'
      import './side-effect.js'
      export * from './reexported.js'
      const runtime = await import('#awaitstep/runtime')
    `
    expect(importSpecifiers(source)).toEqual([
      '#awaitstep/cloudflare',
      './env.js',
      './side-effect.js',
      './reexported.js',
      '#awaitstep/runtime',
    ])
  })
})

describe('collectProviderImports', () => {
  it('returns each provider once with the specifier that introduced it', () => {
    expect(
      collectProviderImports([
        "import { kv } from '#awaitstep/cloudflare'",
        "import { d1 } from '#awaitstep/cloudflare'",
        "import { workflow } from '#awaitstep/runtime'",
        "import { inngest } from '#awaitstep/inngest'",
      ]),
    ).toEqual([
      { provider: 'cloudflare', specifier: '#awaitstep/cloudflare' },
      { provider: 'inngest', specifier: '#awaitstep/inngest' },
    ])
  })
})

describe('collectRuntimeRequirements', () => {
  it('finds a provider import in node code', () => {
    const requirements = collectRuntimeRequirements(
      ir({
        nodes: [
          {
            id: 'n1',
            type: 'step',
            name: 'Read KV',
            version: '1.0.0',
            provider: 'cloudflare',
            data: {
              code: "import { kv } from '#awaitstep/cloudflare'\nreturn kv(env, 'USERS').get('a')",
            },
          },
        ],
      }),
    )
    expect(requirements).toEqual([
      {
        kind: 'provider',
        id: 'cloudflare',
        import: '#awaitstep/cloudflare',
        label: 'cloudflare-only primitives (#awaitstep/cloudflare)',
        nodeId: 'n1',
      },
    ])
  })

  it('finds a provider import in trigger code and in project files', () => {
    const requirements = collectRuntimeRequirements(
      ir({
        runtime: {
          triggerCode: "import { service } from '#awaitstep/cloudflare'",
          files: [{ path: 'lib/kv.ts', source: "export { kv } from '#awaitstep/cloudflare'" }],
        },
      }),
    )
    expect(requirements).toHaveLength(1)
    expect(requirements[0]).toMatchObject({ kind: 'provider', id: 'cloudflare' })
  })

  it('ignores a provider import in a non-code project asset', () => {
    const requirements = collectRuntimeRequirements(
      ir({
        runtime: {
          files: [
            { path: 'README.md', source: "import { kv } from '#awaitstep/cloudflare'" },
            { path: 'data/notes.txt', source: "import { kv } from '#awaitstep/cloudflare'" },
          ],
        },
      }),
    )
    expect(requirements).toEqual([])
  })

  it('ignores a commented-out or type-only provider import', () => {
    const requirements = collectRuntimeRequirements(
      ir({
        nodes: [
          {
            id: 'n1',
            type: 'step',
            name: 'Read KV',
            version: '1.0.0',
            provider: 'cloudflare',
            data: {
              code: [
                "// import { kv } from '#awaitstep/cloudflare'",
                "/* import { d1 } from '#awaitstep/cloudflare' */",
                "import type { KVMetrics } from '#awaitstep/cloudflare'",
                'const x = 1',
              ].join('\n'),
            },
          },
        ],
      }),
    )
    expect(requirements).toEqual([])
  })

  it('does not treat text in a non-code data field as an import', () => {
    const requirements = collectRuntimeRequirements(
      ir({
        nodes: [
          {
            id: 'n1',
            type: 'step',
            name: 'Read KV',
            version: '1.0.0',
            provider: 'cloudflare',
            data: { description: "import { kv } from '#awaitstep/cloudflare'", code: 'return 1' },
          },
        ],
      }),
    )
    expect(requirements).toEqual([])
  })

  it('ignores the core runtime import', () => {
    const requirements = collectRuntimeRequirements(
      ir({
        nodes: [
          {
            id: 'n1',
            type: 'step',
            name: 'Step',
            version: '1.0.0',
            provider: 'cloudflare',
            data: { code: "import { durableStep } from '#awaitstep/runtime'" },
          },
        ],
      }),
    )
    expect(requirements).toEqual([])
  })

  it('turns declared bindings into binding requirements', () => {
    const requirements = collectRuntimeRequirements(
      ir({
        runtime: {
          resources: [
            { name: 'USERS', kind: 'kv' },
            { name: 'DB', kind: 'd1' },
          ],
        },
      }),
    )
    expect(requirements).toEqual([
      { kind: 'binding', id: 'kv', name: 'USERS', label: 'kv "USERS"' },
      { kind: 'binding', id: 'd1', name: 'DB', label: 'd1 "DB"' },
    ])
  })

  it('turns an explicit runtime provider into a provider requirement', () => {
    expect(collectRuntimeRequirements(ir({ runtime: { provider: 'cloudflare' } }))).toEqual([
      { kind: 'provider', id: 'cloudflare', label: 'cloudflare runtime' },
    ])
  })

  it('does not invent a provider for a legacy neutral artifact', () => {
    expect(collectRuntimeRequirements(ir())).toEqual([])
  })
})

describe('mergeRequirements', () => {
  it('keeps the first occurrence of each requirement', () => {
    const merged = mergeRequirements(
      [
        { kind: 'binding', id: 'kv', name: 'USERS', label: 'a' },
        { kind: 'provider', id: 'cloudflare', label: 'b' },
      ],
      [
        { kind: 'binding', id: 'kv', name: 'USERS', label: 'duplicate' },
        { kind: 'binding', id: 'service', name: 'MAIL', label: 'c' },
      ],
    )
    expect(merged.map((r) => r.label)).toEqual(['a', 'b', 'c'])
  })
})

describe('checkRequirements', () => {
  it('accepts Cloudflare primitives and supported bindings on Cloudflare', () => {
    expect(
      checkRequirements(
        [
          { kind: 'provider', id: 'cloudflare', label: 'Cloudflare-only primitives' },
          { kind: 'binding', id: 'kv', name: 'USERS', label: 'kv "USERS"' },
        ],
        cloudflareTarget,
      ),
    ).toEqual([])
  })

  it('refuses a provider primitive on another provider', () => {
    const unsupported = checkRequirements(
      [{ kind: 'provider', id: 'cloudflare', label: 'Cloudflare-only primitives' }],
      inngestTarget,
    )
    expect(unsupported).toEqual([
      {
        requirement: { kind: 'provider', id: 'cloudflare', label: 'Cloudflare-only primitives' },
        reason: 'requires the cloudflare provider',
      },
    ])
  })

  it('accepts a provider runtime scheme through the same provider', () => {
    const target: RequirementTarget = {
      name: 'cloudflare',
      supportedBindingKinds: ['kv'],
      importSchemes: ['cloudflare', 'workerd'],
    }
    expect(
      checkRequirements([{ kind: 'provider', id: 'workerd', label: 'workerd primitives' }], target),
    ).toEqual([])
  })

  it('refuses a resource scoped to another provider', () => {
    const unsupported = checkRequirements(
      [{ kind: 'binding', id: 'kv', name: 'USERS', label: 'kv', provider: 'other' }],
      inngestTarget,
    )
    expect(unsupported[0]!.reason).toBe('requires the other provider')
  })

  it('refuses a binding kind the provider does not list', () => {
    const unsupported = checkRequirements(
      [{ kind: 'binding', id: 'kv', name: 'USERS', label: 'kv "USERS"' }],
      inngestTarget,
    )
    expect(unsupported[0]!.reason).toBe('inngest cannot supply a kv "USERS"')
  })

  it('lets a provider answer for itself', () => {
    const target: RequirementTarget = {
      name: 'cloudflare',
      supportsRequirement: (requirement) =>
        requirement.kind === 'binding' && requirement.id === 'kv'
          ? { supported: false, reason: 'KV is disabled for this account' }
          : { supported: true },
    }
    expect(
      checkRequirements([{ kind: 'binding', id: 'kv', name: 'USERS', label: 'KV' }], target),
    ).toEqual([
      {
        requirement: { kind: 'binding', id: 'kv', name: 'USERS', label: 'KV' },
        reason: 'KV is disabled for this account',
      },
    ])
  })
})

describe('formatUnsupportedRequirements', () => {
  it('names the target and every requirement', () => {
    const message = formatUnsupportedRequirements('inngest', [
      {
        requirement: { kind: 'provider', id: 'cloudflare', label: 'Cloudflare-only primitives' },
        reason: 'requires the cloudflare provider',
      },
      {
        requirement: { kind: 'binding', id: 'kv', name: 'USERS', label: 'kv "USERS"' },
        reason: 'inngest cannot supply it',
      },
    ])
    expect(message).toBe(
      'Cannot deploy to inngest: this workflow requires Cloudflare-only primitives; kv "USERS". Choose a compatible connection or remove the provider-specific code.',
    )
  })
})

describe('security-sensitive import shapes', () => {
  it('finds backtick and no-space imports', () => {
    expect(
      importSpecifiers(
        'import(`#awaitstep/cloudflare`)\nimport{x}from"#awaitstep/runtime"\nconst y = require(\'#app/y\')',
      ),
    ).toEqual(['#awaitstep/cloudflare', '#awaitstep/runtime', '#app/y'])
  })

  it('does not let a // inside a string hide a real import', () => {
    const source = 'const url = "https://example.com";\nimport { kv } from "#awaitstep/cloudflare"'
    expect(withoutComments(source)).toContain('#awaitstep/cloudflare')
    const requirements = collectRuntimeRequirements(
      ir({
        nodes: [
          {
            id: 'n1',
            type: 'step',
            name: 'Read KV',
            version: '1.0.0',
            provider: 'cloudflare',
            data: { code: source },
          },
        ],
      }),
    )
    expect(requirements).toContainEqual(
      expect.objectContaining({ kind: 'provider', id: 'cloudflare' }),
    )
  })

  it('classifies provider platform modules as provider-only', () => {
    expect(providerFromSpecifier('cloudflare:workers')).toBe('cloudflare')
    const requirements = collectRuntimeRequirements(
      ir({
        nodes: [
          {
            id: 'n1',
            type: 'step',
            name: 'Worker API',
            version: '1.0.0',
            provider: 'cloudflare',
            data: { code: 'import { env } from "cloudflare:workers"\nreturn env' },
          },
        ],
      }),
    )
    expect(requirements).toContainEqual(
      expect.objectContaining({ kind: 'provider', id: 'cloudflare', import: 'cloudflare:workers' }),
    )
  })

  it('scans a large source in bounded time', () => {
    // Before the linear rewrite, this input backtracked for ~20s.
    const source = 'import '.repeat(50_000)
    const started = performance.now()
    expect(importSpecifiers(source)).toEqual([])
    expect(performance.now() - started).toBeLessThan(2000)
  })
})
