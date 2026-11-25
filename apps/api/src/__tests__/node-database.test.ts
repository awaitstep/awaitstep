import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { openNodeDatabase, pendingPgMigrations } from '../entry/node-database.js'

const APP_ROOT = resolve(import.meta.dirname, '../../../..')
const PG_MIGRATIONS = join(APP_ROOT, 'packages/db/drizzle/pg')
const journal = (
  await import(join(PG_MIGRATIONS, 'meta/_journal.json'), { with: { type: 'json' } })
).default as { entries: { when: number }[] }
const whens = journal.entries.map((entry) => entry.when)

/** A pool whose migrations table is absent (`null`) or records `last`. */
function poolRecording(last: number | null) {
  const statements: string[] = []
  return {
    statements,
    query: async (text: string) => {
      statements.push(text)
      if (text.includes('to_regclass')) {
        return { rows: [{ last: last === null ? null : 'drizzle.__drizzle_migrations' }] }
      }
      return { rows: [{ last: last === null ? null : String(last) }] }
    },
  }
}

describe('pendingPgMigrations', () => {
  it.each([
    ['a database never migrated', null, whens.length],
    ['one migrated up to the last', whens.at(-1)!, 0],
    ['one two migrations behind', whens.at(-3)!, 2],
  ])('counts what %s still needs', async (_, last, pending) => {
    await expect(pendingPgMigrations(poolRecording(last), PG_MIGRATIONS)).resolves.toBe(pending)
  })

  it('never names the migrations table when it does not exist', async () => {
    const pool = poolRecording(null)
    await pendingPgMigrations(pool, PG_MIGRATIONS)
    expect(pool.statements).toHaveLength(1)
  })
})

describe('openNodeDatabase', () => {
  let dir: string | undefined
  afterEach(() => {
    if (dir) rmSync(dir, { recursive: true, force: true })
    dir = undefined
  })

  it('refuses to open SQLite for a workspace that runs on Postgres only', async () => {
    dir = mkdtempSync(join(tmpdir(), 'node-db-'))
    const sqliteFile = join(dir, 'awaitstep.db')
    await expect(
      openNodeDatabase({
        url: undefined,
        postgresOnly: true,
        sqliteFile,
        appRoot: APP_ROOT,
        migratePostgres: false,
      }),
    ).rejects.toThrow(/DATABASE_URL is required/)
    const { existsSync } = await import('node:fs')
    expect(existsSync(sqliteFile)).toBe(false)
  })

  it('opens and migrates SQLite when no DATABASE_URL is set', async () => {
    dir = mkdtempSync(join(tmpdir(), 'node-db-'))
    const opened = await openNodeDatabase({
      url: undefined,
      sqliteFile: join(dir, 'nested', 'awaitstep.db'),
      appRoot: APP_ROOT,
      migratePostgres: false,
    })
    expect(opened.provider).toBe('sqlite')
  })
})
