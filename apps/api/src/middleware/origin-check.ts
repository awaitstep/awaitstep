import { createMiddleware } from 'hono/factory'
import type { AppEnv } from '../types.js'

export const CROSS_ORIGIN_REFUSED = 'Cross-origin request refused'

const SAFE_METHOD = /^(GET|HEAD|OPTIONS)$/

/**
 * Refuses a write that carries a session cookie from a page outside the app,
 * whatever its content type. `hono/csrf` only checks the content types a form
 * can send, so a cross-site `fetch` with a JSON body and the user's cookie got
 * past it, held back by nothing but CORS.
 *
 * A write passes when:
 * - it signs in with `Authorization: Bearer` (a key is never sent on its own,
 *   so there is no ambient credential to abuse), or carries no cookie;
 * - the browser says it came from the API's own origin
 *   (`Sec-Fetch-Site: same-origin`, or `none` for one the user typed);
 * - its `Origin` is one of the app's origins (a dashboard on another
 *   subdomain is `same-site`, and passes here), or — with no
 *   `Sec-Fetch-Site`, which a browser omits over plain HTTP — the API's own,
 *   so a self-host opened at an address other than its configured URL works;
 * - it carries neither header — not a browser (curl, a script): every browser
 *   in use sends one of them on a cross-site POST, and no page can set them.
 */
export function originCheck(allowedOrigins: readonly string[]) {
  return createMiddleware<AppEnv>(async (c, next) => {
    if (SAFE_METHOD.test(c.req.method)) return next()
    if (c.req.header('Authorization')?.startsWith('Bearer ')) return next()
    if (!c.req.header('Cookie')) return next()

    const site = c.req.header('Sec-Fetch-Site')
    const origin = c.req.header('Origin')
    if (site === undefined && origin === undefined) return next()
    if (site === 'same-origin' || site === 'none') return next()
    if (origin !== undefined) {
      if (allowedOrigins.includes(origin)) return next()
      // Only without Sec-Fetch-Site: a browser that sends it says
      // `same-origin` for a truly same-origin write, and behind a proxy that
      // ends TLS the URL here is `http://` — an injected http page on the
      // same host would match it.
      if (site === undefined && origin === new URL(c.req.url).origin) return next()
    }

    return c.json({ error: CROSS_ORIGIN_REFUSED }, 403)
  })
}
