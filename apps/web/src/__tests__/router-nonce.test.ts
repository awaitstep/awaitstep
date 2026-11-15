import type { AsyncLocalStorage } from 'node:async_hooks'
import { describe, expect, it } from 'vitest'
import { getRouter } from '../router'

// The store Start's request handler runs a request in (`runWithStartContext`,
// @tanstack/start-storage-context): one AsyncLocalStorage on a global symbol,
// shared by every bundle that loads it. Importing the router loads it.
const storage = (globalThis as Record<symbol, unknown>)[
  Symbol.for('tanstack-start:start-storage-context')
] as AsyncLocalStorage<unknown>

/** As Start's handler runs a page: the request context the web entry passed, after middleware. */
function inRequest<T>(context: Record<string, unknown>, fn: () => T): T {
  return storage.run({ contextAfterGlobalMiddlewares: context }, fn)
}

const NONCE = 'q2Jk9xV0bZ3LmN4pR5sT6w=='

describe('getRouter — the page’s CSP nonce', () => {
  it('puts the request context’s nonce on every script the router renders', async () => {
    const router = await inRequest({ nonce: NONCE }, () => getRouter())
    expect(router.options.ssr?.nonce).toBe(NONCE)
  })

  it('has no nonce when the request context carries none (vite dev sends no policy)', async () => {
    const router = await inRequest({}, () => getRouter())
    expect(router.options.ssr?.nonce).toBeUndefined()
  })

  it('builds a router outside any request context instead of throwing', async () => {
    // Start resolves a server-function redirect with a router it may create
    // outside `runWithStartContext`; that response has no scripts.
    expect(storage.getStore()).toBeUndefined()
    const router = await getRouter()
    expect(router.options.ssr?.nonce).toBeUndefined()
  })

  it('ignores a nonce that is not a non-empty string', async () => {
    for (const nonce of ['', 42, null]) {
      const router = await inRequest({ nonce }, () => getRouter())
      expect(router.options.ssr?.nonce).toBeUndefined()
    }
  })
})
