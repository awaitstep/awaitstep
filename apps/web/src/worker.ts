import tanstackServer from '@tanstack/react-start/server-entry'
import { runWithCfContext } from './lib/cf-context'

interface Env {
  API: Fetcher
  ASSETS?: Fetcher
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url)
    if (url.pathname.startsWith('/api/')) {
      return env.API.fetch(request)
    }
    return runWithCfContext({ bindings: { API: env.API }, originalRequest: request }, () =>
      tanstackServer.fetch(request, env, ctx),
    )
  },
}
