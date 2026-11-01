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

// Slugs that became page URLs (a project's `/members`, `/shared`…, the org's
// `/connections`, `/api-keys`): rows already using one are renamed, with a
// readable suffix, or their id when that is taken, and nothing else moves.

const SQLITE_FOLDER = fileURLToPath(new URL('../../drizzle/sqlite', import.meta.url))
const PG_FOLDER = fileURLToPath(new URL('../../drizzle/pg', import.meta.url))
const TAG = 'reserved_page_slugs'

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

function seed(withTimestamps: boolean): string {
  const at = withTimestamps ? `, '${now}', '${now}'` : ''
  const cols = withTimestamps ? ', created_at, updated_at' : ''
  const orgCols = withTimestamps ? ', createdAt' : ''
  const orgAt = withTimestamps ? `, '${now}'` : ''
  return `
  INSERT INTO organization (id, name, slug${orgCols}) VALUES ('org-1', 'Acme', 'acme'${orgAt});
  INSERT INTO projects (id, organization_id, name, slug${cols}) VALUES
    ('p-1', 'org-1', 'One', 'one'${at}),
    ('p-keys', 'org-1', 'Keys', 'api-keys'${at}),
    ('p-conn', 'org-1', 'Conn', 'connections'${at}),
    ('p-taken', 'org-1', 'Taken', 'connections-project'${at});
  INSERT INTO workspaces (id, project_id, name, slug${cols}) VALUES
    ('ws-sales', 'p-1', 'Sales', 'sales'${at}),
    ('ws-members', 'p-1', 'Members', 'members'${at}),
    ('Ws_Sh-red', 'p-1', 'Shared', 'shared'${at}),
    ('ws-shared-taken', 'p-1', 'Taken', 'shared-workspace'${at}),
    ('ws-settings-elsewhere', 'p-keys', 'Variables', 'variables'${at});
`
}

const EXPECTED_WORKSPACES = [
  // An id with capitals and `_` still makes a valid slug: lowercased, `_` as `-`.
  ['Ws_Sh-red', 'shared-ws-sh-re'],
  ['ws-members', 'members-workspace'],
  ['ws-sales', 'sales'],
  ['ws-settings-elsewhere', 'variables-workspace'],
  ['ws-shared-taken', 'shared-workspace'],
]
const EXPECTED_PROJECTS = [
  ['p-1', 'one'],
  ['p-conn', 'connections-p-conn'],
  ['p-keys', 'api-keys-project'],
  ['p-taken', 'connections-project'],
]

describe('reserved page slugs migration (sqlite)', () => {
  it('renames rows that took a page’s slug, and only those', () => {
    const sqlite = new Database(':memory:')
    sqlite.pragma('foreign_keys = ON')
    const db = drizzleSqlite(sqlite)
    migrateSqlite(db, { migrationsFolder: folderBefore(SQLITE_FOLDER) })
    sqlite.exec(seed(true))

    migrateSqlite(db, { migrationsFolder: SQLITE_FOLDER })

    const rows = (sql: string) =>
      (sqlite.prepare(sql).all() as { id: string; slug: string }[]).map((r) => [r.id, r.slug])
    expect(rows('SELECT id, slug FROM workspaces ORDER BY id')).toEqual(EXPECTED_WORKSPACES)
    expect(rows('SELECT id, slug FROM projects ORDER BY id')).toEqual(EXPECTED_PROJECTS)
  })
})

describe('reserved page slugs migration (pg)', () => {
  it('renames rows that took a page’s slug, and only those', async () => {
    const client = new PGlite()
    const db = drizzlePg(client)
    await migratePg(db, { migrationsFolder: folderBefore(PG_FOLDER) })
    await client.exec(seed(false))

    await migratePg(db, { migrationsFolder: PG_FOLDER })

    const rows = async (sql: string) =>
      (await client.query<{ id: string; slug: string }>(sql)).rows.map((r) => [r.id, r.slug])
    expect(await rows('SELECT id, slug FROM workspaces ORDER BY id')).toEqual(EXPECTED_WORKSPACES)
    expect(await rows('SELECT id, slug FROM projects ORDER BY id')).toEqual(EXPECTED_PROJECTS)
  })
})
