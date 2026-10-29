import { eq, type SQL } from 'drizzle-orm'
import type { Dialect } from './json-array.js'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyDb = any

/** How a write holds its project's row: deleting it, or changing something under it. */
export type ProjectRowHold = 'update' | 'no key update' | 'share'

/**
 * Runs `write` while holding the project's row, so writes that check one
 * another through it run one after the other. Postgres checks a statement's
 * conditions on the snapshot it started with: a project delete and a
 * workspace lock, or two workspace deletes, could each pass a check the other
 * was about to break. Holding the row makes the later one wait, and its
 * statement then starts on a fresh snapshot. SQLite and D1 run one write at
 * a time, so there `write` runs as is.
 *
 * `projectId` is the id, or a subquery that yields it.
 */
export async function holdingProjectRow<T>(
  db: AnyDb,
  dialect: Dialect,
  projects: AnyDb,
  projectId: string | SQL,
  hold: ProjectRowHold,
  write: (db: AnyDb) => Promise<T>,
): Promise<T> {
  if (dialect !== 'pg') return write(db)
  return db.transaction(async (tx: AnyDb) => {
    await tx.select({ id: projects.id }).from(projects).where(eq(projects.id, projectId)).for(hold)
    return write(tx)
  })
}
