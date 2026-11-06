import { describe, it, expect } from 'vitest'
import { computeVarNames, createGenerationContext } from '../context.js'

const nodes = [
  { id: 'n1', name: 'Fetch data' },
  { id: 'n2', name: 'Fetch data' },
  { id: 'n3', name: 'Send email!' },
]

describe('computeVarNames', () => {
  it('derives sanitized, deduplicated names from node display names', () => {
    const names = computeVarNames(nodes)
    expect(names.get('n1')).toBe('Fetch_data')
    expect(names.get('n2')).not.toBe(names.get('n1'))
    expect(names.get('n3')).toMatch(/^[A-Za-z_]\w*$/)
  })

  it('keeps a node called like a name the generated body binds clear of it', () => {
    const names = computeVarNames([
      { id: 'a', name: 'step' },
      { id: 'b', name: 'env' },
      { id: 'c', name: 'EXPORT_flow' },
      { id: 'd', name: 'Steps' },
    ])
    expect(names.get('a')).toBe('step_node')
    expect(names.get('b')).toBe('env_node')
    expect(names.get('c')).toBe('flow_node')
    expect(names.get('d')).toBe('Steps')
  })

  it('never hands two nodes the same name, whatever their names spell', () => {
    const names = computeVarNames([
      { id: 'a', name: 'q' },
      { id: 'b', name: 'q' },
      { id: 'c', name: 'q_2' },
      { id: 'd', name: 'step' },
      { id: 'e', name: 'step_node' },
    ])
    expect(new Set(names.values()).size).toBe(5)
    expect(names.get('a')).toBe('q')
    expect(names.get('b')).toBe('q_2')
    expect(names.get('c')).toBe('q_2_2')
  })
})

describe('createGenerationContext', () => {
  it('resolves mapped nodes by display-name-derived variables', () => {
    const ctx = createGenerationContext(nodes)
    expect(ctx.varName('n1')).toBe('Fetch_data')
  })

  it('falls back to the sanitized node id for unknown nodes', () => {
    const ctx = createGenerationContext(nodes)
    expect(ctx.varName('ghost-node')).toBe('ghost_node')
    expect(createGenerationContext([]).varName('n1')).toBe('n1')
  })

  it('keeps contexts independent — no shared state between generations', () => {
    const a = createGenerationContext([{ id: 'x', name: 'Alpha' }])
    const b = createGenerationContext([{ id: 'x', name: 'Beta' }])
    expect(a.varName('x')).toBe('Alpha')
    expect(b.varName('x')).toBe('Beta')
    expect(a.varName('x')).toBe('Alpha')
  })
})
