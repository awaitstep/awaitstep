import { cors } from 'hono/cors'
import { createMiddleware } from 'hono/factory'
import type { AppEnv } from '../types.js'

const METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS']

/**
 * Paths that answer without checking a key, so a `Bearer` header proves
 * nothing there: sign-in belongs to the dashboard alone, and uploaded images
 * are shown with `<img>` (no CORS needed) and kept to the app's site by their
 * `Cross-Origin-Resource-Policy`.
 */
export const NO_GLOBAL_CORS = ['/api/auth/', '/api/images/'] as const

/**
 * The CORS answer for a request, picked by where it comes from and how it
 * signs in:
 *
 * - from one of the app's origins (the dashboard): that origin, with
 *   credentials — the session cookie works;
 * - from any other origin, signing in with `Authorization: Bearer` (and the
 *   preflight before it, which carries no credentials): `*` without
 *   credentials. A browser sends no cookie to such an answer, so an API key
 *   works from any page and a session from none;
 * - anything else from another origin, and anything at all for the paths that
 *   answer without a key ({@link NO_GLOBAL_CORS}): no CORS headers, so the
 *   browser keeps the answer from the page.
 *
 * Every answer varies by `Origin`, so a cache never hands one origin's
 * headers to another.
 */
export function corsPolicy(allowedOrigins: readonly string[]) {
  const dashboard = cors({
    origin: [...allowedOrigins],
    allowHeaders: ['Content-Type', 'Authorization'],
    allowMethods: METHODS,
    credentials: true,
  })
  const global = cors({
    origin: '*',
    allowHeaders: ['Content-Type', 'Authorization'],
    allowMethods: METHODS,
    // The request id to quote in a report, and how long a rate limit lasts.
    exposeHeaders: ['X-Request-Id', 'Retry-After'],
  })

  return createMiddleware<AppEnv>(async (c, next) => {
    const origin = c.req.header('Origin')
    if (origin !== undefined && allowedOrigins.includes(origin)) return dashboard(c, next)

    const keyed =
      origin !== undefined &&
      !NO_GLOBAL_CORS.some((prefix) => c.req.path.startsWith(prefix)) &&
      (c.req.method === 'OPTIONS' || c.req.header('Authorization')?.startsWith('Bearer '))
    // Appended once the answer exists, not set before `next()`: a handler
    // returning its own `Response` (better-auth, onError) would drop a header
    // set earlier, or overwrite its own `Vary` with it. A preflight is
    // answered by `global` itself; it becomes `c.res` first, because Hono's
    // setter copies the old headers over a returned answer.
    const answer = keyed ? await global(c, next) : await next()
    if (answer instanceof Response) c.res = answer
    c.res.headers.append('Vary', 'Origin')
  })
}
