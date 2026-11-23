import { describe, it, expect } from 'vitest'
import { AsyncLocalStorage } from 'node:async_hooks'
import { sql } from 'drizzle-orm'
import type { PoolConfig } from 'pg'
import {
  createPgWorkerDatabaseAdapter,
  createRequestScopedPg,
  type RequestPool,
} from '../pg-worker.js'

interface FakePool extends RequestPool {
  label: string
  config: PoolConfig
  queries: string[]
  released: number
}

function fakePools() {
  const pools: FakePool[] = []
  const createPool = (config: PoolConfig): RequestPool => {
    const query = async (q: { text: string } | string) => {
      pool.queries.push(typeof q === 'string' ? q : q.text)
      return { rows: [{ pool: pool.label }], fields: [{ name: 'pool' }], rowCount: 1 }
    }
    const pool: FakePool = {
      label: `pool-${pools.length + 1}`,
      config,
      queries: [],
      released: 0,
      query: query as unknown as RequestPool['query'],
      connect: (async () => ({
        query,
        release: () => {
          pool.released += 1
        },
      })) as unknown as RequestPool['connect'],
    }
    pools.push(pool)
    return pool
  }
  return { pools, createPool }
}

async function whichPool(db: ReturnType<typeof createRequestScopedPg>['db']): Promise<string> {
  const result = await db.execute(sql`select 1`)
  return (result.rows[0] as { pool: string }).pool
}

describe('createRequestScopedPg', () => {
  it('gives every request a pool of its own, even when requests overlap', async () => {
    const { pools, createPool } = fakePools()
    const scoped = createRequestScopedPg({
      connectionString: 'postgres://h/db',
      createPool,
      storage: new AsyncLocalStorage(),
    })

    const [a, b] = await Promise.all([
      scoped.run(async () => {
        await new Promise((resolve) => setTimeout(resolve, 5))
        return [await whichPool(scoped.db), await whichPool(scoped.db)]
      }),
      scoped.run(() => whichPool(scoped.db)),
    ])

    expect(pools).toHaveLength(2)
    expect(a).toEqual(['pool-1', 'pool-1'])
    expect(b).toBe('pool-2')
  })

  it('keeps the request’s pool for work it starts and finishes later, like a streamed response', async () => {
    const { createPool } = fakePools()
    const scoped = createRequestScopedPg({
      connectionString: 'postgres://h/db',
      createPool,
      storage: new AsyncLocalStorage(),
    })
    let later: Promise<string> | undefined

    await scoped.run(async () => {
      later = new Promise((resolve) => setTimeout(resolve, 5)).then(() => whichPool(scoped.db))
    })
    await scoped.run(() => whichPool(scoped.db))

    expect(await later).toBe('pool-1')
  })

  it('runs a transaction on a connection checked out of the request’s own pool', async () => {
    const { pools, createPool } = fakePools()
    const scoped = createRequestScopedPg({
      connectionString: 'postgres://h/db',
      createPool,
      storage: new AsyncLocalStorage(),
    })

    const inside = await scoped.run(() =>
      scoped.db.transaction(async (tx) => {
        const result = await tx.execute(sql`select 1`)
        return (result.rows[0] as { pool: string }).pool
      }),
    )

    expect(inside).toBe('pool-1')
    expect(pools[0]?.queries).toEqual(['begin', 'select 1', 'commit'])
    expect(pools[0]?.released).toBe(1)
  })

  it('caps a request at five connections unless told otherwise, and passes the URL on', async () => {
    const { pools, createPool } = fakePools()
    const scoped = createRequestScopedPg({
      connectionString: 'postgres://h/db',
      createPool,
      storage: new AsyncLocalStorage(),
    })
    const three = createRequestScopedPg({
      connectionString: 'postgres://h/other',
      createPool,
      storage: new AsyncLocalStorage(),
      maxConnections: 3,
    })

    scoped.run(() => undefined)
    three.run(() => undefined)

    expect(pools.map((p) => p.config)).toEqual([
      { connectionString: 'postgres://h/db', max: 5, idleTimeoutMillis: 1_000 },
      { connectionString: 'postgres://h/other', max: 3, idleTimeoutMillis: 1_000 },
    ])
  })

  it('refuses a query outside any request, with a message that says why', async () => {
    const { pools, createPool } = fakePools()
    const scoped = createRequestScopedPg({
      connectionString: 'postgres://h/db',
      createPool,
      storage: new AsyncLocalStorage(),
    })

    const failure = await scoped.db.execute(sql`select 1`).catch((err: unknown) => err)
    expect((failure as Error & { cause?: Error }).cause?.message).toMatch(/outside a request/)
    await expect(scoped.db.transaction(async () => undefined)).rejects.toThrow(/outside a request/)
    expect(pools).toHaveLength(0)
  })

  it('lets the app build its adapter before any request is open', async () => {
    const { pools, createPool } = fakePools()
    const scoped = createRequestScopedPg({
      connectionString: 'postgres://h/db',
      createPool,
      storage: new AsyncLocalStorage(),
    })

    expect(() => createPgWorkerDatabaseAdapter(scoped)).not.toThrow()
    expect(pools).toHaveLength(0)
  })
})
