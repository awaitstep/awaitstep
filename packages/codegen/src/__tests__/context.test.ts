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
