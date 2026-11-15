import { createRouter as createTanStackRouter } from '@tanstack/react-router'
import { getGlobalStartContext } from '@tanstack/react-start'
import { routeTree } from './routeTree.gen'
import { RouteError } from './components/navigation/route-error'

export function createRouter(nonce?: string) {
  return createTanStackRouter({
    routeTree,
    scrollRestoration: true,
    defaultErrorComponent: RouteError,
    // Every script the router renders carries the page's CSP nonce. On the
    // client the router reads it back from the page itself.
    ssr: { nonce },
  })
}

export async function getRouter() {
  return createRouter(requestNonce())
}

/**
 * The nonce the web entry (apps/web/src/worker.ts, apps/api serve.ts) put in
 * this response's Content-Security-Policy, handed over as request context.
 * None on the client, or under `vite dev`, which sends no policy.
 *
 * None either when Start builds the router outside a request's context —
 * `getGlobalStartContext` throws there. Start does that only to resolve a
 * redirect (`handleRedirectResponse`), whose response is a Location header
 * or a JSON body with no scripts, so a router without a nonce never renders
 * a page. Start keeps one router per request: a page renders through the
 * router its request context created, and gets the nonce.
 */
function requestNonce(): string | undefined {
  let context: { nonce?: unknown } | undefined
  try {
    context = getGlobalStartContext() as { nonce?: unknown } | undefined
  } catch {
    return undefined
  }
  return typeof context?.nonce === 'string' && context.nonce !== '' ? context.nonce : undefined
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof createRouter>
  }
}
