import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { csrf } from 'hono/csrf'
import { bodyLimit } from 'hono/body-limit'
import { requestId } from 'hono/request-id'
import type { AppEnv } from './types.js'
import type { Auth } from './auth/config.js'
import type { Logger } from './lib/logger.js'
import { createLogger } from './lib/logger.js'
import { createRouter } from './routes/index.js'
import { createRateLimiter } from './middleware/rate-limit.js'

export interface SelfHostedConnection {
  accountId: string
  apiToken: string
  name?: string
}

export interface AppDeps {
  db: AppEnv['Variables']['db']
  auth: Auth
  logger?: Logger
  corsOrigin?: string | string[]
  isDev?: boolean
  selfHostedConnection?: SelfHostedConnection
}

export function createApp(deps: AppDeps) {
  const log = deps.logger ?? createLogger('app')
  const app = new Hono<AppEnv>()

  // Request ID — unique ID for every request, returned in X-Request-Id header
  app.use('*', requestId())

  // Health check — no auth, no CORS
  app.get('/health', (c) => c.json({ status: 'ok' }))

  // CORS — must be before auth handler so preflight and response headers apply
  app.use(
    '/api/*',
    cors({
      origin: deps.corsOrigin ?? 'http://localhost:3000',
      allowHeaders: ['Content-Type', 'Authorization'],
      allowMethods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
      credentials: true,
    }),
  )

  // Body size limit — 1MB default for all API routes
  app.use('/api/*', bodyLimit({ maxSize: 1024 * 1024 }))

  // CSRF protection — origin check for cookie-based auth
  // Skips when: (a) using bearer token auth, or (b) no cookie header (no session to abuse)
  const csrfOrigin = deps.corsOrigin ?? 'http://localhost:3000'
  if (csrfOrigin === '*') {
    log.warn('CSRF protection disabled — corsOrigin is set to wildcard')
  } else {
    const csrfMiddleware = csrf({ origin: csrfOrigin })
    app.use('/api/*', async (c, next) => {
      if (c.req.header('Authorization')?.startsWith('Bearer ')) {
        return next()
      }
      if (!c.req.header('Cookie')) {
        return next()
      }
      return csrfMiddleware(c, next)
    })
  }

  // Auth rate limit — 5 requests per minute per IP (login, signup, magic link)
  app.use('/api/auth/*', createRateLimiter({ windowMs: 60_000, max: 5 }))

  // Better-auth handler
  app.on(['POST', 'GET'], '/api/auth/*', (c) => {
    return deps.auth.handler(c.req.raw)
  })

  // DB context
  app.use('/api/*', async (c, next) => {
    c.set('db', deps.db)
    await next()
  })

  // Routes (auth + ownership middleware registered inside)
  app.route('/api', createRouter(deps.auth, deps.selfHostedConnection))

  // Error handler
  app.onError((err, c) => {
    const reqId = c.get('requestId')
    log.error(err.message, { requestId: reqId, method: c.req.method, path: c.req.path })
    return c.json(
      {
        error: deps.isDev ? err.message : 'Internal server error',
        ...(reqId && { requestId: reqId }),
      },
      500,
    )
  })

  return app
}

export type App = ReturnType<typeof createApp>
