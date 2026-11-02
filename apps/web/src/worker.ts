import tanstackServer from '@tanstack/react-start/server-entry'
import { dashboardImgSrc } from '@awaitstep/storage'
import { runWithCfContext } from './lib/cf-context'

interface Env {
  API: Fetcher
  ASSETS?: Fetcher
  /** The API's node registry, when not the public one: its icons may load. */
  REGISTRY_URL?: string
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url)
    if (url.pathname.startsWith('/api/')) {
      return env.API.fetch(request)
    }
    const page = await runWithCfContext(
      { bindings: { API: env.API }, originalRequest: request },
      () => tanstackServer.fetch(request, env, ctx),
    )
    // Images load only from here, the GitHub and Google avatar hosts and
    // the node registry (its icons).
    const response = new Response(page.body, page)
    response.headers.set('Content-Security-Policy', dashboardImgSrc(env.REGISTRY_URL))
    return response
  },
}
