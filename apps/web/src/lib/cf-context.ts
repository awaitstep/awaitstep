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

// Service-binding fetch helper. On Workers: dispatches directly to the API
// Worker via `env.API.fetch()`, preserving the original client IP headers so
// Better Auth's rate limiter can identify the caller. On Node: falls back to
// plain fetch against apiBase — same behavior as before the CF track existed.
export async function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  const ctx = getCfContext()
  if (ctx) {
    const headers = new Headers(init?.headers)
    // Forward client-identifying headers from the original request so the API
    // Worker (behind a service binding, not CF edge) still sees who the real
    // caller is. Service bindings don't auto-propagate these.
    for (const name of ['cf-connecting-ip', 'x-forwarded-for', 'x-real-ip', 'user-agent']) {
      const v = ctx.originalRequest.headers.get(name)
      if (v) headers.set(name, v)
    }
    return ctx.bindings.API.fetch(new Request(`https://api.internal${path}`, { ...init, headers }))
  }
  const base = process.env['API_URL'] ?? `http://localhost:${process.env['PORT'] || 8080}`
  // On Node the web server reaches the API over loopback, so the API keys
  // this call on the forwarding chain, not the connection. The server entry
  // has already appended the address it saw; pass the chain on unchanged.
  const forwardedFor = currentForwardedFor()
  if (!forwardedFor) return fetch(`${base}${path}`, init)
  const headers = new Headers(init?.headers)
  headers.set('x-forwarded-for', forwardedFor)
  return fetch(`${base}${path}`, { ...init, headers })
}

function currentForwardedFor(): string | undefined {
  try {
    return getRequestHeader('x-forwarded-for') || undefined
  } catch {
    // Called outside a request (a build step, a script): no client to name.
    return undefined
  }
}
