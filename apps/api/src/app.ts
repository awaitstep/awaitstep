import { Hono, type Context } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { cors } from 'hono/cors'
import { csrf } from 'hono/csrf'
import { bodyLimit } from 'hono/body-limit'
import { secureHeaders } from 'hono/secure-headers'
import { logger as honoLogger } from 'hono/logger'
import { requestId } from 'hono/request-id'
import type { AppEmails, AppEnv } from './types.js'
import type { Auth } from './auth/config.js'
import type { Logger } from './lib/logger.js'
import type { AppNodeRegistry } from './lib/node-registry.js'
import type { RemoteNodeRegistry } from './lib/remote-node-registry.js'
import type { WranglerDeployer } from '@awaitstep/provider-cloudflare'
import type { TestSessionRunner } from '@awaitstep/codegen'
import type { AccountProviders } from '@awaitstep/ir'
import type { ImageStore } from '@awaitstep/storage'
import type { TestSessionLimits } from './lib/test-session-policy.js'
import { createLogger } from './lib/logger.js'
import { createRouter } from './routes/index.js'
import { imageResponseHeaders, images } from './routes/images.js'
import { databaseImageStore } from './lib/images.js'
import { resolveTestSessionLimits } from './lib/test-session-policy.js'
import { MAX_REQUEST_BYTES } from './lib/request-limits.js'
import {
  compileClientIpPolicy,
  headersForAuth,
  ignoresForwarding,
  resolveClientIp,
  type ClientIpPolicy,
} from './lib/client-ip.js'

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
  /**
   * The TCP peer's address, read from the runtime the entry point owns.
   * Under the `proxied` policy it is the client unless it is a trusted proxy.
   */
  connectionAddress?: (c: Context<AppEnv>) => string | undefined
  /**
   * Whose word on the client address counts — see lib/client-ip.ts. Defaults
   * to trusting no one (every client keyed on its connection); the Node
   * entries add the proxy secrets, the Workers entry passes `edge`.
   */
  clientIpPolicy?: ClientIpPolicy
  /**
   * How invitations and their follow-ups are sent. Absent, nothing is sent
   * and the links are not even logged; the entry points pass a logger-backed
   * one when there is no mail service, as they do for magic links.
   */
  emails?: AppEmails
  /** Which ways in the instance turns on (`accountProvidersOf` the auth options). */
  accountProviders?: AccountProviders
  /**
   * Where uploaded photos' and logos' bytes live. Absent, the database
   * holds them, in the image rows themselves.
   */
  imageStore?: ImageStore
}

export function createApp(deps: AppDeps) {
  const log = deps.logger ?? createLogger('app')
  // Resolved once: the overrides come from the environment, and clamping
  // them on every request would be work with one answer.
  const resolvedTestSessionLimits = resolveTestSessionLimits(deps.testSessionLimits)
  const imageStore = deps.imageStore ?? databaseImageStore(deps.db)
  const app = new Hono<AppEnv>()

  // Request ID — unique ID for every request, returned in X-Request-Id header
  app.use('*', requestId())

  // Client address, once per request, under the deployment's trust policy —
  // compiled at startup, which also refuses a malformed TRUSTED_PROXIES.
  const clientIpPolicy = compileClientIpPolicy(
    deps.clientIpPolicy ?? { mode: 'proxied', proxySecrets: [], trustedProxies: [] },
  )
  let warnedIgnoredForwarding = false
  app.use('*', async (c, next) => {
    const peer = deps.connectionAddress?.(c)
    c.set('clientIp', resolveClientIp(c.req, peer, clientIpPolicy))
    if (!warnedIgnoredForwarding && ignoresForwarding(c.req, peer, clientIpPolicy)) {
      warnedIgnoredForwarding = true
      log.warn(
        'A request named its client in X-Forwarded-For / X-Real-IP without proving it came from a trusted proxy, so the header was ignored. If AwaitStep runs behind a reverse proxy, set TRUSTED_PROXY_SECRET and have the proxy send it — until then every user shares the proxy’s rate limits. See the reverse proxy guide.',
      )
    }
    await next()
  })

  // Request logger — logs method, path, and status for every request
  app.use('*', honoLogger())

  // A served image's own headers, set after secureHeaders' (see routes/images.ts).
  app.use('/api/images/*', imageResponseHeaders)

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
      allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
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

  // Better-auth handler. Its own limiter guards the sensitive paths (sign-in,
  // sign-up, password and email changes) and records the session address;
  // both read the address this app resolved, never a header a client can set.
  // An app-level limiter used to sit in front of every auth path, sign-out
  // and OAuth callbacks included — removed for this one.
  app.on(['POST', 'GET'], '/api/auth/*', (c) => {
    const headers = headersForAuth(c.req.raw.headers, c.get('clientIp'))
    return deps.auth.handler(new Request(c.req.raw, { headers }))
  })

  // DB + node registry + app config context
  app.use('/api/*', async (c, next) => {
    c.set('db', deps.db)
    if (deps.nodeRegistry) c.set('nodeRegistry', deps.nodeRegistry)
    if (deps.remoteNodeRegistry) c.set('remoteNodeRegistry', deps.remoteNodeRegistry)
    if (deps.appName) c.set('appName', deps.appName)
    c.set('accountProviders', deps.accountProviders)
    if (deps.deployer) c.set('deployer', deps.deployer)
    if (deps.testSessionRunner) c.set('testSessionRunner', deps.testSessionRunner)
    c.set('testSessionLimits', resolvedTestSessionLimits)
    c.set('emails', deps.emails)
    c.set('imageStore', imageStore)
    await next()
  })

  // Uploaded images, before the router: they are served without a session.
  app.route('/api/images', images)

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
