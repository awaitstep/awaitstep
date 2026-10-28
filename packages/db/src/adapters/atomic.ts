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
 * that knows which.
 *
 * `build` receives the handle to build the queries on and must not run them
 * itself: it is called once, and what it returns is executed here.
 */
export async function atomically(db: AnyDb, build: (tx: AnyDb) => PendingQuery[]): Promise<void> {
  if (db.resultKind === 'sync') {
    db.transaction((tx: AnyDb) => {
      for (const query of build(tx)) query.run()
    })
    return
  }
  if (typeof db.batch === 'function') {
    const queries = build(db)
    if (queries.length > 0) await db.batch(queries)
    return
  }
  await db.transaction(async (tx: AnyDb) => {
    for (const query of build(tx)) await query
  })
}
