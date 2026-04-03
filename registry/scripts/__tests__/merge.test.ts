import { describe, it, expect } from 'vitest'
import { deepMerge } from '../merge.js'

describe('deepMerge', () => {
  it('merges top-level fields', () => {
    const base = { id: 'test', name: 'Test', version: '1.0.0' }
    const overrides = { version: '1.0.1', description: 'Updated' }
    const result = deepMerge(base, overrides)
    expect(result).toEqual({ id: 'test', name: 'Test', version: '1.0.1', description: 'Updated' })
  })

  it('deep-merges nested objects', () => {
    const base = {
      configSchema: {
        action: { type: 'select', label: 'Action', required: true },
        model: { type: 'string', label: 'Model', default: 'old-model' },
      },
    }
    const overrides = {
      configSchema: {
        action: { options: ['A', 'B'] },
        model: { default: 'new-model' },
      },
    }
    const result = deepMerge(base, overrides)
    expect(result.configSchema).toEqual({
      action: { type: 'select', label: 'Action', required: true, options: ['A', 'B'] },
      model: { type: 'string', label: 'Model', default: 'new-model' },
    })
  })

  it('adds new nested fields from overrides', () => {
    const base = { configSchema: { prompt: { type: 'textarea' } } }
    const overrides = { configSchema: { newField: { type: 'string', label: 'New' } } }
    const result = deepMerge(base, overrides)
    expect((result.configSchema as Record<string, unknown>).prompt).toEqual({ type: 'textarea' })
    expect((result.configSchema as Record<string, unknown>).newField).toEqual({
      type: 'string',
      label: 'New',
    })
  })

  it('replaces arrays entirely (no merge)', () => {
    const base = { tags: ['a', 'b'] }
    const overrides = { tags: ['x', 'y', 'z'] }
    const result = deepMerge(base, overrides)
    expect(result.tags).toEqual(['x', 'y', 'z'])
  })

  it('does not mutate base', () => {
    const base = { configSchema: { action: { type: 'select' } } }
    const original = JSON.parse(JSON.stringify(base))
    deepMerge(base, { configSchema: { action: { options: ['A'] } } })
    expect(base).toEqual(original)
  })

  it('handles empty overrides', () => {
    const base = { id: 'test', name: 'Test' }
    const result = deepMerge(base, {})
    expect(result).toEqual(base)
  })

  it('handles empty base', () => {
    const overrides = { version: '1.0.1' }
    const result = deepMerge({}, overrides)
    expect(result).toEqual(overrides)
  })

  it('overrides null values', () => {
    const base = { field: 'value' }
    const overrides = { field: null }
    const result = deepMerge(base, overrides as Record<string, unknown>)
    expect(result.field).toBeNull()
  })
})
