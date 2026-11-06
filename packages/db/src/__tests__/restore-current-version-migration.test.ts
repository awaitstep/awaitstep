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

// Takedown used to clear `current_version_id`, the latest saved version: the
// editor then opened the canvas and a save never set it again. The migration
// points such a workflow back at its newest version and leaves the rest alone.

const SQLITE_FOLDER = fileURLToPath(new URL('../../drizzle/sqlite', import.meta.url))
const PG_FOLDER = fileURLToPath(new URL('../../drizzle/pg', import.meta.url))
const TAG = 'restore_current_version'
const AT = '2026-10-20T00:00:00.000Z'

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

const seed = (pg: boolean) => `
  INSERT INTO "user" (id, name, email, ${pg ? 'email_verified, created_at, updated_at' : '"emailVerified", "createdAt", "updatedAt"'}) VALUES
    ('u-ama', 'Ama Mensah', 'ama@acme.test', ${pg ? 'true' : '1'}, '${AT}', '${AT}');
  INSERT INTO organization (id, name, slug, ${pg ? 'created_at' : '"createdAt"'}) VALUES ('org-1', 'Acme', 'acme', '${AT}');
  INSERT INTO projects (id, organization_id, name, slug, created_at, updated_at) VALUES ('p-1', 'org-1', 'P', 'p', '${AT}', '${AT}');
  INSERT INTO workspaces (id, project_id, name, slug, created_at, updated_at) VALUES ('ws-1', 'p-1', 'Sales', 'sales', '${AT}', '${AT}');
  INSERT INTO workflows (id, project_id, workspace_id, name, created_by, created_at, updated_at) VALUES
    ('wf-down', 'p-1', 'ws-1', 'Taken down', 'u-ama', '${AT}', '${AT}'),
    ('wf-new', 'p-1', 'ws-1', 'Never saved', 'u-ama', '${AT}', '${AT}'),
    ('wf-set', 'p-1', 'ws-1', 'Reverted', 'u-ama', '${AT}', '${AT}');
  INSERT INTO workflow_versions (id, workflow_id, version, ir, created_at) VALUES
    ('v-down-1', 'wf-down', 1, '{}', '${AT}'),
    ('v-down-2', 'wf-down', 2, '{}', '${AT}'),
    ('v-set-1', 'wf-set', 1, '{}', '${AT}'),
    ('v-set-2', 'wf-set', 2, '{}', '${AT}');
  UPDATE workflows SET current_version_id = 'v-set-1' WHERE id = 'wf-set';
`

const EXPECTED = [
  { id: 'wf-down', current_version_id: 'v-down-2' },
  { id: 'wf-new', current_version_id: null },
  { id: 'wf-set', current_version_id: 'v-set-1' },
]

const READ = 'SELECT id, current_version_id FROM workflows ORDER BY id'

describe('restoring the current version', () => {
  it('points a workflow without one at its newest version, on sqlite', () => {
    const sqlite = new Database(':memory:')
    const db = drizzleSqlite(sqlite)
    migrateSqlite(db, { migrationsFolder: folderBefore(SQLITE_FOLDER, TAG) })
    sqlite.exec(seed(false))
    migrateSqlite(db, { migrationsFolder: SQLITE_FOLDER })
    expect(sqlite.prepare(READ).all()).toEqual(EXPECTED)
  })

  it('points a workflow without one at its newest version, on pg', async () => {
    const client = new PGlite()
    const db = drizzlePg(client)
    await migratePg(db, { migrationsFolder: folderBefore(PG_FOLDER, TAG) })
    await client.exec(seed(true))
    await migratePg(db, { migrationsFolder: PG_FOLDER })
    expect((await client.query(READ)).rows).toEqual(EXPECTED)
    await client.close()
  })
})
