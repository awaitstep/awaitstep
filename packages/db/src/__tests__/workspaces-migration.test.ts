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

// The workspaces migration changes rows, not just tables: every project gets
// a Default workspace, every workflow moves into it, and project slugs the
// dashboard now routes are renamed. So it is run against a database at the
// previous migration, seeded, and the rows checked afterwards.

const SQLITE_FOLDER = fileURLToPath(new URL('../../drizzle/sqlite', import.meta.url))
const PG_FOLDER = fileURLToPath(new URL('../../drizzle/pg', import.meta.url))
const TAG = 'workspaces'

const temps: string[] = []
afterEach(() => {
  for (const dir of temps.splice(0)) rmSync(dir, { recursive: true, force: true })
})

/** A copy of a migrations folder with the journal cut off before `tag`. */
function folderBefore(folder: string, tag: string): string {
  const dir = mkdtempSync(join(tmpdir(), 'awaitstep-migrations-'))
  temps.push(dir)
  cpSync(folder, dir, { recursive: true })
  const journalPath = join(dir, 'meta', '_journal.json')
  const journal = JSON.parse(readFileSync(journalPath, 'utf8')) as {
    entries: { tag: string }[]
  }
  const index = journal.entries.findIndex((entry) => entry.tag.endsWith(`_${tag}`))
  expect(index, `migration ${tag} is in the journal`).toBeGreaterThan(0)
  journal.entries = journal.entries.slice(0, index)
  writeFileSync(journalPath, JSON.stringify(journal))
  return dir
}

const now = '2026-10-28T00:00:00.000Z'

// Two orgs, three projects (one named like a dashboard page, one whose sibling
// already took the `-1` name) and five workflows across them.
// The organization table's created column is better-auth's: required text on
// sqlite, a defaulted timestamp on pg.
const seed = (orgCreatedAt: string) => `
  INSERT INTO organization (id, name, slug${orgCreatedAt}) VALUES ('org-1', 'One', 'one-abc'${orgCreatedAt && `, '${now}'`});
  INSERT INTO organization (id, name, slug${orgCreatedAt}) VALUES ('org-2', 'Two', 'two-abc'${orgCreatedAt && `, '${now}'`});
  INSERT INTO organization (id, name, slug${orgCreatedAt}) VALUES ('org-3', 'Dash', 'dashboard'${orgCreatedAt && `, '${now}'`});
  INSERT INTO organization (id, name, slug${orgCreatedAt}) VALUES ('org-4', 'Dash one', 'dashboard-1'${orgCreatedAt && `, '${now}'`});
  INSERT INTO projects (id, organization_id, name, slug, created_at, updated_at) VALUES
    ('p-1', 'org-1', 'Settings', 'settings', '${now}', '${now}'),
    ('p-2', 'org-1', 'Settings one', 'settings-1', '${now}', '${now}'),
    ('p-3', 'org-2', 'Items', 'items', '${now}', '${now}');
  INSERT INTO workflows (id, project_id, created_by, name, created_at, updated_at) VALUES
    ('w-1', 'p-1', 'u-1', 'A', '${now}', '${now}'),
    ('w-2', 'p-1', 'u-1', 'B', '${now}', '${now}'),
    ('w-3', 'p-2', 'u-1', 'C', '${now}', '${now}'),
    ('w-4', 'p-3', 'u-1', 'D', '${now}', '${now}'),
    ('w-5', 'p-3', 'u-1', 'E', '${now}', '${now}');
`

interface Row {
  [column: string]: unknown
}

function checkBackfill(query: (sql: string) => Row[]) {
  const workspaces = query(
    'SELECT id, project_id, name, slug, colour, created_by FROM workspaces ORDER BY project_id',
  )
  expect(workspaces.map((w) => [w['project_id'], w['name'], w['slug'], w['colour']])).toEqual([
    ['p-1', 'Default', 'default', 'green'],
    ['p-2', 'Default', 'default', 'green'],
    ['p-3', 'Default', 'default', 'green'],
  ])
  expect(workspaces.every((w) => w['created_by'] === null)).toBe(true)
  expect(new Set(workspaces.map((w) => w['id'])).size).toBe(3)

  expect(query('SELECT count(*) AS n FROM workflows WHERE workspace_id IS NULL')[0]!['n']).toBe(0)
  const misplaced = query(
    'SELECT count(*) AS n FROM workflows w JOIN workspaces s ON s.id = w.workspace_id WHERE s.project_id <> w.project_id',
  )
  expect(misplaced[0]!['n']).toBe(0)

  const slugs = Object.fromEntries(
    query('SELECT id, slug FROM projects').map((p) => [p['id'], p['slug']]),
  )
  // `settings-1` was taken by a sibling, so p-1 got a random suffix instead.
  expect(slugs['p-1']).toMatch(/^settings-[0-9a-f]{6}$/)
  expect(slugs['p-2']).toBe('settings-1')
  expect(slugs['p-3']).toBe('items-1')

  // Organization slugs are global and the app's top-level paths are reserved there too.
  const orgSlugs = Object.fromEntries(
    query('SELECT id, slug FROM organization').map((o) => [o['id'], o['slug']]),
  )
  expect(orgSlugs['org-1']).toBe('one-abc')
  expect(orgSlugs['org-3']).toMatch(/^dashboard-[0-9a-f]{6}$/)
  expect(orgSlugs['org-4']).toBe('dashboard-1')
}

describe('workspaces migration (sqlite)', () => {
  it('gives every project a Default workspace, moves workflows in, renames reserved slugs', () => {
    const sqlite = new Database(':memory:')
    sqlite.pragma('foreign_keys = ON')
    const db = drizzleSqlite(sqlite)
    migrateSqlite(db, { migrationsFolder: folderBefore(SQLITE_FOLDER, TAG) })
    sqlite.exec(seed(', "createdAt"'))

    migrateSqlite(db, { migrationsFolder: SQLITE_FOLDER })

    checkBackfill((sql) => sqlite.prepare(sql).all() as Row[])
    // Deleting a workspace takes its workflows with it.
    sqlite.prepare("DELETE FROM workspaces WHERE project_id = 'p-1'").run()
    expect(
      sqlite.prepare("SELECT count(*) AS n FROM workflows WHERE project_id = 'p-1'").get(),
    ).toEqual({
      n: 0,
    })
  })
})

describe('workspaces migration (pg)', () => {
  it('gives every project a Default workspace, moves workflows in, renames reserved slugs', async () => {
    const client = new PGlite()
    const db = drizzlePg(client)
    await migratePg(db, { migrationsFolder: folderBefore(PG_FOLDER, TAG) })
    await client.exec(seed(''))

    await migratePg(db, { migrationsFolder: PG_FOLDER })

    const rows: Record<string, Row[]> = {}
    for (const sql of [
      'SELECT id, project_id, name, slug, colour, created_by FROM workspaces ORDER BY project_id',
      'SELECT count(*) AS n FROM workflows WHERE workspace_id IS NULL',
      'SELECT count(*) AS n FROM workflows w JOIN workspaces s ON s.id = w.workspace_id WHERE s.project_id <> w.project_id',
      'SELECT id, slug FROM projects',
      'SELECT id, slug FROM organization',
    ]) {
      const result = await client.query<Row>(sql)
      // Postgres counts are bigint, which PGlite hands back as strings.
      rows[sql] = result.rows.map((row) => ('n' in row ? { n: Number(row['n']) } : row))
    }
    checkBackfill((sql) => rows[sql]!)

    // The column is required once backfilled.
    await expect(
      client.query(
        `INSERT INTO workflows (id, project_id, created_by, name) VALUES ('w-9', 'p-1', 'u-1', 'No workspace')`,
      ),
    ).rejects.toThrow(/workspace_id/)
  })
})
