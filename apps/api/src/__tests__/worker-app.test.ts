import { describe, it, expect, vi } from 'vitest'

// The Sandbox SDK imports `cloudflare:workers`, which only workerd provides.
vi.mock('@cloudflare/sandbox', () => ({ getSandbox: vi.fn(), Sandbox: class {} }))

const { createWorker } = await import('../entry/worker-app.js')

describe('createWorker', () => {
  it('refuses a malformed set of extensions when the module loads, not per request', () => {
    expect(() => createWorker({ extensions: [{ id: 'Bad' }] })).toThrow(/not valid/)
    expect(() => createWorker({ extensions: [{ id: 'a' }, { id: 'a' }] })).toThrow(/twice/)
  })

  it('builds handlers for a valid set, and for none', () => {
    expect(Object.keys(createWorker({ extensions: [{ id: 'a' }] }))).toEqual(['fetch', 'scheduled'])
    expect(Object.keys(createWorker())).toEqual(['fetch', 'scheduled'])
  })
})
