import { describe, expect, it } from 'vitest'
import { jsonDeclaration, jsonDeclarationPath, jsonTypeOf } from '../monaco/json-types'

describe('jsonTypeOf', () => {
  it('describes primitives, arrays and objects with quoted keys', () => {
    expect(jsonTypeOf({ nl: 'Netherlands', 'zip-codes': [1012, 1013], ok: true, none: null })).toBe(
      '{ "nl": string; "zip-codes": number[]; "ok": boolean; "none": null }',
    )
    expect(jsonTypeOf([])).toBe('never[]')
    expect(jsonTypeOf([1, 'a', 1])).toBe('(number | string)[]')
    expect(jsonTypeOf({})).toBe('{}')
  })

  it('stays bounded on deep, wide or wildly mixed data', () => {
    let deep: unknown = 'leaf'
    for (let i = 0; i < 10; i++) deep = { child: deep }
    expect(jsonTypeOf(deep)).toContain('unknown')
    const wide = Object.fromEntries(Array.from({ length: 201 }, (_, i) => [`k${i}`, i]))
    expect(jsonTypeOf(wide)).toBe('Record<string, unknown>')
    const mixed = [1, 'a', true, null, [], {}, [1], { a: 1 }, 'b', { b: 2 }]
    expect(jsonTypeOf(mixed)).toBe('unknown[]')
  })
})

describe('jsonDeclaration', () => {
  it('emits a default-export module, and nothing while the JSON is invalid', () => {
    expect(jsonDeclaration('["NL", "DE"]')).toBe(
      'declare const value: string[];\nexport default value;\n',
    )
    expect(jsonDeclaration('["NL", ')).toBeNull()
  })

  it('places the declaration where TypeScript resolves a .json import first', () => {
    expect(jsonDeclarationPath('data/countries.json')).toBe('data/countries.d.json.ts')
    expect(jsonDeclarationPath('UPPER.JSON')).toBe('UPPER.d.json.ts')
  })
})
