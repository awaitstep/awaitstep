import { describe, it, expect, vi } from 'vitest'
import type { ExtensionsPackage } from '../types.js'

// The Sandbox SDK imports `cloudflare:workers`, which only workerd provides.
vi.mock('@cloudflare/sandbox', () => ({ getSandbox: vi.fn(), Sandbox: class {} }))

const { createWorker, workerAppOptions } = await import('../entry/worker-app.js')

describe('createWorker', () => {
  it('refuses a malformed set of extensions when the module loads, not per request', () => {
    expect(() => createWorker({ extensions: [{ id: 'Bad' }] })).toThrow(/not valid/)
    expect(() => createWorker({ extensions: [{ id: 'a' }, { id: 'a' }] })).toThrow(/twice/)
  })

  it('builds handlers for a valid set, and for none', () => {
    expect(Object.keys(createWorker({ extensions: [{ id: 'a' }] }))).toEqual(['fetch', 'scheduled'])
    expect(Object.keys(createWorker())).toEqual(['fetch', 'scheduled'])
  })

  it('refuses an unknown switch when the module loads', () => {
    expect(() => createWorker({ disabled: ['playgrond' as 'playground'] })).toThrow(
      /Unknown feature switch "playgrond"/,
    )
  })

  it('takes the extensions package’s export as it is, its switches reaching the app', () => {
    // One shape for the dev server and the Worker: `createWorker(pkg)` must not drop `disabled`.
    const pkg: ExtensionsPackage = {
      extensions: [{ id: 'a' }],
      disabled: ['connections.apiTokens', 'playground'],
    }
    expect(workerAppOptions(pkg)).toEqual({
      extensions: [{ id: 'a' }],
      disabledFeatures: ['playground', 'connections.apiTokens'],
    })
    expect(Object.keys(createWorker(pkg))).toEqual(['fetch', 'scheduled'])
    expect(workerAppOptions({})).toEqual({ extensions: [], disabledFeatures: [] })
  })
})
