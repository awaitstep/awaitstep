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

// The notifications migration (B8) gives every edit request already pending
// (B2) a row in its addressee's Inbox: asking again returns the open request
// and writes nothing, so without it no admin could ever see one. Answered
// requests get none. A name left empty reads as the address.

const SQLITE_FOLDER = fileURLToPath(new URL('../../drizzle/sqlite', import.meta.url))
const PG_FOLDER = fileURLToPath(new URL('../../drizzle/pg', import.meta.url))
const TAG = 'notifications'
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

// The auth tables' columns are camelCase on sqlite and snake_case on pg.
const seed = (pg: boolean) => `
  INSERT INTO "user" (id, name, email, ${pg ? 'email_verified, created_at, updated_at' : '"emailVerified", "createdAt", "updatedAt"'}) VALUES
    ('u-ama', 'Ama Mensah', 'ama@acme.test', ${pg ? 'true' : '1'}, '${AT}', '${AT}'),
    ('u-eve', '', 'eve@acme.test', ${pg ? 'true' : '1'}, '${AT}', '${AT}'),
    ('u-gus', 'Gus Roy', 'gus@acme.test', ${pg ? 'true' : '1'}, '${AT}', '${AT}');
  INSERT INTO organization (id, name, slug, ${pg ? 'created_at' : '"createdAt"'}) VALUES ('org-1', 'Acme', 'acme', '${AT}');
  INSERT INTO projects (id, organization_id, name, slug, created_at, updated_at) VALUES ('p-1', 'org-1', 'P', 'p', '${AT}', '${AT}');
  INSERT INTO workspaces (id, project_id, name, slug, created_at, updated_at) VALUES ('ws-1', 'p-1', 'Sales', 'sales', '${AT}', '${AT}');
  INSERT INTO access_requests (id, workspace_id, user_id, to_user_id, status, created_at) VALUES
    ('req-open', 'ws-1', 'u-eve', 'u-ama', 'pending', '${AT}'),
    ('req-done', 'ws-1', 'u-gus', 'u-ama', 'approved', '${AT}');
`

interface Row {
  id: string
  user_id: string
  event: string
  group_key: string
  access_request_id: string
  meta: string
}

function check(rows: Row[]) {
  expect(rows).toHaveLength(1)
  expect(rows[0]).toMatchObject({
    user_id: 'u-ama',
    event: 'access_request.create',
    group_key: 'access_request:req-open',
    access_request_id: 'req-open',
  })
  expect(JSON.parse(rows[0]!.meta)).toEqual({ person: 'eve@acme.test', workspace: 'Sales' })
}

const SELECT =
  'SELECT id, user_id, event, group_key, access_request_id, meta FROM notifications ORDER BY id'

describe('notifications migration', () => {
  it('backfills pending requests on sqlite', () => {
    const sqlite = new Database(':memory:')
    sqlite.pragma('foreign_keys = ON')
    const db = drizzleSqlite(sqlite)
    migrateSqlite(db, { migrationsFolder: folderBefore(SQLITE_FOLDER, TAG) })
    sqlite.exec(seed(false))
    migrateSqlite(db, { migrationsFolder: SQLITE_FOLDER })
    check(sqlite.prepare(SELECT).all() as Row[])
  })

  it('backfills pending requests on pg', async () => {
    const client = new PGlite()
    const db = drizzlePg(client)
    await migratePg(db, { migrationsFolder: folderBefore(PG_FOLDER, TAG) })
    await client.exec(seed(true))
    await migratePg(db, { migrationsFolder: PG_FOLDER })
    check((await client.query<Row>(SELECT)).rows)
  })
})
