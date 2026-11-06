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

// A dashboard run recorded the workflow's latest saved version, not the one
// deployed on its account. The migration points each run at the newest
// successful deploy on that account from before it started, and leaves runs
// with no such deploy alone; then every run and deployment keeps its version's
// number, which outlives the version.

const SQLITE_FOLDER = fileURLToPath(new URL('../../drizzle/sqlite', import.meta.url))
const PG_FOLDER = fileURLToPath(new URL('../../drizzle/pg', import.meta.url))
const TAG = 'fix_run_versions'
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
    ('wf-1', 'p-1', 'ws-1', 'Lead enrichment', 'u-ama', '${AT}', '${AT}'),
    ('wf-2', 'p-1', 'ws-1', 'Other', 'u-ama', '${AT}', '${AT}');
  INSERT INTO workflow_versions (id, workflow_id, version, ir, created_at) VALUES
    ('v-1', 'wf-1', 1, '{}', '${AT}'),
    ('v-2', 'wf-1', 2, '{}', '${AT}'),
    ('v-other', 'wf-2', 1, '{}', '${AT}');
  INSERT INTO connections (id, organization_id, created_by, provider, name, credentials, all_projects, created_at, updated_at) VALUES
    ('c-a', 'org-1', 'u-ama', 'cloudflare', 'A', '{}', ${pg ? 'true' : '1'}, '${AT}', '${AT}'),
    ('c-b', 'org-1', 'u-ama', 'cloudflare', 'B', '{}', ${pg ? 'true' : '1'}, '${AT}', '${AT}');
  INSERT INTO deployments (id, workflow_id, version_id, connection_id, service_name, status, created_at) VALUES
    ('d-1', 'wf-1', 'v-1', 'c-a', 'svc', 'success', '${at(1)}'),
    ('d-2', 'wf-1', 'v-2', 'c-b', 'svc', 'success', '${at(1)}'),
    ('d-3', 'wf-1', 'v-2', 'c-a', 'svc', 'failed', '${at(2)}'),
    ('d-4', 'wf-1', 'v-2', 'c-a', 'svc', 'success', '${at(4)}'),
    ('d-5', 'wf-1', NULL, 'c-b', 'svc', 'success', '${at(4)}'),
    ('d-6', 'wf-1', 'v-other', 'c-b', 'svc', 'success', '${at(6)}');
  INSERT INTO workflow_runs (id, workflow_id, version_id, connection_id, instance_id, status, created_at, updated_at) VALUES
    ('r-a-before', 'wf-1', 'v-2', 'c-a', 'i-1', 'complete', '${at(0)}', '${at(0)}'),
    ('r-a-v1', 'wf-1', 'v-2', 'c-a', 'i-2', 'complete', '${at(3)}', '${at(3)}'),
    ('r-a-v2', 'wf-1', 'v-1', 'c-a', 'i-3', 'complete', '${at(5)}', '${at(5)}'),
    ('r-b', 'wf-1', 'v-1', 'c-b', 'i-4', 'complete', '${at(3)}', '${at(3)}'),
    ('r-b-deleted', 'wf-1', 'v-1', 'c-b', 'i-6', 'complete', '${at(5)}', '${at(5)}'),
    ('r-b-foreign', 'wf-1', 'v-1', 'c-b', 'i-7', 'complete', '${at(7)}', '${at(7)}'),
    ('r-none', 'wf-1', 'v-2', NULL, 'i-5', 'complete', '${at(3)}', '${at(3)}');
`

const at = (day: number) => `2026-10-2${day}T00:00:00.000Z`

const EXPECTED = [
  // Before any deploy on its account: nothing to go by.
  { id: 'r-a-before', version_id: 'v-2', version_number: 2 },
  // A's v1 was live; the failed v2 deploy doesn't count.
  { id: 'r-a-v1', version_id: 'v-1', version_number: 1 },
  { id: 'r-a-v2', version_id: 'v-2', version_number: 2 },
  { id: 'r-b', version_id: 'v-2', version_number: 2 },
  // Its deploy's version was deleted since: nothing better to go by.
  { id: 'r-b-deleted', version_id: 'v-1', version_number: 1 },
  // A deploy row naming another workflow's version is never copied.
  { id: 'r-b-foreign', version_id: 'v-1', version_number: 1 },
  { id: 'r-none', version_id: 'v-2', version_number: 2 },
]

// Every deployment keeps its version's number; one whose version is gone has none to keep.
const EXPECTED_DEPLOYMENTS = [
  { id: 'd-1', version_number: 1 },
  { id: 'd-2', version_number: 2 },
  { id: 'd-3', version_number: 2 },
  { id: 'd-4', version_number: 2 },
  { id: 'd-5', version_number: null },
  { id: 'd-6', version_number: 1 },
]

const READ = 'SELECT id, version_id, version_number FROM workflow_runs ORDER BY id'
const READ_DEPLOYMENTS = 'SELECT id, version_number FROM deployments ORDER BY id'

describe('fixing run versions', () => {
  it('points each run at the version deployed on its account and keeps numbers, on sqlite', () => {
    const sqlite = new Database(':memory:')
    const db = drizzleSqlite(sqlite)
    migrateSqlite(db, { migrationsFolder: folderBefore(SQLITE_FOLDER, TAG) })
    sqlite.exec(seed(false))
    migrateSqlite(db, { migrationsFolder: SQLITE_FOLDER })
    expect(sqlite.prepare(READ).all()).toEqual(EXPECTED)
    expect(sqlite.prepare(READ_DEPLOYMENTS).all()).toEqual(EXPECTED_DEPLOYMENTS)
  })

  it('points each run at the version deployed on its account and keeps numbers, on pg', async () => {
    const client = new PGlite()
    const db = drizzlePg(client)
    await migratePg(db, { migrationsFolder: folderBefore(PG_FOLDER, TAG) })
    await client.exec(seed(true))
    await migratePg(db, { migrationsFolder: PG_FOLDER })
    expect((await client.query(READ)).rows).toEqual(EXPECTED)
    expect((await client.query(READ_DEPLOYMENTS)).rows).toEqual(EXPECTED_DEPLOYMENTS)
    await client.close()
  })
})
