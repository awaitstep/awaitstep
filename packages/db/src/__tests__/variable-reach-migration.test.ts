import { describe, it, expect, afterEach, vi } from 'vitest'

// PGlite migrates a fresh database per test; under a parallel `pnpm test` that
// runs past vitest's 5s default.
vi.setConfig({ testTimeout: 30_000, hookTimeout: 30_000 })
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import Database from 'better-sqlite3'
import { PGlite } from '@electric-sql/pglite'
import { drizzle as drizzleSqlite } from 'drizzle-orm/better-sqlite3'
import { migrate as migrateSqlite } from 'drizzle-orm/better-sqlite3/migrator'
import { drizzle as drizzlePg } from 'drizzle-orm/pglite'
import { migrate as migratePg } from 'drizzle-orm/pglite/migrator'

// Variable reach: variables that existed before it keep applying to every
// workspace and project (`all_places` defaults to on), so no deploy loses a value.

const SQLITE_FOLDER = fileURLToPath(new URL('../../drizzle/sqlite', import.meta.url))
const PG_FOLDER = fileURLToPath(new URL('../../drizzle/pg', import.meta.url))
const TAG = 'variable_reach'

const temps: string[] = []
afterEach(() => {
  for (const dir of temps.splice(0)) rmSync(dir, { recursive: true, force: true })
})

function folderBefore(folder: string): string {
  const dir = mkdtempSync(join(tmpdir(), 'awaitstep-migrations-'))
  temps.push(dir)
  cpSync(folder, dir, { recursive: true })
  const journalPath = join(dir, 'meta', '_journal.json')
  const journal = JSON.parse(readFileSync(journalPath, 'utf8')) as { entries: { tag: string }[] }
  const index = journal.entries.findIndex((entry) => entry.tag.endsWith(`_${TAG}`))
  expect(index, `migration ${TAG} is in the journal`).toBeGreaterThan(0)
  journal.entries = journal.entries.slice(0, index)
  writeFileSync(journalPath, JSON.stringify(journal))
  return dir
}

const now = '2026-11-01T00:00:00.000Z'

function seed(sqlite: boolean): string {
  const ts = `'${now}'${sqlite ? '' : '::timestamp'}`
  return `
  INSERT INTO organization (id, name, slug${sqlite ? ', createdAt' : ''}) VALUES ('org-1', 'Acme', 'acme'${sqlite ? `, '${now}'` : ''});
  INSERT INTO projects (id, organization_id, name, slug, created_at, updated_at) VALUES ('p-1', 'org-1', 'One', 'one', ${ts}, ${ts});
  INSERT INTO env_vars (id, organization_id, project_id, created_by, name, value, created_at, updated_at) VALUES
    ('v-org', 'org-1', NULL, 'u-1', 'REGION', 'eu', ${ts}, ${ts}),
    ('v-proj', 'org-1', 'p-1', 'u-1', 'API_URL', 'u', ${ts}, ${ts});
`
}

const SELECT = 'SELECT id, all_places FROM env_vars ORDER BY id'
const flat = (rows: { id: string; all_places: unknown }[]) =>
  rows.map((r) => [r.id, r.all_places === true || r.all_places === 1])

describe('variable reach migration', () => {
  it('keeps existing variables applying everywhere (sqlite)', () => {
    const sqlite = new Database(':memory:')
    sqlite.pragma('foreign_keys = ON')
    const db = drizzleSqlite(sqlite)
    migrateSqlite(db, { migrationsFolder: folderBefore(SQLITE_FOLDER) })
    sqlite.exec(seed(true))

    migrateSqlite(db, { migrationsFolder: SQLITE_FOLDER })

    expect(flat(sqlite.prepare(SELECT).all() as { id: string; all_places: unknown }[])).toEqual([
      ['v-org', true],
      ['v-proj', true],
    ])
    expect(sqlite.prepare('SELECT count(*) AS n FROM env_var_workspaces').get()).toEqual({ n: 0 })
  })

  it('keeps existing variables applying everywhere (pg)', async () => {
    const client = new PGlite()
    const db = drizzlePg(client)
    await migratePg(db, { migrationsFolder: folderBefore(PG_FOLDER) })
    await client.exec(seed(false))

    await migratePg(db, { migrationsFolder: PG_FOLDER })

    expect(flat((await client.query<{ id: string; all_places: unknown }>(SELECT)).rows)).toEqual([
      ['v-org', true],
      ['v-proj', true],
    ])
  })
})
