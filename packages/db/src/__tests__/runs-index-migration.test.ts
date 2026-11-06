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

// One workflow's runs are read newest first (its Runs list) and since a time
// (its hourly bars): the runs index covers the workflow and the creation time.

const SQLITE_FOLDER = fileURLToPath(new URL('../../drizzle/sqlite', import.meta.url))
const PG_FOLDER = fileURLToPath(new URL('../../drizzle/pg', import.meta.url))
const TAG = 'runs_workflow_created_index'
const AT = '2026-10-20T00:00:00.000Z'
const NEW_INDEX = 'idx_workflow_runs_workflow_created'
const OLD_INDEX = 'idx_workflow_runs_workflow_id'

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
  INSERT INTO workflows (id, project_id, workspace_id, name, created_by, created_at, updated_at) VALUES ('wf-1', 'p-1', 'ws-1', 'Lead enrichment', 'u-ama', '${AT}', '${AT}');
  INSERT INTO workflow_runs (id, workflow_id, instance_id, status, created_at, updated_at) VALUES ('run-1', 'wf-1', 'i-1', 'complete', '${AT}', '${AT}');
`

describe('the runs index on sqlite', () => {
  it('replaces the workflow index on an existing database, keeping its runs', () => {
    const sqlite = new Database(':memory:')
    const db = drizzleSqlite(sqlite)
    migrateSqlite(db, { migrationsFolder: folderBefore(SQLITE_FOLDER, TAG) })
    sqlite.exec(seed(false))
    migrateSqlite(db, { migrationsFolder: SQLITE_FOLDER })

    const indexes = sqlite
      .prepare(`SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = 'workflow_runs'`)
      .all() as { name: string }[]
    expect(indexes.map((i) => i.name)).toContain(NEW_INDEX)
    expect(indexes.map((i) => i.name)).not.toContain(OLD_INDEX)
    expect(sqlite.prepare('SELECT count(*) AS n FROM workflow_runs').get()).toEqual({ n: 1 })
  })

  it('reads one workflow’s runs, newest first and since a time, through it', () => {
    const sqlite = new Database(':memory:')
    migrateSqlite(drizzleSqlite(sqlite), { migrationsFolder: SQLITE_FOLDER })
    for (const query of [
      `SELECT * FROM workflow_runs WHERE workflow_id = 'wf-1' ORDER BY created_at DESC, id DESC LIMIT 50`,
      `SELECT count(*) FROM workflow_runs WHERE workflow_id = 'wf-1' AND created_at >= '${AT}'`,
    ]) {
      const plan = sqlite.prepare(`EXPLAIN QUERY PLAN ${query}`).all() as { detail: string }[]
      expect(plan.map((p) => p.detail).join('\n')).toContain(NEW_INDEX)
    }
  })
})

describe('the runs index on pg', () => {
  it('replaces the workflow index on an existing database, keeping its runs', async () => {
    const client = new PGlite()
    const db = drizzlePg(client)
    await migratePg(db, { migrationsFolder: folderBefore(PG_FOLDER, TAG) })
    await client.exec(seed(true))
    await migratePg(db, { migrationsFolder: PG_FOLDER })

    const { rows } = await client.query<{ indexname: string }>(
      `SELECT indexname FROM pg_indexes WHERE tablename = 'workflow_runs'`,
    )
    expect(rows.map((r) => r.indexname)).toContain(NEW_INDEX)
    expect(rows.map((r) => r.indexname)).not.toContain(OLD_INDEX)
    const count = await client.query<{ n: number }>('SELECT count(*)::int AS n FROM workflow_runs')
    expect(count.rows[0]?.n).toBe(1)
    await client.close()
  })
})
