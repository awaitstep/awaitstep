import { describe, expect, it } from 'vitest'
import { buildNodeRegistry } from '../lib/node-registry.js'

describe('node template resolution', () => {
  const registry = buildNodeRegistry({
    definitions: [],
    templates: { custom: { cloudflare: 'export const value = 1' } },
  })

  it('does not fall back to another provider when one is named', () => {
    expect(registry.templateResolver.getTemplate('custom', 'inngest')).toBeUndefined()
  })

  it('does not resolve prototype keys', () => {
    expect(registry.templateResolver.getTemplate('custom', '__proto__')).toBeUndefined()
    expect(registry.templateResolver.getTemplate('__proto__')).toBeUndefined()
  })

  it('uses the only template when no provider is named', () => {
    expect(registry.templateResolver.getTemplate('custom')).toBe('export const value = 1')
  })
})
