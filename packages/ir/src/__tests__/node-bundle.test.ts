import { describe, expect, it } from 'vitest'
import {
  legacyNodeBundleChecksumInput,
  nodeBundleChecksumInput,
  nodeBundleSchema,
  nodeDefinitionSchema,
  stableStringify,
} from '../node-bundle.js'

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

  it('rejects a provider id that could escape the template path', () => {
    const result = nodeBundleSchema.safeParse({
      ...bundle,
      definition: { ...definition, providers: ['../../secret'] },
      templates: { '../../secret': 'export default async function (ctx) {}' },
    })
    expect(result.success).toBe(false)
  })
})

describe('nodeDefinitionSchema', () => {
  // Before, only Library nodes were checked: a marketplace node's own `export`
  // field would have been read as "Return this value" and never reach its template.
  it('refuses a config field named like a placement setting, for every node', () => {
    for (const name of ['inline', 'export', 'exportAs']) {
      const result = nodeDefinitionSchema.safeParse({
        ...definition,
        configSchema: { [name]: { type: 'boolean', label: name } },
      })
      expect(result.success).toBe(false)
      expect(result.error?.issues[0]).toMatchObject({
        path: ['configSchema', name],
        message: `"${name}" is reserved for how the node runs; rename the field`,
      })
    }
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

describe('legacyNodeBundleChecksumInput', () => {
  it('keeps the definition’s own key order, as releases before the stable checksum hash it', () => {
    const templates = { cloudflare: 'x' }
    expect(legacyNodeBundleChecksumInput({ b: 2, a: 1 }, templates)).toBe(
      '{"definition":{"b":2,"a":1},"templates":{"cloudflare":"x"}}',
    )
    expect(legacyNodeBundleChecksumInput({ b: 2, a: 1 }, templates)).not.toBe(
      legacyNodeBundleChecksumInput({ a: 1, b: 2 }, templates),
    )
  })
})
