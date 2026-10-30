import { recordOrganizationUpdate, recordSignIn, startAuditPurgeLoop } from '../lib/audit.js'
import { serve } from '@hono/node-server'
import { getConnInfo } from '@hono/node-server/conninfo'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { mkdirSync } from 'node:fs'
import { randomBytes } from 'node:crypto'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { DrizzleDatabaseAdapter, schema } from '@awaitstep/db'
import { createApp, createAuth } from '../index.js'
import { createTokenCrypto } from '../lib/token-crypto.js'
import { createLogger } from '../lib/logger.js'
import {
  clientIpPolicyFromEnv,
  compileClientIpPolicy,
  PROXY_CLIENT_HEADER,
  PROXY_SECRET_HEADER,
  resolveClientIp,
} from '../lib/client-ip.js'
import { loadNodeRegistry } from '../lib/node-registry-fs.js'
import { createRemoteNodeRegistry } from '../lib/remote-node-registry.js'
import { ACCESS_REASONS } from '@awaitstep/ir'
import { createAppEmails, createEmailService, type EmailService } from '../lib/email.js'
import { startRunSyncLoop } from '../lib/run-sync.js'
import {
  NodeWranglerDeployer,
  NodeTestSessionRunner,
  releaseClaimedPorts,
} from '@awaitstep/provider-cloudflare'
import { abandonStaleNodeSessions, startTestSessionReaper } from '../lib/test-sessions.js'
import { resolveTestSessionLimits } from '../lib/test-session-policy.js'
import { testSessionLimitsFromEnv } from '../lib/test-session-env.js'

const DEFAULT_REGISTRY_URL = 'https://raw.githubusercontent.com/awaitstep/awaitstep/main/registry'

const __appRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..')

async function initDatabase() {
  const databaseUrl = process.env['DATABASE_URL']

  if (databaseUrl) {
    const { Pool } = await import('pg')
    const { drizzle } = await import('drizzle-orm/node-postgres')
    const { migrate } = await import('drizzle-orm/node-postgres/migrator')

    const pool = new Pool({ connectionString: databaseUrl })
    const pgSchema = schema.pg
    const drizzleDb = drizzle(pool, { schema: pgSchema })
    await migrate(drizzleDb, { migrationsFolder: resolve(__appRoot, 'packages/db/drizzle/pg') })

    return { drizzleDb, dbSchema: pgSchema, provider: 'pg' as const }
  }

  const Database = (await import('better-sqlite3')).default
  const { drizzle } = await import('drizzle-orm/better-sqlite3')
  const { migrate } = await import('drizzle-orm/better-sqlite3/migrator')

  const dataDir = process.env['DATA_DIR'] ?? '/app/data'
  mkdirSync(dataDir, { recursive: true })

  const sqlite = new Database(resolve(dataDir, 'awaitstep.db'))
  sqlite.pragma('journal_mode = WAL')
  sqlite.pragma('foreign_keys = ON')

  const sqliteSchema = schema.sqlite
  const drizzleDb = drizzle(sqlite, { schema: sqliteSchema })
  migrate(drizzleDb, { migrationsFolder: resolve(__appRoot, 'packages/db/drizzle/sqlite') })

  return { drizzleDb, dbSchema: sqliteSchema, provider: 'sqlite' as const }
}

async function start() {
  const logger = createLogger('app')
  const { drizzleDb, dbSchema, provider } = await initDatabase()
  logger.info(`Database: ${process.env['DATABASE_URL'] ? 'postgres' : 'sqlite'}`)

  const tokenEncryptionKey = process.env['TOKEN_ENCRYPTION_KEY']
  if (!tokenEncryptionKey) {
    throw new Error('TOKEN_ENCRYPTION_KEY is required. Generate with: openssl rand -hex 32')
  }
  const tokenCrypto = await createTokenCrypto(tokenEncryptionKey)
  const db = new DrizzleDatabaseAdapter(drizzleDb, dbSchema, { tokenCrypto })

  const authSecret = process.env['BETTER_AUTH_SECRET']
  if (!authSecret) {
    throw new Error('BETTER_AUTH_SECRET is required. Generate with: openssl rand -hex 32')
  }

  const apiPort = Number(process.env['PORT'] ?? 8080)
  const webPort = Number(process.env['WEB_PORT'] ?? 3000)
  const baseURL = process.env['BETTER_AUTH_URL'] ?? `http://localhost:${apiPort}`

  const resendApiKey = process.env['RESEND_API_KEY']
  const appName = process.env['APP_NAME']
  // Where the web app is: invite links point there. One origin in the
  // reference deployment (the proxy in front serves both), so the API's own
  // URL is the default.
  const webUrl = process.env['WEB_URL'] ?? baseURL
  const logLinks = process.env['LOG_EMAIL_LINKS'] === '1'
  let emailService: EmailService | null = null
  let sendMagicLink:
    ((data: { email: string; url: string; token: string }) => Promise<void>) | undefined
  if (resendApiKey) {
    emailService = createEmailService({
      apiKey: resendApiKey,
      fromAddress: process.env['RESEND_FROM_EMAIL'],
      appName,
      appUrl: baseURL,
    })
    const service = emailService
    sendMagicLink = (data) => service.sendMagicLink(data)
    logger.info('Email: Resend configured')
  } else {
    // Left undefined, this unregisters the magic-link plugin entirely and the
    // sign-in route 404s — so a self-host with no Resend key and no OAuth had
    // no way in at all, while the log promised the link would be printed. A
    // link is a sign-in, and logs are not a private place: it is printed only
    // when LOG_EMAIL_LINKS asks for it (dev and QA stacks), else just the fact.
    sendMagicLink = async (data) => {
      logger.warn(
        logLinks
          ? `Magic link for ${data.email}: ${data.url}`
          : `Magic link for ${data.email} not sent: no email service (set LOG_EMAIL_LINKS=1 to log links)`,
      )
    }
    logger.warn(
      logLinks
        ? 'RESEND_API_KEY not set — magic link and invite emails will be logged to console'
        : 'RESEND_API_KEY not set — no email can be sent (LOG_EMAIL_LINKS=1 logs the links instead)',
    )
  }
  const emails = createAppEmails({
    webUrl,
    service: emailService,
    logLinks,
    log: (message) => logger.warn(message),
  })

  const auth = createAuth({
    baseURL,
    secret: authSecret,
    deleteOrganizationProblem: async (organizationId) => {
      const left = await db.countProjectsInOrganization(organizationId)
      return left > 0 ? ACCESS_REASONS.projectsLeft(left) : null
    },
    onSessionCreated: (session) => recordSignIn(db, session),
    onOrganizationUpdated: (data) => recordOrganizationUpdate(db, data),
    // Through drizzle, not the raw handle. Better-auth's own dialects map a
    // field to a column of the same name, and the postgres schema names
    // columns `email_verified`, `expires_at`, `user_id` — so every insert it
    // owns failed and nobody could sign in. SQLite only escaped that because
    // its schema happens to name columns `emailVerified`. The drizzle
    // adapter reads the mapping off the schema, so both dialects work and
    // this matches what the Workers entry already does.
    database: drizzleAdapter(drizzleDb, { provider, schema: dbSchema }),
    trustedOrigins: [baseURL],
    sendMagicLink,
    github: process.env['GITHUB_CLIENT_ID']
      ? {
          clientId: process.env['GITHUB_CLIENT_ID'],
          clientSecret: process.env['GITHUB_CLIENT_SECRET']!,
        }
      : undefined,
    google: process.env['GOOGLE_CLIENT_ID']
      ? {
          clientId: process.env['GOOGLE_CLIENT_ID'],
          clientSecret: process.env['GOOGLE_CLIENT_SECRET']!,
        }
      : undefined,
  })

  const registryPath = resolve(__appRoot, 'nodes/registry.json')
  let nodeRegistry
  try {
    nodeRegistry = await loadNodeRegistry(registryPath)
    logger.info(`Node registry loaded: ${nodeRegistry.registry.size} nodes`)
  } catch {
    logger.warn('Node registry not found — run `pnpm nodes:build` to generate it')
  }

  const registryUrl = process.env['REGISTRY_URL'] ?? DEFAULT_REGISTRY_URL
  const remoteNodeRegistry = createRemoteNodeRegistry({ baseUrl: registryUrl })
  logger.info(`Remote node registry: ${registryUrl}`)

  // ── API server ──────────────────────────────────────
  const testSessionLimits = testSessionLimitsFromEnv(process.env)
  const testSessionRunner = new NodeTestSessionRunner()

  // Who may name the client. The web server's own SSR calls prove
  // themselves with a secret that lives only in this process; a reverse
  // proxy in front proves itself with TRUSTED_PROXY_SECRET. Addresses are
  // never enough on their own — workflow code runs on this host too.
  const webHopSecret = randomBytes(32).toString('hex')
  const externalProxy = clientIpPolicyFromEnv(process.env)
  if (externalProxy.proxySecrets.length === 0 && externalProxy.trustedProxies.length === 0) {
    // An upgrade from a release that trusted X-Forwarded-For lands here with
    // a proxy still in front: warn, not inform — it is the one setting that
    // silently merges every user into one rate limit.
    logger.warn(
      'TRUSTED_PROXY_SECRET is not set: X-Forwarded-For is ignored and every client is keyed on its own connection. Behind a reverse proxy that means every user shares the proxy’s address and rate limits — set TRUSTED_PROXY_SECRET and have the proxy send it (see the reverse proxy guide).',
    )
  }
  const webHopPolicy = compileClientIpPolicy(externalProxy)

  const apiApp = createApp({
    db,
    auth,
    logger,
    corsOrigin: baseURL,
    isDev: false,
    enableLocalDev: process.env['ENABLE_LOCAL_DEV'] === 'true',
    nodeRegistry,
    remoteNodeRegistry,
    appName,
    deployer: new NodeWranglerDeployer(),
    testSessionRunner: testSessionRunner,
    testSessionLimits: testSessionLimits,
    emails,

    connectionAddress: (c) => getConnInfo(c).remote.address,
    clientIpPolicy: {
      ...externalProxy,
      proxySecrets: [webHopSecret, ...externalProxy.proxySecrets],
    },
  })

  // Before anything reaps: the previous run's sessions name processes this
  // host no longer has, and those numbers get reused.
  const abandoned = await abandonStaleNodeSessions(db)
  if (abandoned > 0) {
    logger.info(`Wrote off ${abandoned} test session(s) left by a previous run`)
  }

  serve({ fetch: apiApp.fetch, port: apiPort })
  logger.info(`API running on http://localhost:${apiPort}`)

  // Background reconciliation: run status + per-step telemetry sync off the
  // request path (API run reads are pure DB queries).
  const stopRunSync = startRunSyncLoop(db, 5000)
  const stopAuditPurge = startAuditPurgeLoop(db)
  // Disposable workers cost nothing here, but they still hold ports and
  // directories; the same loop keeps them from outliving their window.
  const stopTestSessionReaper = startTestSessionReaper(
    { db, runner: testSessionRunner, limits: resolveTestSessionLimits(testSessionLimits) },
    30_000,
  )

  // ── Web server (static + SSR) ───────────────────────
  const { Hono } = await import('hono')
  const { serveStatic } = await import('@hono/node-server/serve-static')

  const webApp = new Hono()
  const webClientDir = resolve(__appRoot, 'apps/web/dist/client')

  // Static assets (JS/CSS bundles, favicon, logo, etc.)
  webApp.use('/*', serveStatic({ root: webClientDir }))

  // SSR fallback for page routes
  const ssrPath = resolve(__appRoot, 'apps/web/dist/server/server.js')
  const ssrModule = await import(ssrPath)
  const ssrServer = ssrModule.default

  // The web server is a trusted hop for its own SSR calls to the API: it
  // resolves the client under the same rules as the API, then states it
  // with the per-process secret, which the pages forward. Whatever proof
  // headers the request arrived with are dropped first — only this process
  // may vouch for itself.
  webApp.all('/*', async (c) => {
    const client = resolveClientIp(c.req, getConnInfo(c).remote.address, webHopPolicy)
    const headers = new Headers(c.req.raw.headers)
    headers.delete(PROXY_CLIENT_HEADER)
    headers.set(PROXY_SECRET_HEADER, webHopSecret)
    if (client) headers.set(PROXY_CLIENT_HEADER, client)
    return ssrServer.fetch(new Request(c.req.raw, { headers }))
  })

  serve({ fetch: webApp.fetch, port: webPort })
  logger.info(`Web running on http://localhost:${webPort}`)

  const shutdown = () => {
    stopRunSync()
    stopAuditPurge()
    stopTestSessionReaper()
    // Claims only describe this process's in-flight starts.
    releaseClaimedPorts()
    process.exit(0)
  }
  process.on('SIGTERM', shutdown)
  process.on('SIGINT', shutdown)
}

// One readable line. Left unhandled, Node prints the throwing source line —
// in the bundled build that is the whole minified file, and the message
// itself scrolls out of `docker logs`.
start().catch((err: unknown) => {
  createLogger('app').error(`Startup failed: ${err instanceof Error ? err.message : String(err)}`)
  process.exit(1)
})
