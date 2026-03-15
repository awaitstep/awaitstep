import { Hono } from 'hono'
import { cors } from 'hono/cors'
import type { AppEnv } from './types.js'
import type { Auth } from './auth/config.js'
import { createRouter } from './routes/index.js'

export interface AppDeps {
  db: AppEnv['Variables']['db']
  auth: Auth
  corsOrigin?: string | string[]
  isDev?: boolean
}

export function createApp(deps: AppDeps) {
  const app = new Hono<AppEnv>()

  // Health check — no auth, no CORS
  app.get('/health', (c) => c.json({ status: 'ok' }))

  // Better-auth handler — mounted before CORS/auth middleware
  app.on(['POST', 'GET'], '/api/auth/*', (c) => {
    return deps.auth.handler(c.req.raw)
  })

  // CORS
  app.use(
    '/api/*',
    cors({
      origin: deps.corsOrigin ?? 'http://localhost:3000',
      allowHeaders: ['Content-Type', 'Authorization'],
      allowMethods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
      credentials: true,
    }),
  )

  // DB context
  app.use('/api/*', async (c, next) => {
    c.set('db', deps.db)
    await next()
  })

  // Routes (auth + ownership middleware registered inside)
  app.route('/api', createRouter(deps.auth))

  // Error handler
  app.onError((err, c) => {
    return c.json({ error: deps.isDev ? err.message : 'Internal server error' }, 500)
  })

  return app
}

export type App = ReturnType<typeof createApp>
