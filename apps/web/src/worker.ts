import tanstackServer from '@tanstack/react-start/server-entry'
import { withDashboardPolicy } from '@awaitstep/storage'
import { runWithCfContext } from './lib/cf-context'

interface Env {
  API: Fetcher
  ASSETS?: Fetcher
  /** The API's node registry, when not the public one: its icons may load. */
  REGISTRY_URL?: string
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url)
    if (url.pathname.startsWith('/api/')) {
      return env.API.fetch(request)
    }
    // The page's Content-Security-Policy: its scripts carry this response's
    // nonce, handed to the router as request context — never read from the
    // request, so a client cannot choose it.
    return withDashboardPolicy(
      (nonce) =>
        runWithCfContext({ bindings: { API: env.API }, originalRequest: request }, () =>
          tanstackServer.fetch(request, { context: { nonce } }),
        ),
      { registryUrl: env.REGISTRY_URL },
    )
  },
}
