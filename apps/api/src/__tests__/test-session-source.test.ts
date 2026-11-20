import { describe, expect, it } from 'vitest'
import { testSessionSourceHash, type TestSessionSource } from '../lib/test-session-source.js'

async function sha256(input: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input))
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

const hash = (source: TestSessionSource) => testSessionSourceHash(source, sha256)

function source(overrides: Partial<TestSessionSource> = {}): TestSessionSource {
  return {
    bundle: {
      entry: 'worker.ts',
      files: [
        { path: 'worker.ts', source: 'export {}', role: 'entry' },
        { path: 'steps/a.ts', source: 'export default async function a() {}', role: 'module' },
      ],
    },
    ir: { nodes: [{ id: 'a', data: { bucket: 'b-1' } }] },
    kind: 'workflow',
    workflowName: 'Orders',
    envVars: { TOKEN: { value: 'one', isSecret: true } },
    dependencies: { zod: '^4.0.0' },
    ...overrides,
  }
}

describe('testSessionSourceHash', () => {
  it('hashes the same build the same way, whatever order the files come in', async () => {
    const reordered = source()
    reordered.bundle = { ...source().bundle, files: [...source().bundle.files].reverse() }
    expect(await hash(reordered)).toBe(await hash(source()))
    expect(await hash(source())).toMatch(/^[0-9a-f]{64}$/)
  })

  it('changes when a file, the document, a variable, a secret value, a dependency or the name changes', async () => {
    const base = await hash(source())
    const changed: TestSessionSource[] = [
      source({
        bundle: {
          entry: 'worker.ts',
          files: [{ path: 'worker.ts', source: 'export { x }', role: 'entry' }],
        },
      }),
      // A resource id lives in the document, not in any file.
      source({ ir: { nodes: [{ id: 'a', data: { bucket: 'b-2' } }] } }),
      source({ envVars: { TOKEN: { value: 'two', isSecret: true } } }),
      source({ envVars: { TOKEN: { value: 'one', isSecret: false } } }),
      source({ dependencies: { zod: '^4.1.0' } }),
      source({ workflowName: 'Orders v2' }),
      source({ kind: 'script' }),
    ]
    for (const candidate of changed) {
      expect(await hash(candidate)).not.toBe(base)
    }
  })

  it('hands the input to the digest it is given, never storing it plain', async () => {
    let seen = ''
    const result = await testSessionSourceHash(source(), async (input) => {
      seen = input
      return 'keyed'
    })
    expect(result).toBe('keyed')
    expect(seen).toContain('one')
  })

  it('takes a dependency whose name is an object key JavaScript treats specially', async () => {
    const value = await hash(source({ dependencies: { constructor: '1.0.0' } }))
    expect(value).toMatch(/^[0-9a-f]{64}$/)
  })
})
