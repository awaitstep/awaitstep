import { mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { schema } from '@awaitstep/db'

export interface NodeDatabaseOptions {
  /** `DATABASE_URL`: Postgres when set, else the SQLite file. */
  url: string | undefined
  /** Refuse to start on SQLite: the workspace runs on Postgres only. */
  postgresOnly?: boolean
  sqliteFile: string
  /** The repository root, which holds `packages/db/drizzle/<dialect>`. */
  appRoot: string
  /**
   * Apply pending Postgres migrations at startup. Off, a pending one stops
   * the start instead: the dev server's database may be a shared one.
   */
  migratePostgres: boolean
}

/** The command that applies the Postgres migrations to `DATABASE_URL`. */
export const PG_MIGRATE_COMMAND = 'pnpm --filter @awaitstep/db db:migrate:pg'

/**
 * The app's database for a Node entry, migrated (or checked) and ready.
 * Each driver is imported only when used, so a Postgres-only workspace never
 * loads SQLite's.
 */
export async function openNodeDatabase(options: NodeDatabaseOptions) {
  if (options.url) {
    const { Pool } = await import('pg')
    const { drizzle } = await import('drizzle-orm/node-postgres')
    const pool = new Pool({ connectionString: options.url })
    const drizzleDb = drizzle(pool, { schema: schema.pg })
    const migrationsFolder = resolve(options.appRoot, 'packages/db/drizzle/pg')
    if (options.migratePostgres) {
      const { migrate } = await import('drizzle-orm/node-postgres/migrator')
      await migrate(drizzleDb, { migrationsFolder })
    } else {
      const pending = await pendingPgMigrations(pool, migrationsFolder)
      if (pending > 0) {
        await pool.end()
        throw new Error(
          `${pending} database migration(s) are not applied to DATABASE_URL. The dev server does not migrate it: run \`${PG_MIGRATE_COMMAND}\` with DATABASE_URL set.`,
        )
      }
    }
    return { drizzleDb, dbSchema: schema.pg, provider: 'pg' as const }
  }

  if (options.postgresOnly) {
    throw new Error('DATABASE_URL is required: this workspace runs on Postgres only.')
  }
  const Database = (await import('better-sqlite3')).default
  const { drizzle } = await import('drizzle-orm/better-sqlite3')
  const { migrate } = await import('drizzle-orm/better-sqlite3/migrator')
  mkdirSync(dirname(options.sqliteFile), { recursive: true })
  const sqlite = new Database(options.sqliteFile)
  sqlite.pragma('journal_mode = WAL')
  sqlite.pragma('foreign_keys = ON')
  const drizzleDb = drizzle(sqlite, { schema: schema.sqlite })
  migrate(drizzleDb, {
    migrationsFolder: resolve(options.appRoot, 'packages/db/drizzle/sqlite'),
  })
  return { drizzleDb, dbSchema: schema.sqlite, provider: 'sqlite' as const }
}

interface PgQueryable {
  query: (text: string) => Promise<{ rows: { last: string | null }[] }>
}

/**
 * How many of the folder's migrations are newer than the last one the
 * database recorded, judged the way drizzle's migrator judges it.
 */
export async function pendingPgMigrations(
  pool: PgQueryable,
  migrationsFolder: string,
): Promise<number> {
  const { readMigrationFiles } = await import('drizzle-orm/migrator')
  const migrations = readMigrationFiles({ migrationsFolder })
  // Two statements: a missing table fails one that names it, whatever guards it.
  const table = await pool.query(`select to_regclass('drizzle.__drizzle_migrations')::text as last`)
  const recorded = table.rows[0]?.last
    ? await pool.query(`select max(created_at)::text as last from drizzle.__drizzle_migrations`)
    : { rows: [] }
  const last = Number(recorded.rows[0]?.last ?? 0)
  return migrations.filter((migration) => migration.folderMillis > last).length
}
