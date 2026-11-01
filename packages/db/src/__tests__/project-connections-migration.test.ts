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

// Project connections (23a): every project starts with the accounts that
// served it, so no deploy stops working — each added, the default the one its
// latest successful deploy used, else its only one, else none — and a
// workspace whose slug became the project's Connections page is renamed.

const SQLITE_FOLDER = fileURLToPath(new URL('../../drizzle/sqlite', import.meta.url))
const PG_FOLDER = fileURLToPath(new URL('../../drizzle/pg', import.meta.url))
const TAG = 'project_connections'

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

// p-deployed: three serving accounts, the latest successful deploy with c-b (a
// later failed one with c-a, and one with c-other of another org) → c-b.
// p-two: c-a and c-b, never deployed → no default. p-globex: c-other its only
// account → c-other. c-narrow serves p-deployed by name and nothing else.
function seed(sqlite: boolean): string {
  const ts = (value: string) => (sqlite ? `'${value}'` : `'${value}'::timestamp`)
  const yes = sqlite ? '1' : 'true'
  const no = sqlite ? '0' : 'false'
  const conn = (id: string, org: string, all: string) =>
    `('${id}', '${org}', 'u-1', 'cloudflare', '${id}', '{}', ${all}, ${ts(now)}, ${ts(now)})`
  return `
  INSERT INTO organization (id, name, slug${sqlite ? ', createdAt' : ''}) VALUES
    ('org-1', 'Acme', 'acme'${sqlite ? `, '${now}'` : ''}), ('org-2', 'Globex', 'globex'${sqlite ? `, '${now}'` : ''});
  INSERT INTO projects (id, organization_id, name, slug, created_at, updated_at) VALUES
    ('p-deployed', 'org-1', 'Deployed', 'deployed', ${ts(now)}, ${ts(now)}),
    ('p-two', 'org-1', 'Two', 'two', ${ts(now)}, ${ts(now)}),
    ('p-globex', 'org-2', 'Globex', 'globex', ${ts(now)}, ${ts(now)});
  INSERT INTO workspaces (id, project_id, name, slug, created_at, updated_at) VALUES
    ('ws-1', 'p-deployed', 'Default', 'default', ${ts(now)}, ${ts(now)}),
    ('ws-conn', 'p-two', 'Connections', 'connections', ${ts(now)}, ${ts(now)});
  INSERT INTO connections (id, organization_id, created_by, provider, name, credentials, all_projects, created_at, updated_at) VALUES
    ${conn('c-a', 'org-1', yes)}, ${conn('c-b', 'org-1', yes)}, ${conn('c-narrow', 'org-1', no)},
    ${conn('c-other', 'org-2', yes)};
  INSERT INTO connection_projects (connection_id, project_id) VALUES ('c-narrow', 'p-deployed');
  INSERT INTO workflows (id, project_id, workspace_id, created_by, name, created_at, updated_at) VALUES
    ('wf-1', 'p-deployed', 'ws-1', 'u-1', 'Flow', ${ts(now)}, ${ts(now)});
  INSERT INTO deployments (id, workflow_id, connection_id, service_name, status, created_at) VALUES
    ('d-1', 'wf-1', 'c-a', 's', 'success', ${ts('2026-10-01T00:00:00.000Z')}),
    ('d-2', 'wf-1', 'c-b', 's', 'success', ${ts('2026-10-02T00:00:00.000Z')}),
    ('d-3', 'wf-1', 'c-a', 's', 'failed', ${ts('2026-10-03T00:00:00.000Z')}),
    ('d-4', 'wf-1', 'c-other', 's', 'success', ${ts('2026-10-04T00:00:00.000Z')});
`
}

const EXPECTED = [
  ['p-deployed', 'c-a', false],
  ['p-deployed', 'c-b', true],
  ['p-deployed', 'c-narrow', false],
  ['p-globex', 'c-other', true],
  ['p-two', 'c-a', false],
  ['p-two', 'c-b', false],
]

type Row = { project_id: string; connection_id: string; is_default: unknown; created_by: unknown }

function shaped(rows: Row[]) {
  for (const row of rows) expect(row.created_by).toBeNull()
  return rows.map((r) => [
    r.project_id,
    r.connection_id,
    r.is_default === true || r.is_default === 1,
  ])
}

const SELECT =
  'SELECT project_id, connection_id, is_default, created_by FROM project_connections ORDER BY project_id, connection_id'

describe('project connections migration (sqlite)', () => {
  it('adds every serving account and picks the default from the latest deploy', () => {
    const sqlite = new Database(':memory:')
    sqlite.pragma('foreign_keys = ON')
    const db = drizzleSqlite(sqlite)
    migrateSqlite(db, { migrationsFolder: folderBefore(SQLITE_FOLDER) })
    sqlite.exec(seed(true))

    migrateSqlite(db, { migrationsFolder: SQLITE_FOLDER })

    expect(shaped(sqlite.prepare(SELECT).all() as Row[])).toEqual(EXPECTED)
    expect(sqlite.prepare("SELECT slug FROM workspaces WHERE id = 'ws-conn'").get()).toEqual({
      slug: 'connections-workspace',
    })
  })
})

describe('project connections migration (pg)', () => {
  it('adds every serving account and picks the default from the latest deploy', async () => {
    const client = new PGlite()
    const db = drizzlePg(client)
    await migratePg(db, { migrationsFolder: folderBefore(PG_FOLDER) })
    await client.exec(seed(false))

    await migratePg(db, { migrationsFolder: PG_FOLDER })

    expect(shaped((await client.query<Row>(SELECT)).rows)).toEqual(EXPECTED)
    expect((await client.query("SELECT slug FROM workspaces WHERE id = 'ws-conn'")).rows).toEqual([
      { slug: 'connections-workspace' },
    ])
  })
})
