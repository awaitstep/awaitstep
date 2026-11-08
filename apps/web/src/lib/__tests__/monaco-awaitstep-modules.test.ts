import { describe, expect, it } from 'vitest'
import { AWAITSTEP_MODULES_DTS, CLOUDFLARE_MODULES_DTS } from '../monaco/awaitstep-modules'

describe('awaitstep module ambient types', () => {
  it('declares the neutral modules everywhere and provider primitives only in the provider pack', () => {
    expect(AWAITSTEP_MODULES_DTS).toContain("declare module '#awaitstep/runtime'")
    expect(AWAITSTEP_MODULES_DTS).not.toContain("declare module '#awaitstep/cloudflare'")
    expect(CLOUDFLARE_MODULES_DTS).toContain("declare module '#awaitstep/cloudflare'")
  })

  it('carries the real authoring and provider primitive signatures', () => {
    // The canvas's step-code editors have no bundle models, so these ambient
    // declarations are what give `#awaitstep/*` imports completion/hover.
    expect(AWAITSTEP_MODULES_DTS).toContain('export function defineWorkflow')
    expect(AWAITSTEP_MODULES_DTS).toContain('export function durableStep')
    expect(CLOUDFLARE_MODULES_DTS).toContain('export function kv')
    expect(CLOUDFLARE_MODULES_DTS).toContain('export function service')
  })
})
