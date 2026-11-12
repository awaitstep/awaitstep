import { describe, expect, it } from 'vitest'
import { buildNodeCtxDts } from '../node-ctx-dts'

describe('buildNodeCtxDts', () => {
  it('types config from configSchema and Output from outputSchema', () => {
    const dts = buildNodeCtxDts(
      JSON.stringify({
        configSchema: {
          channel: { type: 'string', label: 'Channel', required: true },
          window: { type: 'select', label: 'Window', options: ['24h', '7d'], default: '24h' },
          limit: { type: 'number', label: 'Limit' },
        },
        outputSchema: { posted: { type: 'boolean' } },
      }),
    )
    expect(dts).toContain('channel: string;')
    expect(dts).toContain('window: "24h" | "7d";')
    expect(dts).toContain('limit?: number;')
    expect(dts).toMatch(/export type Output = \{\s*posted: boolean;\s*\}/)
  })

  it('returns nothing usable for an empty outputSchema, and loose types for broken JSON', () => {
    expect(buildNodeCtxDts('{"configSchema":{},"outputSchema":{}}')).toContain(
      'export type Output = unknown',
    )
    expect(buildNodeCtxDts('{ nope')).toContain('export type Output = any')
  })
})
