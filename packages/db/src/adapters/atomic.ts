// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyDb = any

/** A built query that has not run yet: `db.insert(...).values(...)`. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type PendingQuery = any

/**
 * Runs the statements `build` returns as one unit: all of them commit, or
 * none do. Each driver has its own way to say that — better-sqlite3 wants a
 * synchronous transaction, D1 has no transactions but an atomic `batch`, and
 * Postgres takes an ordinary async transaction — so this is the one place
 * that knows which. A single statement is already a unit and runs alone.
 *
 * `build` receives the handle to build the queries on and must only build
 * them, never run them: what it returns is executed here. On Postgres it is
 * called twice when it returns several — once to count, once on the
 * transaction — so it must not have side effects.
 */
export async function atomically(db: AnyDb, build: (tx: AnyDb) => PendingQuery[]): Promise<void> {
  await runAtomically(db, build, false)
}

/**
 * As `atomically`, for statements that each return rows (`.returning()`):
 * what each one returned, in order.
 */
export async function atomicallyReturning<Row>(
  db: AnyDb,
  build: (tx: AnyDb) => PendingQuery[],
): Promise<Row[][]> {
  return (await runAtomically(db, build, true)) as Row[][]
}

async function runAtomically(
  db: AnyDb,
  build: (tx: AnyDb) => PendingQuery[],
  returning: boolean,
): Promise<unknown[][]> {
  if (db.resultKind === 'sync') {
    return db.transaction((tx: AnyDb) =>
      build(tx).map((query) => (returning ? query.all() : (query.run(), []))),
    )
  }
  const queries = build(db)
  if (queries.length === 0) return []
  if (queries.length === 1) return [(await queries[0]) as unknown[]]
  if (typeof db.batch === 'function') return (await db.batch(queries)) as unknown[][]
  return db.transaction(async (tx: AnyDb) => {
    const results: unknown[][] = []
    for (const query of build(tx)) results.push((await query) as unknown[])
    return results
  })
}
