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

// The variable-levels migration (B4) adds `workspace_id` and swaps the old
// unique index — which never stopped two org-wide rows sharing a name, NULLs
// being distinct — for one partial unique index per level. Before the new
// index, the newest of an org-wide duplicate pair stays. Run against a
// database at the previous migration, seeded with such a pair and a project
// row, then checked.

const SQLITE_FOLDER = fileURLToPath(new URL('../../drizzle/sqlite', import.meta.url))
const PG_FOLDER = fileURLToPath(new URL('../../drizzle/pg', import.meta.url))
const TAG = 'variable_levels'

const temps: string[] = []
afterEach(() => {
  for (const dir of temps.splice(0)) rmSync(dir, { recursive: true, force: true })
})

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

const OLDER = '2026-10-01T00:00:00.000Z'
const NEWER = '2026-10-20T00:00:00.000Z'

function rows(): string {
  const row = (
    id: string,
    org: string,
    project: string | null,
    name: string,
    value: string,
    at: string,
  ) =>
    `('${id}', '${org}', ${project ? `'${project}'` : 'NULL'}, 'u-1', '${name}', '${value}', '${at}', '${at}')`
  return [
    row('v-old', 'org-1', null, 'REGION', 'eu', OLDER),
    row('v-new', 'org-1', null, 'REGION', 'us', NEWER),
    row('v-log', 'org-1', null, 'LOG_LEVEL', 'info', OLDER),
    row('v-proj', 'org-1', 'p-1', 'REGION', 'apac', OLDER),
    // Project 2 was moved from org-2 to org-1 before B4: a row left behind on
    // org-2, and the one re-created on org-1 (the old index allowed both).
    row('v-left', 'org-2', 'p-2', 'API_URL', 'stale', OLDER),
    row('v-again', 'org-1', 'p-2', 'API_URL', 'fresh', NEWER),
    row('v-only', 'org-2', 'p-2', 'TOKEN', 'kept', OLDER),
  ].join(',\n    ')
}

const sqliteSeed = `
  INSERT INTO organization (id, name, slug, createdAt) VALUES ('org-1', 'Acme', 'acme', '${OLDER}'), ('org-2', 'Globex', 'globex', '${OLDER}');
  INSERT INTO projects (id, organization_id, name, slug, created_at, updated_at) VALUES ('p-1', 'org-1', 'One', 'one', '${OLDER}', '${OLDER}'), ('p-2', 'org-1', 'Two', 'two', '${OLDER}', '${OLDER}');
  INSERT INTO workspaces (id, project_id, name, slug, created_at, updated_at) VALUES ('ws-1', 'p-1', 'Default', 'default', '${OLDER}', '${OLDER}');
  INSERT INTO env_vars (id, organization_id, project_id, created_by, name, value, created_at, updated_at) VALUES
    ${rows()};
`

const pgSeed = `
  INSERT INTO organization (id, name, slug) VALUES ('org-1', 'Acme', 'acme'), ('org-2', 'Globex', 'globex');
  INSERT INTO projects (id, organization_id, name, slug) VALUES ('p-1', 'org-1', 'One', 'one'), ('p-2', 'org-1', 'Two', 'two');
  INSERT INTO workspaces (id, project_id, name, slug) VALUES ('ws-1', 'p-1', 'Default', 'default');
  INSERT INTO env_vars (id, organization_id, project_id, created_by, name, value, created_at, updated_at) VALUES
    ${rows()};
`

interface Row {
  id: string
  organization_id: string
  name: string
  value: string
  workspace_id: string | null
}

function check(after: Row[]) {
  // The newest org-wide REGION stays; the project's REGION is another level.
  // Project 2's rows are its organization's again, the newest API_URL kept.
  expect(after.map((r) => [r.id, r.organization_id, r.name, r.value])).toEqual([
    ['v-again', 'org-1', 'API_URL', 'fresh'],
    ['v-log', 'org-1', 'LOG_LEVEL', 'info'],
    ['v-new', 'org-1', 'REGION', 'us'],
    ['v-only', 'org-1', 'TOKEN', 'kept'],
    ['v-proj', 'org-1', 'REGION', 'apac'],
  ])
  expect(after.every((r) => r.workspace_id === null)).toBe(true)
}

const WORKSPACE_ROW = (id: string, name: string) =>
  `INSERT INTO env_vars (id, organization_id, project_id, workspace_id, created_by, name, value, created_at, updated_at) VALUES ('${id}', 'org-1', 'p-1', 'ws-1', 'u-1', '${name}', 'x', '${NEWER}', '${NEWER}')`

describe('variable-levels migration (sqlite)', () => {
  it('re-homes a moved project’s rows, keeps the newest duplicate and enforces one name per level', () => {
    const sqlite = new Database(':memory:')
    sqlite.pragma('foreign_keys = ON')
    const db = drizzleSqlite(sqlite)
    migrateSqlite(db, { migrationsFolder: folderBefore(SQLITE_FOLDER, TAG) })
    sqlite.exec(sqliteSeed)

    migrateSqlite(db, { migrationsFolder: SQLITE_FOLDER })

    check(
      sqlite
        .prepare('SELECT id, organization_id, name, value, workspace_id FROM env_vars ORDER BY id')
        .all() as Row[],
    )
    // A workspace row may share its project's name; a second in the same workspace may not.
    sqlite.exec(WORKSPACE_ROW('v-ws', 'REGION'))
    expect(() => sqlite.exec(WORKSPACE_ROW('v-ws-2', 'REGION'))).toThrow(/UNIQUE/)
    expect(() =>
      sqlite.exec(
        `INSERT INTO env_vars (id, organization_id, project_id, created_by, name, value, created_at, updated_at) VALUES ('v-org-2', 'org-1', NULL, 'u-1', 'REGION', 'x', '${NEWER}', '${NEWER}')`,
      ),
    ).toThrow(/UNIQUE/)
    // The workspace's rows go with it.
    sqlite.exec(`DELETE FROM workspaces WHERE id = 'ws-1'`)
    expect(sqlite.prepare(`SELECT count(*) AS n FROM env_vars WHERE id = 'v-ws'`).get()).toEqual({
      n: 0,
    })
  })
})

describe('variable-levels migration (pg)', () => {
  it('re-homes a moved project’s rows, keeps the newest duplicate and enforces one name per level', async () => {
    const client = new PGlite()
    const db = drizzlePg(client)
    await migratePg(db, { migrationsFolder: folderBefore(PG_FOLDER, TAG) })
    await client.exec(pgSeed)

    await migratePg(db, { migrationsFolder: PG_FOLDER })

    const result = await client.query<Row>(
      'SELECT id, organization_id, name, value, workspace_id FROM env_vars ORDER BY id',
    )
    check(result.rows)
    await client.exec(WORKSPACE_ROW('v-ws', 'REGION'))
    await expect(client.exec(WORKSPACE_ROW('v-ws-2', 'REGION'))).rejects.toThrow(/unique/i)
    await expect(
      client.exec(
        `INSERT INTO env_vars (id, organization_id, project_id, created_by, name, value, created_at, updated_at) VALUES ('v-org-2', 'org-1', NULL, 'u-1', 'REGION', 'x', '${NEWER}', '${NEWER}')`,
      ),
    ).rejects.toThrow(/unique/i)
    await client.exec(`DELETE FROM workspaces WHERE id = 'ws-1'`)
    const left = await client.query<{ n: string }>(
      `SELECT count(*) AS n FROM env_vars WHERE id = 'v-ws'`,
    )
    expect(Number(left.rows[0]!.n)).toBe(0)
  })
})
