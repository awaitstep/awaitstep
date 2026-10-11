import { describe, it, expect } from 'vitest'
import { outputFieldToType, outputSchemaToType } from '../output-types.js'

describe('outputFieldToType', () => {
  it('maps primitive field types directly', () => {
    expect(outputFieldToType({ type: 'string' })).toBe('string')
    expect(outputFieldToType({ type: 'number' })).toBe('number')
    expect(outputFieldToType({ type: 'boolean' })).toBe('boolean')
    expect(outputFieldToType({ type: 'null' })).toBe('null')
  })

  it('appends | null for nullable fields', () => {
    expect(outputFieldToType({ type: 'string', nullable: true })).toBe('string | null')
  })

  it('maps arrays with and without item schemas', () => {
    expect(outputFieldToType({ type: 'array' })).toBe('unknown[]')
    expect(outputFieldToType({ type: 'array', items: { type: 'number' } })).toBe('number[]')
  })

  it('parenthesizes union item types in arrays', () => {
    expect(outputFieldToType({ type: 'array', items: { type: 'string', nullable: true } })).toBe(
      '(string | null)[]',
    )
  })

  it('maps schemaless objects to Record<string, unknown>', () => {
    expect(outputFieldToType({ type: 'object' })).toBe('Record<string, unknown>')
  })
})

describe('outputSchemaToType', () => {
  it('yields unknown for missing or empty schemas', () => {
    expect(outputSchemaToType(undefined)).toBe('unknown')
    expect(outputSchemaToType({})).toBe('unknown')
  })

  it('renders an object type with JSDoc from descriptions', () => {
    const type = outputSchemaToType({
      text: { type: 'string', description: 'Generated text' },
      data: { type: 'object' },
    })
    expect(type).toBe(`{
  /** Generated text */
  text: string;
  data: Record<string, unknown>;
}`)
  })

  it('nests object properties with growing indentation', () => {
    const type = outputSchemaToType({
      meta: { type: 'object', properties: { id: { type: 'string' } } },
    })
    expect(type).toBe(`{
  meta: {
    id: string;
  };
}`)
  })

  it('quotes non-identifier property keys and neutralizes */ in descriptions', () => {
    const type = outputSchemaToType({
      'content-type': { type: 'string', description: 'evil */ breakout' },
    })
    expect(type).toContain('"content-type": string;')
    expect(type).toContain('/** evil *\\/ breakout */')
  })
})
