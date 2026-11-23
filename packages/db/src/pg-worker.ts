import pg from 'pg'
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres'
import * as pgSchema from './schema/pg/index.js'
import { DrizzleDatabaseAdapter, type DrizzleAdapterOptions } from './adapters/index.js'

type PgDrizzle = NodePgDatabase<typeof pgSchema>

/** What a request's pool must offer: the part of `pg.Pool` drizzle uses. */
export interface RequestPool {
  query: pg.Pool['query']
  connect: pg.Pool['connect']
}

/**
 * Where a request's pool is kept while its work runs: an `AsyncLocalStorage`
 * (from `node:async_hooks`), which the Worker entry creates, since only entry
 * files may import Node's modules.
 */
export interface RequestStorage<T> {
  getStore(): T | undefined
  run<R>(store: T, fn: () => R): R
}

export interface RequestScopedPgOptions {
  /** The Hyperdrive binding's `connectionString`, or any Postgres URL. */
  connectionString: string
  /**
   * Connections one request may hold at once. A Worker invocation may keep
   * six outbound connections open, so the default 5 leaves one for `fetch`.
   */
  maxConnections?: number
  /**
   * How long an unused connection stays open. Short, because an open one
   * counts against the six even while idle, and fetches queue behind it.
   */
  idleTimeoutMs?: number
  /** A fresh `new AsyncLocalStorage()`, used by this handle alone. */
  storage: RequestStorage<unknown>
  /** Builds a request's pool; tests swap in a fake. */
  createPool?: (config: pg.PoolConfig) => RequestPool
}

/** Postgres for a Worker: one drizzle handle, a pool of its own per request. */
export interface RequestScopedPg {
  /**
   * The handle the app keeps for its whole life. Each query runs on the pool
   * of the `run` it is called inside; outside any `run` it is refused.
   */
  db: PgDrizzle
  /** Runs `fn` with a pool opened for it alone. */
  run<T>(fn: () => T): T
}

const OUTSIDE_A_REQUEST =
  'Postgres was queried outside a request: wrap the handler in the database scope’s run()'

// The client the one drizzle handle is built on. It holds no connection: each
// call goes to the pool of the request it is made in. Its name must contain
// "Pool", which is how drizzle knows to check a connection out for a
// transaction rather than run BEGIN on a shared client.
class RequestScopedPool {
  constructor(private readonly storage: RequestStorage<RequestPool>) {}

  private current(): RequestPool {
    const pool = this.storage.getStore()
    if (!pool) throw new Error(OUTSIDE_A_REQUEST)
    return pool
  }

  query(...args: unknown[]): unknown {
    const pool = this.storage.getStore()
    if (!pool) return Promise.reject(new Error(OUTSIDE_A_REQUEST))
    return (pool.query as (...a: unknown[]) => unknown).apply(pool, args)
  }

  connect(): Promise<pg.PoolClient> {
    const pool = this.current()
    return (pool.connect as () => Promise<pg.PoolClient>).call(pool)
  }
}

/**
 * Postgres for the Workers runtime, where a socket opened while handling one
 * request cannot be used by another: the app is built once per isolate, but
 * every request (and every cron run) gets its own pool, found through
 * `AsyncLocalStorage`. Hyperdrive pools the connections to the database
 * itself, so opening one is cheap; a request's connections close after a
 * short idle time, and at the latest when the request ends.
 */
export function createRequestScopedPg(options: RequestScopedPgOptions): RequestScopedPg {
  const createPool = options.createPool ?? ((config) => new pg.Pool(config))
  const config: pg.PoolConfig = {
    connectionString: options.connectionString,
    max: options.maxConnections ?? 5,
    idleTimeoutMillis: options.idleTimeoutMs ?? 1_000,
  }
  const storage = options.storage as RequestStorage<RequestPool>
  const client = new RequestScopedPool(storage)
  const db = drizzle(client as unknown as pg.Pool, { schema: pgSchema })

  return {
    db,
    // pg connects lazily: a request that never queries opens nothing.
    run: (fn) => storage.run(createPool(config), fn),
  }
}

/** The app's database adapter over a request-scoped Postgres handle. */
export function createPgWorkerDatabaseAdapter(
  scoped: RequestScopedPg,
  options?: DrizzleAdapterOptions,
): DrizzleDatabaseAdapter {
  return new DrizzleDatabaseAdapter(scoped.db, pgSchema, { ...options, dialect: 'pg' })
}

export { pgSchema }
