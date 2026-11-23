import { AsyncLocalStorage } from 'node:async_hooks'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import type { DrizzleAdapterOptions, DrizzleDatabaseAdapter } from '@awaitstep/db'
import { createD1DatabaseAdapter, createD1DrizzleDb, sqliteSchema } from '@awaitstep/db/d1'
import {
  createPgWorkerDatabaseAdapter,
  createRequestScopedPg,
  pgSchema,
  type RequestScopedPg,
} from '@awaitstep/db/pg-worker'

/** The bindings a Worker can keep the app's data behind. */
export interface WorkerDatabaseBindings {
  DB?: D1Database
  /** Postgres through Hyperdrive. When bound, it is used and D1 is not. */
  HYPERDRIVE?: Hyperdrive
}

/** The app's database on Workers, whichever binding holds it. */
export interface WorkerDatabase {
  dialect: 'pg' | 'sqlite'
  db: DrizzleDatabaseAdapter
  /** better-auth's adapter over the same database. */
  authDatabase: ReturnType<typeof drizzleAdapter>
  /** Runs one request's (or cron run's) work with its database connections. */
  run<T>(fn: () => T): T
}

// One request-scoped handle per connection string and isolate: the handle is
// cheap, but the app built on it is cached, so it must outlive one request.
const scopedByUrl = new Map<string, RequestScopedPg>()

function scopedPg(connectionString: string): RequestScopedPg {
  let scoped = scopedByUrl.get(connectionString)
  if (!scoped) {
    scoped = createRequestScopedPg({ connectionString, storage: new AsyncLocalStorage() })
    scopedByUrl.set(connectionString, scoped)
  }
  return scoped
}

/**
 * The app's database for this Worker's bindings: Postgres through Hyperdrive
 * when `HYPERDRIVE` is bound, else D1.
 */
export function workerDatabase(
  env: WorkerDatabaseBindings,
  options: DrizzleAdapterOptions,
): WorkerDatabase {
  if (env.HYPERDRIVE) {
    const scoped = scopedPg(env.HYPERDRIVE.connectionString)
    return {
      dialect: 'pg',
      db: createPgWorkerDatabaseAdapter(scoped, options),
      authDatabase: drizzleAdapter(scoped.db, { provider: 'pg', schema: pgSchema }),
      run: (fn) => scoped.run(fn),
    }
  }
  if (env.DB) {
    return {
      dialect: 'sqlite',
      db: createD1DatabaseAdapter(env.DB, options),
      authDatabase: drizzleAdapter(createD1DrizzleDb(env.DB), {
        provider: 'sqlite',
        schema: sqliteSchema,
      }),
      run: (fn) => fn(),
    }
  }
  throw new Error('No database bound: bind HYPERDRIVE (Postgres) or DB (D1) to the Worker')
}
