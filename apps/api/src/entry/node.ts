import { serve } from '@hono/node-server'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import { DrizzleDatabaseAdapter, schema } from '@awaitstep/db'
import { createApp, createAuth } from '../index.js'

const sqlite = new Database('awaitstep.db')
sqlite.pragma('journal_mode = WAL')
sqlite.pragma('foreign_keys = ON')

const sqliteSchema = schema.sqlite
const drizzleDb = drizzle(sqlite, { schema: sqliteSchema })

// Run migrations
const __dirname = dirname(fileURLToPath(import.meta.url))
const migrationsFolder = resolve(__dirname, '../../../../packages/db/drizzle')
migrate(drizzleDb, { migrationsFolder })

const db = new DrizzleDatabaseAdapter(drizzleDb, sqliteSchema)

const isDev = process.env['NODE_ENV'] !== 'production'
const authSecret = process.env['BETTER_AUTH_SECRET']
if (!authSecret && !isDev) {
  throw new Error('BETTER_AUTH_SECRET is required in production')
}

const baseURL = process.env['BETTER_AUTH_URL'] ?? 'http://localhost:3001'
const auth = createAuth({
  baseURL,
  secret: authSecret ?? 'dev-secret-do-not-use-in-production',
  database: sqlite,
  trustedOrigins: [
    baseURL,
    process.env['CORS_ORIGIN'] ?? 'http://localhost:3000',
  ],
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

const corsOrigin = process.env['CORS_ORIGIN'] ?? 'http://localhost:3000'
const app = createApp({ db, auth, corsOrigin, isDev })

const port = Number(process.env['PORT'] ?? 3001)
console.log(`API server running on http://localhost:${port}`)

serve({ fetch: app.fetch, port })
