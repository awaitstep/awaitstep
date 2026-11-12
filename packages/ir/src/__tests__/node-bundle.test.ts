import { describe, expect, it } from 'vitest'
import { nodeBundleChecksumInput, nodeBundleSchema, stableStringify } from '../node-bundle.js'

const definition = {
  id: 'example',
  name: 'Example',
  version: '1.0.0',
  description: 'Example node',
  category: 'Utilities',
  author: 'awaitstep',
  license: 'Apache-2.0',
  configSchema: {},
  outputSchema: {},
  providers: ['acme'],
}

const bundle = {
  definition,
  templates: { acme: 'export default async function (ctx) {}' },
  bundledAt: new Date().toISOString(),
  checksum: `sha256:${'a'.repeat(64)}`,
}

describe('nodeBundleSchema', () => {
  it('accepts provider ids registered outside the shared package', () => {
    expect(nodeBundleSchema.safeParse(bundle).success).toBe(true)
  })

  it('rejects an empty provider id', () => {
    const result = nodeBundleSchema.safeParse({
      ...bundle,
      definition: { ...definition, providers: [''] },
    })
    expect(result.success).toBe(false)
  })
})

describe('stableStringify', () => {
  it('is independent of object key order at every depth', () => {
    const left = { b: 2, a: { d: 4, c: 3 }, list: [{ z: 1, y: 2 }] }
    const right = { list: [{ y: 2, z: 1 }], a: { c: 3, d: 4 }, b: 2 }
    expect(stableStringify(left)).toBe(stableStringify(right))
  })

  it('keeps array order', () => {
    expect(stableStringify({ list: [1, 2] })).not.toBe(stableStringify({ list: [2, 1] }))
  })
})

describe('nodeBundleChecksumInput', () => {
  it('is stable when definition keys are reordered', () => {
    const left = { definition: { b: 2, a: 1 }, templates: { cloudflare: 'x' } }
    const right = { templates: { cloudflare: 'x' }, definition: { a: 1, b: 2 } }
    expect(nodeBundleChecksumInput(left.definition as never, left.templates)).toBe(
      nodeBundleChecksumInput(right.definition as never, right.templates),
    )
  })
})
