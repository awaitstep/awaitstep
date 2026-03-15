import { createMiddleware } from 'hono/factory'
import type { AppEnv } from '../types.js'
import type { Auth } from '../auth/config.js'

export function createAuthMiddleware(auth: Auth) {
  return createMiddleware<AppEnv>(async (c, next) => {
    const session = await auth.api.getSession({
      headers: c.req.raw.headers,
    })

    if (!session) {
      return c.json({ error: 'Unauthorized' }, 401)
    }

    c.set('user', session.user)
    c.set('session', session.session)
    c.set('userId', session.user.id)
    await next()
  })
}
