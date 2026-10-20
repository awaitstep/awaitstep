import { describe, it, expect, beforeEach } from 'vitest'
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { DrizzleDatabaseAdapter } from '../adapters/index.js'
import * as sqliteSchema from '../schema/sqlite/index.js'

const now = '2026-10-20T00:00:00.000Z'

function createTestDb() {
  const sqlite = new Database(':memory:')
  sqlite.exec(`
    CREATE TABLE projects (id text PRIMARY KEY, organization_id text NOT NULL, name text NOT NULL, created_at text NOT NULL, updated_at text NOT NULL);
    CREATE TABLE env_vars (
      id text PRIMARY KEY, organization_id text NOT NULL, project_id text,
      created_by text NOT NULL, name text NOT NULL, value text NOT NULL,
      is_secret integer NOT NULL DEFAULT 0,
      created_at text NOT NULL, updated_at text NOT NULL
    );
    INSERT INTO projects VALUES ('p-1', 'org-1', 'One', '${now}', '${now}');
    INSERT INTO projects VALUES ('p-2', 'org-1', 'Two', '${now}', '${now}');
  `)
  const adapter = new DrizzleDatabaseAdapter(drizzle(sqlite), sqliteSchema)
  return { adapter, sqlite }
}

function insert(
  sqlite: Database.Database,
  row: { id: string; org?: string; project?: string | null; name: string; value: string },
) {
  sqlite
    .prepare(
      `INSERT INTO env_vars (id, organization_id, project_id, created_by, name, value, is_secret, created_at, updated_at)
       VALUES (?, ?, ?, 'u-1', ?, ?, 0, '${now}', '${now}')`,
    )
    .run(row.id, row.org ?? 'org-1', row.project ?? null, row.name, row.value)
}

describe('findEnvVarsByNames', () => {
  let db: ReturnType<typeof createTestDb>

  beforeEach(() => {
    db = createTestDb()
  })

  it('finds project and org variables in one call', async () => {
    // Both scopes matter: a reference resolves against either, and the
    // caller decides which wins.
    insert(db.sqlite, { id: 'e-1', project: 'p-1', name: 'API_URL', value: 'project' })
    insert(db.sqlite, { id: 'e-2', project: null, name: 'SHARED', value: 'org' })

    const found = await db.adapter.findEnvVarsByNames('org-1', ['API_URL', 'SHARED'], 'p-1')

    expect(found.map((v) => v.name).sort()).toEqual(['API_URL', 'SHARED'])
  })

  it('returns both scopes for one name, so the caller can prefer the project', async () => {
    insert(db.sqlite, { id: 'e-1', project: 'p-1', name: 'API_URL', value: 'project' })
    insert(db.sqlite, { id: 'e-2', project: null, name: 'API_URL', value: 'org' })

    const found = await db.adapter.findEnvVarsByNames('org-1', ['API_URL'], 'p-1')

    expect(found.map((v) => v.value).sort()).toEqual(['org', 'project'])
  })

  it('ignores another project in the same organization', async () => {
    insert(db.sqlite, { id: 'e-1', project: 'p-2', name: 'API_URL', value: 'other project' })

    expect(await db.adapter.findEnvVarsByNames('org-1', ['API_URL'], 'p-1')).toEqual([])
  })

  it('ignores another organization', async () => {
    insert(db.sqlite, { id: 'e-1', org: 'org-2', project: null, name: 'API_URL', value: 'theirs' })

    expect(await db.adapter.findEnvVarsByNames('org-1', ['API_URL'], 'p-1')).toEqual([])
  })

  it('returns only the names asked for', async () => {
    insert(db.sqlite, { id: 'e-1', project: 'p-1', name: 'API_URL', value: 'a' })
    insert(db.sqlite, { id: 'e-2', project: 'p-1', name: 'OTHER', value: 'b' })

    const found = await db.adapter.findEnvVarsByNames('org-1', ['API_URL'], 'p-1')

    expect(found.map((v) => v.name)).toEqual(['API_URL'])
  })

  it('looks only at org scope when there is no project', async () => {
    insert(db.sqlite, { id: 'e-1', project: 'p-1', name: 'API_URL', value: 'project' })
    insert(db.sqlite, { id: 'e-2', project: null, name: 'API_URL', value: 'org' })

    const found = await db.adapter.findEnvVarsByNames('org-1', ['API_URL'], null)

    expect(found.map((v) => v.value)).toEqual(['org'])
  })

  it('asks nothing of the database for an empty name list', async () => {
    // A workflow with no references must not produce a query at all, let
    // alone one with an empty IN clause.
    insert(db.sqlite, { id: 'e-1', project: 'p-1', name: 'API_URL', value: 'a' })

    expect(await db.adapter.findEnvVarsByNames('org-1', [], 'p-1')).toEqual([])
  })
})
