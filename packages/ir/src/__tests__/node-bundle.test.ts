import { describe, expect, it } from 'vitest'
import { nodeBundleSchema } from '../node-bundle.js'

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
