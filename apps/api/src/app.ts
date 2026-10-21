import { Hono } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { cors } from 'hono/cors'
import { csrf } from 'hono/csrf'
import { bodyLimit } from 'hono/body-limit'
import { secureHeaders } from 'hono/secure-headers'
import { logger as honoLogger } from 'hono/logger'
import { requestId } from 'hono/request-id'
import type { AppEnv } from './types.js'
import type { Auth } from './auth/config.js'
import type { Logger } from './lib/logger.js'
import type { AppNodeRegistry } from './lib/node-registry.js'
import type { RemoteNodeRegistry } from './lib/remote-node-registry.js'
import type { WranglerDeployer } from '@awaitstep/provider-cloudflare'
import type { TestSessionRunner } from '@awaitstep/codegen'
import type { TestSessionLimits } from './lib/test-session-policy.js'
import { createLogger } from './lib/logger.js'
import { createRouter } from './routes/index.js'
import { createRateLimiter } from './middleware/rate-limit.js'
import { resolveTestSessionLimits } from './lib/test-session-policy.js'
import { MAX_REQUEST_BYTES } from './lib/request-limits.js'

export interface AppDeps {
  db: AppEnv['Variables']['db']
  auth: Auth
  logger?: Logger
  corsOrigin?: string | string[]
  isDev?: boolean
  enableLocalDev?: boolean
  runtime?: 'node' | 'workers'
  nodeRegistry?: AppNodeRegistry
  remoteNodeRegistry?: RemoteNodeRegistry
  appName?: string
  deployer?: WranglerDeployer
  /**
   * Runs workflows before they are deployed. Absent — the kill switch, or a
   * deployment with no container available — and the test-session routes
   * answer 501 rather than disappearing, so a client is told why.
   */
  testSessionRunner?: TestSessionRunner
  testSessionLimits?: Partial<Record<keyof TestSessionLimits, number | undefined>>
}

export function createApp(deps: AppDeps) {
  const log = deps.logger ?? createLogger('app')
  // Resolved once: the overrides come from the environment, and clamping
  // them on every request would be work with one answer.
  const resolvedTestSessionLimits = resolveTestSessionLimits(deps.testSessionLimits)
  const app = new Hono<AppEnv>()

  // Request ID — unique ID for every request, returned in X-Request-Id header
  app.use('*', requestId())

  // Request logger — logs method, path, and status for every request
  app.use('*', honoLogger())

  // Security headers — X-Content-Type-Options, X-Frame-Options, HSTS, etc.
  app.use('*', secureHeaders())

  // Health check — no auth, no CORS
  app.get('/api/health', (c) => c.json({ status: 'ok', runtime: deps.runtime ?? 'node' }))

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

  // Body size limit — 1MB default for all API routes. The refusal is JSON
  // like every other error here: the default is a plain-text body, which a
  // client parsing JSON cannot read.
  app.use(
    '/api/*',
    bodyLimit({
      maxSize: MAX_REQUEST_BYTES,
      onError: (c) => c.json({ error: `Request body exceeds ${MAX_REQUEST_BYTES} bytes` }, 413),
    }),
  )

  // CSRF protection — origin check for cookie-based auth
  // Skips when: (a) using bearer token auth, or (b) no cookie header (no session to abuse)
  const csrfOrigin = deps.corsOrigin ?? 'http://localhost:3000'
  if (csrfOrigin === '*') {
    if (!deps.isDev) {
      throw new Error(
        'Wildcard CORS origin is not allowed in production (credentials: true). Set CORS_ORIGIN to a specific origin.',
      )
    }
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
  // Excludes get-session since SSR hits it on every page load
  app.use('/api/auth/*', async (c, next) => {
    if (c.req.path.endsWith('/get-session')) return next()
    return createRateLimiter({ windowMs: 60_000, max: 5 })(c, next)
  })

  // Better-auth handler
  app.on(['POST', 'GET'], '/api/auth/*', (c) => {
    return deps.auth.handler(c.req.raw)
  })

  // DB + node registry + app config context
  app.use('/api/*', async (c, next) => {
    c.set('db', deps.db)
    if (deps.nodeRegistry) c.set('nodeRegistry', deps.nodeRegistry)
    if (deps.remoteNodeRegistry) c.set('remoteNodeRegistry', deps.remoteNodeRegistry)
    if (deps.appName) c.set('appName', deps.appName)
    if (deps.deployer) c.set('deployer', deps.deployer)
    if (deps.testSessionRunner) c.set('testSessionRunner', deps.testSessionRunner)
    c.set('testSessionLimits', resolvedTestSessionLimits)
    await next()
  })

  // Routes (auth + ownership middleware registered inside)
  app.route(
    '/api',
    createRouter(deps.auth, {
      ...(deps.enableLocalDev !== undefined && { enableLocalDev: deps.enableLocalDev }),
    }),
  )

  // Error handler
  app.onError((err, c) => {
    // An HTTPException already carries the answer — Hono's own middleware
    // throws them to refuse a request. Reporting one as a 500 blames the
    // server for something it refused correctly, and buries the status the
    // client needed. So the response it carries is kept, headers included:
    // a `WWW-Authenticate` or `Retry-After` is the useful half of some
    // refusals. Only a non-JSON body is replaced, because every other
    // error here is JSON and a client that parses one would choke on the
    // plain-text default.
    if (err instanceof HTTPException) {
      const res = err.getResponse()
      if (res.headers.get('content-type')?.includes('application/json')) return res
      const headers = new Headers(res.headers)
      headers.set('content-type', 'application/json; charset=UTF-8')
      headers.delete('content-length')
      return new Response(
        JSON.stringify({ error: err.message || res.statusText || 'Request refused' }),
        {
          status: res.status,
          headers,
        },
      )
    }
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
