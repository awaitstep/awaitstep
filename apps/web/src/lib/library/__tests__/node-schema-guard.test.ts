import { describe, expect, it } from 'vitest'
import { buildNodeCtxDts } from '../../monaco/node-ctx-dts'
import { manifestSummary } from '../manifest-summary'
import { safeConfigSchema, safeOutputSchema } from '../node-schema-guard'

describe('node.json mid-edit', () => {
  it('drops fields that are not shaped like the schema instead of throwing', () => {
    expect(
      safeConfigSchema({
        a: { type: 'select', label: 'A', options: 'abc' },
        b: null,
        c: { type: 'nope' },
        d: { type: 'string', label: 'D', required: true },
      }),
    ).toEqual({
      a: { type: 'select', label: 'A' },
      d: { type: 'string', label: 'D', required: true },
    })
    expect(safeOutputSchema({ a: null, b: { type: 'array', items: 5 }, c: [] })).toEqual({
      b: { type: 'array' },
    })
    expect(safeConfigSchema([1, 2])).toEqual({})
  })

  it('builds ctx.d.ts and the canvas preview from odd but valid JSON', () => {
    for (const json of [
      '{"configSchema":{"a":{"type":"select","options":"abc"}}}',
      '{"configSchema":{"a":null}}',
      '{"outputSchema":{"a":null}}',
      '{"configSchema":[],"outputSchema":"x"}',
      'null',
      `{"outputSchema":{"a":${'{"type":"array","items":'.repeat(20000)}{"type":"string"}${'}'.repeat(20000)}}}`,
    ]) {
      expect(() => buildNodeCtxDts(json)).not.toThrow()
      const item = {
        id: 'n',
        kind: 'node' as const,
        slug: 'n',
        name: 'N',
        latestVersion: null,
        files: [{ path: '1.0.0/node.json', hash: 'h', readOnly: false }],
      }
      expect(() => manifestSummary(item, () => json)).not.toThrow()
    }
  })
})
