import { describe, expect, it } from 'vitest'
import type { ProviderCapabilities } from '@awaitstep/codegen'
import { providerAccountPhrase, providerLabel } from '../use-provider-capabilities'

function capability(id: string, label: string): ProviderCapabilities {
  return {
    id,
    label,
    handlerKinds: ['fetch'],
    importSchemes: [],
    bindingKinds: [],
    bindingKindLabels: {},
  }
}

describe('provider labels', () => {
  it('reads a provider’s label from its capabilities, else its id', () => {
    const list = [capability('cloudflare', 'Cloudflare')]
    expect(providerLabel(list, 'cloudflare')).toBe('Cloudflare')
    expect(providerLabel(list, 'other')).toBe('other')
  })

  it('names the built-in provider before the capabilities load, or when they fail', () => {
    expect(providerLabel([], 'cloudflare')).toBe('Cloudflare')
    expect(providerLabel([], 'test-provider')).toBe('test-provider')
    expect(providerLabel([], '__proto__')).toBe('__proto__')
    expect(providerAccountPhrase([])).toBe('a Cloudflare account')
  })

  it('names the providers an account can come from', () => {
    expect(providerAccountPhrase([capability('cloudflare', 'Cloudflare')])).toBe(
      'a Cloudflare account',
    )
    expect(providerAccountPhrase([capability('acme', 'Acme')])).toBe('an Acme account')
    expect(
      providerAccountPhrase([
        capability('cloudflare', 'Cloudflare'),
        capability('a', 'Acme'),
        capability('b', 'Beta'),
      ]),
    ).toBe('a Cloudflare, Acme or Beta account')
  })
})
