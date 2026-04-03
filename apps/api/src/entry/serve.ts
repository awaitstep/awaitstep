import { serve } from '@hono/node-server'
import { serveStatic } from '@hono/node-server/serve-static'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { mkdirSync } from 'node:fs'
import { DrizzleDatabaseAdapter, schema } from '@awaitstep/db'
import { createApp, createAuth } from '../index.js'
import { createTokenCrypto } from '../lib/token-crypto.js'
import { createLogger } from '../lib/logger.js'
import { loadNodeRegistry } from '../lib/node-registry.js'
import { createRemoteNodeRegistry } from '../lib/remote-node-registry.js'
import { createEmailService } from '../lib/email.js'

const DEFAULT_REGISTRY_URL =
  'https://raw.githubusercontent.com/awaitstep/awaitstep.dev/main/registry'

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

    return { drizzleDb, dbSchema: pgSchema, rawDb: pool }
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

  return { drizzleDb, dbSchema: sqliteSchema, rawDb: sqlite }
}

async function start() {
  const logger = createLogger('app')
  const { drizzleDb, dbSchema, rawDb } = await initDatabase()
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
      appUrl: baseURL,
    })
    sendMagicLink = (data) => emailService.sendMagicLink(data)
    logger.info('Email: Resend configured')
  } else {
    logger.warn('RESEND_API_KEY not set — magic link emails will be logged to console')
  }

  const port = Number(process.env['PORT'] ?? 8080)
  const baseURL = process.env['BETTER_AUTH_URL'] ?? `http://localhost:${port}`
  const auth = createAuth({
    baseURL,
    secret: authSecret,
    database: rawDb,
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
  })

  const webClientDir = resolve(__appRoot, 'apps/web/dist/client')
  apiApp.use(
    '/assets/*',
    serveStatic({
      root: webClientDir,
      rewriteRequestPath: (path) => path,
    }),
  )

  const ssrPath = resolve(__appRoot, 'apps/web/dist/server/server.js')
  const ssrModule = await import(ssrPath)
  const ssrServer = ssrModule.default

  apiApp.all('*', async (c) => {
    const response = await ssrServer.fetch(c.req.raw)
    return response
  })

  logger.info(`AwaitStep running on http://localhost:${port}`)
  serve({ fetch: apiApp.fetch, port })

  process.on('SIGTERM', () => process.exit(0))
  process.on('SIGINT', () => process.exit(0))
}

start()
