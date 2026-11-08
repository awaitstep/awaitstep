import { describe, expect, it } from 'vitest'
import { createProvider, hasProvider, validateNodesForProvider } from '../lib/provider-registry.js'

describe('provider registry', () => {
  it('does not treat prototype keys as providers', () => {
    for (const id of ['constructor', 'toString', '__proto__', 'hasOwnProperty']) {
      expect(hasProvider(id), id).toBe(false)
      expect(() => createProvider(id, {}), id).toThrow(/Unsupported provider/)
    }
  })

  it('checks a node definition’s provider list when the node has no stamp', () => {
    const ir = {
      nodes: [{ id: 'n1', type: 'custom', name: 'Custom', version: '1.0.0', data: {} }],
      edges: [],
    } as never
    expect(validateNodesForProvider(ir, 'cloudflare', () => ['inngest']).unsupportedNodes).toEqual([
      { id: 'n1', name: 'Custom' },
    ])
    expect(validateNodesForProvider(ir, 'cloudflare', () => ['cloudflare']).valid).toBe(true)
  })

  it('accepts a registered provider id', () => {
    expect(hasProvider('cloudflare')).toBe(true)
    expect(createProvider('cloudflare', {}).name).toBe('cloudflare')
  })
})
