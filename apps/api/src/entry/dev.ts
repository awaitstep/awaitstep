import { recordOrganizationUpdate, recordSignIn, startAuditPurgeLoop } from '../lib/audit.js'
import { serve } from '@hono/node-server'
import { getConnInfo } from '@hono/node-server/conninfo'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import { DrizzleDatabaseAdapter, schema } from '@awaitstep/db'
import { createApp, createAuth } from '../index.js'
import { cleanupLocalDevSessions } from '../routes/local-dev.js'
import { createTokenCrypto } from '../lib/token-crypto.js'
import { createLogger } from '../lib/logger.js'
import { clientIpPolicyFromEnv } from '../lib/client-ip.js'
import { loadNodeRegistry } from '../lib/node-registry-fs.js'
import { createRemoteNodeRegistry } from '../lib/remote-node-registry.js'
import { ACCESS_REASONS } from '@awaitstep/ir'
import { createAppEmails, createEmailService, type EmailService } from '../lib/email.js'
import { startRunSyncLoop } from '../lib/run-sync.js'
import { NodeWranglerDeployer, NodeTestSessionRunner } from '@awaitstep/provider-cloudflare'
import { testSessionLimitsFromEnv } from '../lib/test-session-env.js'
import { abandonStaleNodeSessions, startTestSessionReaper } from '../lib/test-sessions.js'
import { resolveTestSessionLimits } from '../lib/test-session-policy.js'
import { releaseClaimedPorts } from '@awaitstep/provider-cloudflare'

const DEFAULT_REGISTRY_URL = 'https://raw.githubusercontent.com/awaitstep/awaitstep/main/registry'

const sqlite = new Database('awaitstep.db')
sqlite.pragma('journal_mode = WAL')
sqlite.pragma('foreign_keys = ON')

const sqliteSchema = schema.sqlite
const drizzleDb = drizzle(sqlite, { schema: sqliteSchema })

// Run migrations
const __dirname = dirname(fileURLToPath(import.meta.url))
const migrationsFolder = resolve(__dirname, '../../../../packages/db/drizzle/sqlite')
migrate(drizzleDb, { migrationsFolder })

async function start() {
  const tokenEncryptionKey = process.env['TOKEN_ENCRYPTION_KEY']
  if (!tokenEncryptionKey) {
    throw new Error('TOKEN_ENCRYPTION_KEY is required. Generate with: openssl rand -hex 32')
  }
  const tokenCrypto = await createTokenCrypto(tokenEncryptionKey)
  const db = new DrizzleDatabaseAdapter(drizzleDb, sqliteSchema, { tokenCrypto })

  const isDev = process.env['NODE_ENV'] !== 'production'
  const authSecret = process.env['BETTER_AUTH_SECRET']
  if (!authSecret && !isDev) {
    throw new Error('BETTER_AUTH_SECRET is required in production')
  }

  const baseURL = process.env['BETTER_AUTH_URL'] ?? 'http://localhost:3001'
  // Dev accepts a comma-separated CORS_ORIGIN list so the web app can run on
  // alternate ports (e.g. 3003) and still pass auth trusted-origin checks.
  const corsOrigins = (process.env['CORS_ORIGIN'] ?? 'http://localhost:3000,http://localhost:3003')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean)
  const resendApiKey = process.env['RESEND_API_KEY']
  const appName = process.env['APP_NAME']
  // The web app's origin, for invite links: the first CORS origin is the Vite dev server.
  const webUrl = process.env['WEB_URL'] ?? corsOrigins[0] ?? baseURL
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
  }
  const auth = createAuth({
    baseURL,
    secret: authSecret ?? crypto.randomUUID(),
    deleteOrganizationProblem: async (organizationId) => {
      const left = await db.countProjectsInOrganization(organizationId)
      return left > 0 ? ACCESS_REASONS.projectsLeft(left) : null
    },
    onSessionCreated: (session) => recordSignIn(db, session),
    onOrganizationUpdated: (data) => recordOrganizationUpdate(db, data),
    rateLimit: !isDev,
    database: sqlite,
    trustedOrigins: [...new Set([baseURL, ...corsOrigins])],
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

  const betterStackToken = process.env['BETTERSTACK_SOURCE_TOKEN']
  const betterStackEndpoint = process.env['BETTERSTACK_ENDPOINT']
  const logger = createLogger(
    'app',
    betterStackToken && betterStackEndpoint
      ? { sourceToken: betterStackToken, endpoint: betterStackEndpoint }
      : undefined,
  )

  // Load node registry (built by `pnpm nodes:build`)
  const registryPath = resolve(__dirname, '../../../../nodes/registry.json')
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

  const testSessionLimits = testSessionLimitsFromEnv(process.env)
  const testSessionRunner = new NodeTestSessionRunner()
  const emails = createAppEmails({
    webUrl,
    service: emailService,
    // The dev server is its own inbox.
    logLinks: isDev,
    log: (message) => logger.warn(message),
  })

  const app = createApp({
    db,
    auth,
    logger,
    corsOrigin: corsOrigins,
    isDev,
    enableLocalDev: true,
    nodeRegistry,
    remoteNodeRegistry,
    appName,
    deployer: new NodeWranglerDeployer(),
    testSessionRunner,
    testSessionLimits,
    emails,

    connectionAddress: (c) => getConnInfo(c).remote.address,
    // The Vite dev server is not a trusted hop: in dev, SSR calls are keyed
    // on loopback like any other local caller.
    clientIpPolicy: clientIpPolicyFromEnv(process.env),
  })

  const port = Number(process.env['PORT'] ?? 8080)
  logger.info(`API server running on http://localhost:${port}`)

  serve({ fetch: app.fetch, port })

  // Background reconciliation: run status + per-step telemetry sync off the
  // request path, same as the production serve entry.
  const stopRunSync = startRunSyncLoop(db, 5000)
  const stopAuditPurge = startAuditPurgeLoop(db)
  // The dev entry reaps too: without it a session started here outlives its
  // window, keeps its port, and holds the developer's own concurrency slot.
  const stopTestSessionReaper = startTestSessionReaper(
    { db, runner: testSessionRunner, limits: resolveTestSessionLimits(testSessionLimits) },
    30_000,
  )
  const abandoned = await abandonStaleNodeSessions(db)
  if (abandoned > 0) {
    logger.info(`Wrote off ${abandoned} test session(s) left by a previous run`)
  }

  // Clean up local dev sessions on shutdown
  const stopBackground = () => {
    stopRunSync()
    stopAuditPurge()
    stopTestSessionReaper()
    releaseClaimedPorts()
  }

  process.on('SIGTERM', async () => {
    stopBackground()
    await cleanupLocalDevSessions()
    process.exit(0)
  })
  process.on('SIGINT', async () => {
    stopBackground()
    await cleanupLocalDevSessions()
    process.exit(0)
  })
}

start().catch((err: unknown) => {
  createLogger('app').error(`Startup failed: ${err instanceof Error ? err.message : String(err)}`)
  process.exit(1)
})
