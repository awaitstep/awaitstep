import { serve } from '@hono/node-server'
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
import { loadNodeRegistry } from '../lib/node-registry.js'
import { createRemoteNodeRegistry } from '../lib/remote-node-registry.js'
import { createEmailService } from '../lib/email.js'

const DEFAULT_REGISTRY_URL =
  'https://raw.githubusercontent.com/awaitstep/awaitstep.dev/main/registry'

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

  const resendApiKey = process.env['RESEND_API_KEY']
  const appName = process.env['APP_NAME']
  let sendMagicLink:
    | ((data: { email: string; url: string; token: string }) => Promise<void>)
    | undefined
  if (resendApiKey) {
    const emailService = createEmailService({
      apiKey: resendApiKey,
      fromAddress: process.env['RESEND_FROM_EMAIL'],
      appName,
    })
    sendMagicLink = (data) => emailService.sendMagicLink(data)
  }

  const baseURL = process.env['BETTER_AUTH_URL'] ?? 'http://localhost:3001'
  const auth = createAuth({
    baseURL,
    secret: authSecret ?? crypto.randomUUID(),
    database: sqlite,
    trustedOrigins: [baseURL, process.env['CORS_ORIGIN'] ?? 'http://localhost:3000'],
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

  const corsOrigin = process.env['CORS_ORIGIN'] ?? 'http://localhost:3000'

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

  const app = createApp({
    db,
    auth,
    logger,
    corsOrigin,
    isDev,
    nodeRegistry,
    remoteNodeRegistry,
    appName,
  })

  const port = Number(process.env['PORT'] ?? 3001)
  logger.info(`API server running on http://localhost:${port}`)

  serve({ fetch: app.fetch, port })

  // Clean up local dev sessions on shutdown
  process.on('SIGTERM', async () => {
    await cleanupLocalDevSessions()
    process.exit(0)
  })
  process.on('SIGINT', async () => {
    await cleanupLocalDevSessions()
    process.exit(0)
  })
}

start()
