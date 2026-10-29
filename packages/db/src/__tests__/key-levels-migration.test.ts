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

// The key-levels migration (B3) turns every key's coarse scopes into the
// grid they amounted to at its level, so keys minted before it keep
// working. It is run against a database at the previous migration, seeded
// with one key per scope combination, and the rows checked afterwards. No old
// key gains `members:read`: the people lists were closed to keys before B3.

const SQLITE_FOLDER = fileURLToPath(new URL('../../drizzle/sqlite', import.meta.url))
const PG_FOLDER = fileURLToPath(new URL('../../drizzle/pg', import.meta.url))
const TAG = 'key_levels'

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

const now = '2026-10-29T00:00:00.000Z'

const keys: [string, 'org' | 'project', string][] = [
  ['k-org-read', 'org', '["read"]'],
  ['k-org-write', 'org', '["read","write","deploy"]'],
  ['k-p-read', 'project', '["read"]'],
  ['k-p-write', 'project', '["read","write"]'],
  ['k-p-deploy', 'project', '["read","deploy"]'],
  ['k-p-full', 'project', '["read","write","deploy"]'],
]

function keyRows(quote: (s: string) => string): string {
  return keys
    .map(
      ([id, level, scopes]) =>
        `(${quote(id)}, ${level === 'org' ? "'org-1'" : 'NULL'}, ${level === 'project' ? "'p-1'" : 'NULL'}, 'u-1', ${quote(id)}, ${quote(`hash-${id}`)}, 'ask_xxxx', '${scopes}', '${now}')`,
    )
    .join(',\n    ')
}

const q = (s: string) => `'${s}'`

const sqliteSeed = `
  INSERT INTO organization (id, name, slug, createdAt) VALUES ('org-1', 'Acme', 'acme', '${now}');
  INSERT INTO projects (id, organization_id, name, slug, created_at, updated_at) VALUES ('p-1', 'org-1', 'One', 'one', '${now}', '${now}');
  INSERT INTO api_keys (id, organization_id, project_id, created_by, name, key_hash, key_prefix, scopes, created_at) VALUES
    ${keyRows(q)};
`

const pgSeed = `
  INSERT INTO organization (id, name, slug) VALUES ('org-1', 'Acme', 'acme');
  INSERT INTO projects (id, organization_id, name, slug) VALUES ('p-1', 'org-1', 'One', 'one');
  INSERT INTO api_keys (id, organization_id, project_id, created_by, name, key_hash, key_prefix, scopes, created_at) VALUES
    ${keyRows(q)};
`

const EXPECTED: Record<string, unknown> = {
  'k-org-read': { projects: ['read'], connections: ['read'], resources: ['read'] },
  'k-org-write': {
    projects: ['read', 'write', 'delete'],
    connections: ['read', 'write', 'delete'],
    resources: ['read', 'write', 'delete'],
  },
  'k-p-read': {
    workspaces: ['read'],
    workflows: ['read'],
    runs: ['read'],
    variables: ['read'],
  },
  'k-p-write': {
    workspaces: ['read', 'write', 'delete'],
    workflows: ['read', 'write', 'delete'],
    runs: ['read'],
    variables: ['read', 'write', 'delete'],
  },
  'k-p-deploy': {
    workspaces: ['read'],
    workflows: ['read', 'deploy', 'run'],
    runs: ['read'],
    variables: ['read'],
  },
  'k-p-full': {
    workspaces: ['read', 'write', 'delete'],
    workflows: ['read', 'write', 'delete', 'deploy', 'run'],
    runs: ['read'],
    variables: ['read', 'write', 'delete'],
  },
}

function check(rows: { id: string; permissions: string; workspace_id: string | null }[]) {
  expect(Object.fromEntries(rows.map((r) => [r.id, JSON.parse(r.permissions)]))).toEqual(EXPECTED)
  expect(rows.every((r) => r.workspace_id === null)).toBe(true)
}

describe('key-levels migration (sqlite)', () => {
  it('turns each key’s scopes into the grid it amounted to', () => {
    const sqlite = new Database(':memory:')
    sqlite.pragma('foreign_keys = ON')
    const db = drizzleSqlite(sqlite)
    migrateSqlite(db, { migrationsFolder: folderBefore(SQLITE_FOLDER, TAG) })
    sqlite.exec(sqliteSeed)

    migrateSqlite(db, { migrationsFolder: SQLITE_FOLDER })

    check(
      sqlite.prepare('SELECT id, permissions, workspace_id FROM api_keys ORDER BY id').all() as {
        id: string
        permissions: string
        workspace_id: string | null
      }[],
    )
  })
})

describe('key-levels migration (pg)', () => {
  it('turns each key’s scopes into the grid it amounted to', async () => {
    const client = new PGlite()
    const db = drizzlePg(client)
    await migratePg(db, { migrationsFolder: folderBefore(PG_FOLDER, TAG) })
    await client.exec(pgSeed)

    await migratePg(db, { migrationsFolder: PG_FOLDER })

    const result = await client.query<{
      id: string
      permissions: string
      workspace_id: string | null
    }>('SELECT id, permissions, workspace_id FROM api_keys ORDER BY id')
    check(result.rows)
  })
})
