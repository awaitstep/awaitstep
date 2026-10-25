import { AsyncLocalStorage } from 'node:async_hooks'
import { getRequestHeader } from '@tanstack/react-start/server'

interface ServiceFetcher {
  fetch: (request: Request) => Promise<Response>
}

export interface CfBindings {
  API: ServiceFetcher
}

interface CfContext {
  bindings: CfBindings
  originalRequest: Request
}

const storage = new AsyncLocalStorage<CfContext>()

export function runWithCfContext<T>(ctx: CfContext, fn: () => T): T {
  return storage.run(ctx, fn)
}

export function getCfContext(): CfContext | undefined {
  return storage.getStore()
}

// Calls the API from server-side code, carrying who the real client is.
//
// Workers: dispatches over the service binding, forwarding cf-connecting-ip
// (which the API trusts in its edge mode — service bindings do not propagate
// it on their own) and user-agent.
//
// Node: plain fetch over loopback. The server entry (apps/api serve.ts) has
// already resolved the client and stamped the request with a per-process
// proof (`x-awaitstep-proxy`) and the address (`x-awaitstep-client`); both
// are forwarded as received. Under `pnpm dev` there is no such hop, the
// proof is absent, and the API keys the call on loopback.
const NODE_HOP_HEADERS = ['x-awaitstep-proxy', 'x-awaitstep-client'] as const

export async function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  const ctx = getCfContext()
  if (ctx) {
    const headers = new Headers(init?.headers)
    for (const name of ['cf-connecting-ip', 'user-agent']) {
      const v = ctx.originalRequest.headers.get(name)
      if (v) headers.set(name, v)
    }
    return ctx.bindings.API.fetch(new Request(`https://api.internal${path}`, { ...init, headers }))
  }
  const base = process.env['API_URL'] ?? `http://localhost:${process.env['PORT'] || 8080}`
  const headers = new Headers(init?.headers)
  for (const name of NODE_HOP_HEADERS) {
    const v = currentRequestHeader(name)
    if (v) headers.set(name, v)
  }
  return fetch(`${base}${path}`, { ...init, headers })
}

function currentRequestHeader(name: string): string | undefined {
  try {
    return getRequestHeader(name) || undefined
  } catch {
    // Called outside a request (a build step, a script): no client to name.
    return undefined
  }
}
