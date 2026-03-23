import { describe, it, expect, beforeEach } from 'vitest'
import { NodeRegistry } from '../node-registry.js'
import type { NodeDefinition } from '../node-definition.js'

function createDefinition(overrides: Partial<NodeDefinition> = {}): NodeDefinition {
  return {
    id: 'test-node',
    name: 'Test Node',
    version: '1.0.0',
    description: 'A test node',
    category: 'Utilities',
    author: 'awaitstep',
    license: 'Apache-2.0',
    configSchema: {},
    outputSchema: {},
    providers: ['cloudflare'],
    ...overrides,
  }
}

describe('NodeRegistry', () => {
  let registry: NodeRegistry

  beforeEach(() => {
    registry = new NodeRegistry()
  })

  it('starts empty', () => {
    expect(registry.size).toBe(0)
    expect(registry.getAll()).toEqual([])
  })

  it('registers and retrieves a definition', () => {
    const def = createDefinition()
    registry.register(def)
    expect(registry.get('test-node')).toBe(def)
    expect(registry.has('test-node')).toBe(true)
    expect(registry.size).toBe(1)
  })

  it('returns undefined for unknown node ID', () => {
    expect(registry.get('nonexistent')).toBeUndefined()
    expect(registry.has('nonexistent')).toBe(false)
  })

  it('overwrites existing definition with same ID', () => {
    const v1 = createDefinition({ version: '1.0.0' })
    const v2 = createDefinition({ version: '2.0.0' })
    registry.register(v1)
    registry.register(v2)
    expect(registry.size).toBe(1)
    expect(registry.get('test-node')?.version).toBe('2.0.0')
  })

  it('returns all definitions', () => {
    registry.register(createDefinition({ id: 'a' }))
    registry.register(createDefinition({ id: 'b' }))
    registry.register(createDefinition({ id: 'c' }))
    expect(registry.getAll()).toHaveLength(3)
  })

  it('filters by category', () => {
    registry.register(createDefinition({ id: 'pay-1', category: 'Payments' }))
    registry.register(createDefinition({ id: 'pay-2', category: 'Payments' }))
    registry.register(createDefinition({ id: 'email-1', category: 'Email' }))

    expect(registry.getByCategory('Payments')).toHaveLength(2)
    expect(registry.getByCategory('Email')).toHaveLength(1)
    expect(registry.getByCategory('AI')).toHaveLength(0)
  })

  it('filters by provider', () => {
    registry.register(createDefinition({ id: 'cf-only', providers: ['cloudflare'] }))
    registry.register(createDefinition({ id: 'multi', providers: ['cloudflare', 'inngest'] }))
    registry.register(createDefinition({ id: 'inngest-only', providers: ['inngest'] }))

    expect(registry.getByProvider('cloudflare')).toHaveLength(2)
    expect(registry.getByProvider('inngest')).toHaveLength(2)
    expect(registry.getByProvider('temporal')).toHaveLength(0)
  })

  it('removes a definition', () => {
    registry.register(createDefinition())
    expect(registry.remove('test-node')).toBe(true)
    expect(registry.has('test-node')).toBe(false)
    expect(registry.size).toBe(0)
  })

  it('returns false when removing nonexistent definition', () => {
    expect(registry.remove('nonexistent')).toBe(false)
  })

  it('clears all definitions', () => {
    registry.register(createDefinition({ id: 'a' }))
    registry.register(createDefinition({ id: 'b' }))
    registry.clear()
    expect(registry.size).toBe(0)
    expect(registry.getAll()).toEqual([])
  })
})
