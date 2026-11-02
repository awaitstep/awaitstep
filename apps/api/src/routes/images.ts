import { Hono } from 'hono'
import { createMiddleware } from 'hono/factory'
import { isImageId } from '@awaitstep/storage'
import type { AppEnv } from '../types.js'
import { createRateLimiter } from '../middleware/rate-limit.js'
import { imageBytes } from '../lib/images.js'

// `GET /api/images/:id`: an uploaded photo or logo, the one way any is
// served, with the same headers whichever store holds it. No session: the
// id is 128 random bits, and the invite page shows the logo before
// sign-in. An image its owner no longer names answers 404 at once.

/**
 * The headers every served image carries. Registered ahead of
 * `secureHeaders` in app.ts, so these are set last: its default
 * `Cross-Origin-Resource-Policy: same-origin` would stop the dashboard on
 * its own subdomain from showing the API's images.
 */
export const imageResponseHeaders = createMiddleware<AppEnv>(async (c, next) => {
  await next()
  if (c.res.status !== 200) return
  const headers = c.res.headers
  headers.set('X-Content-Type-Options', 'nosniff')
  // A day, and in the browser only: a removed photo stops showing within
  // that, and no shared cache keeps a copy.
  headers.set('Cache-Control', 'private, max-age=86400')
  // Opened on its own, the image runs nothing and loads nothing.
  headers.set('Content-Security-Policy', "default-src 'none'; sandbox")
  headers.set('Cross-Origin-Resource-Policy', 'same-site')
})

export const images = new Hono<AppEnv>()

// Pages with many avatars ask for many at once; once cached, not again that day.
images.use('*', createRateLimiter({ windowMs: 60_000, max: 600 }))

images.get('/:id', async (c) => {
  const id = c.req.param('id')
  if (!isImageId(id)) return c.json({ error: 'Not found' }, 404)
  const row = await c.get('db').getImage(id)
  if (!row) return c.json({ error: 'Not found' }, 404)
  const bytes = await imageBytes(c.get('imageStore'), id, row.data)
  if (!bytes) return c.json({ error: 'Not found' }, 404)
  return c.body(new Uint8Array(bytes), 200, {
    // The type detected from the bytes at upload, never one a client named.
    'Content-Type': row.contentType,
    'Content-Length': String(bytes.length),
  })
})
