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

// The access migration changes rows as well as tables: a comma-joined member
// role becomes its highest one, a second member row for the same person and
// org goes (the higher role stays) before the unique index that forbids it,
// and every plain member gets a project member row on each project in their
// org, so nobody loses the reach B1 gave them. It is run against a database
// at the previous migration, seeded, and the rows checked afterwards.

const SQLITE_FOLDER = fileURLToPath(new URL('../../drizzle/sqlite', import.meta.url))
const PG_FOLDER = fileURLToPath(new URL('../../drizzle/pg', import.meta.url))
const TAG = 'access'

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

// One org with an owner, an admin, two members (one stored as a comma-joined
// list), and a second org whose only member is also in the first — twice, the
// second row a comma-joined admin. Two projects in the first org, one in the
// second.
const sqliteSeed = `
  INSERT INTO user (id, name, email, emailVerified, createdAt, updatedAt) VALUES
    ('u-owner', 'Owner', 'owner@acme.test', 1, '${now}', '${now}'),
    ('u-admin', 'Admin', 'admin@acme.test', 1, '${now}', '${now}'),
    ('u-m1', 'Member one', 'm1@acme.test', 1, '${now}', '${now}'),
    ('u-m2', 'Member two', 'm2@acme.test', 1, '${now}', '${now}');
  INSERT INTO organization (id, name, slug, createdAt) VALUES
    ('org-1', 'Acme', 'acme', '${now}'),
    ('org-2', 'Globex', 'globex', '${now}');
  INSERT INTO member (id, userId, organizationId, role, createdAt) VALUES
    ('m-1', 'u-owner', 'org-1', 'owner', '${now}'),
    ('m-2', 'u-admin', 'org-1', 'admin,member', '${now}'),
    ('m-3', 'u-m1', 'org-1', 'member', '${now}'),
    ('m-4', 'u-m2', 'org-1', 'member, owner', '${now}'),
    ('m-5', 'u-m1', 'org-2', 'member', '${now}'),
    ('m-6', 'u-m1', 'org-2', 'admin,member', '${now}');
  INSERT INTO projects (id, organization_id, name, slug, created_at, updated_at) VALUES
    ('p-1', 'org-1', 'One', 'one', '${now}', '${now}'),
    ('p-2', 'org-1', 'Two', 'two', '${now}', '${now}'),
    ('p-3', 'org-2', 'Three', 'three', '${now}', '${now}');
  INSERT INTO invitation (id, email, inviterId, organizationId, role, status, expiresAt, createdAt) VALUES
    ('inv-1', 'new@acme.test', 'u-owner', 'org-1', 'admin,member', 'pending', '2099-01-01T00:00:00.000Z', '${now}'),
    ('inv-2', 'old@acme.test', 'u-owner', 'org-1', NULL, 'pending', '2099-01-01T00:00:00.000Z', '${now}');
`

const pgSeed = `
  INSERT INTO "user" (id, name, email, email_verified) VALUES
    ('u-owner', 'Owner', 'owner@acme.test', true),
    ('u-admin', 'Admin', 'admin@acme.test', true),
    ('u-m1', 'Member one', 'm1@acme.test', true),
    ('u-m2', 'Member two', 'm2@acme.test', true);
  INSERT INTO organization (id, name, slug) VALUES ('org-1', 'Acme', 'acme'), ('org-2', 'Globex', 'globex');
  INSERT INTO member (id, user_id, organization_id, role) VALUES
    ('m-1', 'u-owner', 'org-1', 'owner'),
    ('m-2', 'u-admin', 'org-1', 'admin,member'),
    ('m-3', 'u-m1', 'org-1', 'member'),
    ('m-4', 'u-m2', 'org-1', 'member, owner'),
    ('m-5', 'u-m1', 'org-2', 'member'),
    ('m-6', 'u-m1', 'org-2', 'admin,member');
  INSERT INTO projects (id, organization_id, name, slug) VALUES
    ('p-1', 'org-1', 'One', 'one'), ('p-2', 'org-1', 'Two', 'two'), ('p-3', 'org-2', 'Three', 'three');
  INSERT INTO invitation (id, email, inviter_id, organization_id, role, status, expires_at) VALUES
    ('inv-1', 'new@acme.test', 'u-owner', 'org-1', 'admin,member', 'pending', '2099-01-01T00:00:00.000Z'),
    ('inv-2', 'old@acme.test', 'u-owner', 'org-1', NULL, 'pending', '2099-01-01T00:00:00.000Z');
`

interface Row {
  [column: string]: unknown
}

function checkBackfill(roles: Row[], grants: Row[], placeCount: number, inviteRoles: Row[]) {
  // A pending invitation's comma-joined role becomes its highest one too; null stays null.
  expect(Object.fromEntries(inviteRoles.map((r) => [r['id'], r['role']]))).toEqual({
    'inv-1': 'admin',
    'inv-2': null,
  })
  // Of Member one's two org-2 rows the admin one stays, so one row per person and org remains.
  expect(Object.fromEntries(roles.map((r) => [r['id'], r['role']]))).toEqual({
    'm-1': 'owner',
    'm-2': 'admin',
    'm-3': 'member',
    'm-4': 'owner',
    'm-6': 'admin',
  })
  // Only plain members get rows: Member one on both org-1 projects, and not
  // on the org-2 one, where the surviving row makes them an admin.
  expect(grants.map((g) => [g['project_id'], g['user_id'], g['role'], g['created_by']])).toEqual([
    ['p-1', 'u-m1', 'member', null],
    ['p-2', 'u-m1', 'member', null],
  ])
  expect(placeCount).toBe(0)
}

describe('access migration (sqlite)', () => {
  it('normalises member roles and backfills project membership for plain members', () => {
    const sqlite = new Database(':memory:')
    sqlite.pragma('foreign_keys = ON')
    const db = drizzleSqlite(sqlite)
    migrateSqlite(db, { migrationsFolder: folderBefore(SQLITE_FOLDER, TAG) })
    sqlite.exec(sqliteSeed)

    migrateSqlite(db, { migrationsFolder: SQLITE_FOLDER })

    const query = (sql: string) => sqlite.prepare(sql).all() as Row[]
    checkBackfill(
      query('SELECT id, role FROM member ORDER BY id'),
      query(
        'SELECT project_id, user_id, role, created_by FROM project_members ORDER BY project_id, user_id',
      ),
      (query('SELECT count(*) AS n FROM invitation_places')[0]!['n'] as number) ?? 0,
      query('SELECT id, role FROM invitation ORDER BY id'),
    )
    // Grants go with the project, the workspace and the user.
    sqlite.prepare("DELETE FROM projects WHERE id = 'p-1'").run()
    expect(query("SELECT count(*) AS n FROM project_members WHERE project_id = 'p-1'")[0]).toEqual({
      n: 0,
    })
    sqlite.prepare("DELETE FROM user WHERE id = 'u-m1'").run()
    expect(query('SELECT count(*) AS n FROM project_members')[0]).toEqual({ n: 0 })
    // From here on a second row for the same person and org is refused.
    expect(() =>
      sqlite
        .prepare(
          "INSERT INTO member (id, userId, organizationId, role, createdAt) VALUES ('m-7', 'u-owner', 'org-1', 'member', ?)",
        )
        .run(now),
    ).toThrow(/UNIQUE/)
  })
})

describe('access migration (pg)', () => {
  it('normalises member roles and backfills project membership for plain members', async () => {
    const client = new PGlite()
    const db = drizzlePg(client)
    await migratePg(db, { migrationsFolder: folderBefore(PG_FOLDER, TAG) })
    await client.exec(pgSeed)

    await migratePg(db, { migrationsFolder: PG_FOLDER })

    const query = async (sql: string) => (await client.query<Row>(sql)).rows
    checkBackfill(
      await query('SELECT id, role FROM member ORDER BY id'),
      await query(
        'SELECT project_id, user_id, role, created_by FROM project_members ORDER BY project_id, user_id',
      ),
      Number((await query('SELECT count(*) AS n FROM invitation_places'))[0]!['n']),
      await query('SELECT id, role FROM invitation ORDER BY id'),
    )
    await client.query("DELETE FROM projects WHERE id = 'p-1'")
    expect(
      Number(
        (await query("SELECT count(*) AS n FROM project_members WHERE project_id = 'p-1'"))[0]![
          'n'
        ],
      ),
    ).toBe(0)
    await expect(
      client.query(
        "INSERT INTO member (id, user_id, organization_id, role) VALUES ('m-7', 'u-owner', 'org-1', 'member')",
      ),
    ).rejects.toThrow(/unique/i)
  })
})
