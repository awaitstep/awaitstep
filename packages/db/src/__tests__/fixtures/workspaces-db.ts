import { fileURLToPath } from 'node:url'
import Database from 'better-sqlite3'
import { PGlite } from '@electric-sql/pglite'
import { drizzle as drizzleSqlite } from 'drizzle-orm/better-sqlite3'
import { migrate as migrateSqlite } from 'drizzle-orm/better-sqlite3/migrator'
import { drizzle as drizzlePg } from 'drizzle-orm/pglite'
import { migrate as migratePg } from 'drizzle-orm/pglite/migrator'
import { migrate as migrateD1 } from 'drizzle-orm/d1/migrator'
import { Miniflare } from 'miniflare'
import { createD1DrizzleDb } from '../../d1.js'
import { DrizzleDatabaseAdapter } from '../../adapters/index.js'
import * as sqliteSchema from '../../schema/sqlite/index.js'
import * as pgSchema from '../../schema/pg/index.js'

// A database on either dialect, through the real migrations, seeded with the
// dashboard's sample org: the suites that lean on each dialect's SQL share it.
export const SQLITE_FOLDER = fileURLToPath(new URL('../../../drizzle/sqlite', import.meta.url))
export const PG_FOLDER = fileURLToPath(new URL('../../../drizzle/pg', import.meta.url))

export const T0 = '2026-10-20T00:00:00.000Z'
export const NOW = new Date('2026-10-28T12:00:00.000Z')
export const RECENT = '2026-10-28T06:00:00.000Z'
export const OLD = '2026-10-01T00:00:00.000Z'

export interface Harness {
  adapter: DrizzleDatabaseAdapter
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  schema: any
  count(table: string, where?: string): Promise<number>
  /** Every statement run, in order: on Postgres only. */
  queries?: string[]
}

export async function sqliteHarness(): Promise<Harness> {
  const sqlite = new Database(':memory:')
  sqlite.pragma('foreign_keys = ON')
  const db = drizzleSqlite(sqlite, { schema: sqliteSchema })
  migrateSqlite(db, { migrationsFolder: SQLITE_FOLDER })
  return {
    adapter: new DrizzleDatabaseAdapter(db, sqliteSchema, { dialect: 'sqlite' }),
    db,
    schema: sqliteSchema,
    count: async (table, where = '1=1') =>
      (sqlite.prepare(`SELECT count(*) AS n FROM ${table} WHERE ${where}`).get() as { n: number })
        .n,
  }
}

export async function pgHarness(): Promise<Harness> {
  const client = new PGlite()
  const queries: string[] = []
  const db = drizzlePg(client, { schema: pgSchema, logger: { logQuery: (q) => queries.push(q) } })
  await migratePg(db, { migrationsFolder: PG_FOLDER })
  return {
    queries,
    adapter: new DrizzleDatabaseAdapter(db, pgSchema, { dialect: 'pg' }),
    db,
    schema: pgSchema,
    count: async (table, where = '1=1') => {
      const result = await client.query<{ n: string }>(
        `SELECT count(*) AS n FROM ${table} WHERE ${where}`,
      )
      return Number(result.rows[0]!.n)
    },
  }
}

/**
 * A real D1 (workerd through Miniflare), migrated: the one driver with D1's
 * limits — at most 100 bound parameters per statement, `batch` for units.
 */
export async function d1Harness(): Promise<Harness & { dispose(): Promise<void> }> {
  const mf = new Miniflare({ modules: true, script: 'export default {}', d1Databases: ['DB'] })
  const binding = await mf.getD1Database('DB')
  const db = createD1DrizzleDb(binding)
  await migrateD1(db, { migrationsFolder: SQLITE_FOLDER })
  return {
    adapter: new DrizzleDatabaseAdapter(db, sqliteSchema, { dialect: 'sqlite' }),
    db,
    schema: sqliteSchema,
    count: async (table, where = '1=1') =>
      (
        (await binding.prepare(`SELECT count(*) AS n FROM ${table} WHERE ${where}`).first()) as {
          n: number
        }
      ).n,
    dispose: () => mf.dispose(),
  }
}

// Two orgs. Ama owns Acme and is a member of Globex; Ben is Acme's admin;
// Cleo is in Globex only. Acme has two projects; Project 101 has Sales (with
// four items and some runs) and Ops (empty). Project 202 has Default only.
export async function seed(h: Harness) {
  const s = h.schema
  const at = { createdAt: T0, updatedAt: T0 }
  await h.db.insert(s.user).values([
    { id: 'u-ama', name: 'Ama Mensah', email: 'ama@acme.test', emailVerified: true, ...at },
    { id: 'u-ben', name: 'Ben Okoro', email: 'ben@acme.test', emailVerified: true, ...at },
    { id: 'u-cleo', name: 'Cleo Park', email: 'cleo@globex.test', emailVerified: true, ...at },
  ])
  await h.db.insert(s.organization).values([
    { id: 'org-acme', name: 'Acme', slug: 'acme', createdAt: T0 },
    { id: 'org-globex', name: 'Globex', slug: 'globex', createdAt: T0 },
  ])
  await h.db.insert(s.member).values([
    { id: 'm-1', userId: 'u-ama', organizationId: 'org-acme', role: 'owner', createdAt: T0 },
    { id: 'm-2', userId: 'u-ben', organizationId: 'org-acme', role: 'admin', createdAt: T0 },
    { id: 'm-3', userId: 'u-ama', organizationId: 'org-globex', role: 'member', createdAt: T0 },
    { id: 'm-4', userId: 'u-cleo', organizationId: 'org-globex', role: 'owner', createdAt: T0 },
  ])
  await h.db.insert(s.projects).values([
    { id: 'p-101', organizationId: 'org-acme', name: 'Project 101', slug: 'project-101', ...at },
    { id: 'p-202', organizationId: 'org-acme', name: 'Project 202', slug: 'project-202', ...at },
    { id: 'p-g', organizationId: 'org-globex', name: 'Globex app', slug: 'app', ...at },
  ])
  await h.db.insert(s.workspaces).values([
    {
      id: 'ws-sales',
      projectId: 'p-101',
      name: 'Sales',
      slug: 'sales',
      colour: 'blue',
      createdBy: 'u-ama',
      createdAt: '2026-10-20T00:00:00.000Z',
      updatedAt: T0,
    },
    {
      id: 'ws-ops',
      projectId: 'p-101',
      name: 'Ops',
      slug: 'ops',
      colour: 'amber',
      createdBy: 'u-ben',
      createdAt: '2026-10-21T00:00:00.000Z',
      updatedAt: T0,
    },
    {
      id: 'ws-202',
      projectId: 'p-202',
      name: 'Default',
      slug: 'default',
      createdAt: T0,
      updatedAt: T0,
    },
    {
      id: 'ws-g',
      projectId: 'p-g',
      name: 'Default',
      slug: 'default',
      createdAt: T0,
      updatedAt: T0,
    },
  ])
  const wf = (id: string, workspaceId: string, name: string, kind = 'workflow') => ({
    id,
    projectId: workspaceId === 'ws-g' ? 'p-g' : workspaceId === 'ws-202' ? 'p-202' : 'p-101',
    workspaceId,
    createdBy: 'u-ama',
    name,
    kind,
    ...at,
  })
  await h.db.insert(s.workflows).values([
    { ...wf('wf-enrich', 'ws-sales', 'Lead enrichment'), createdAt: '2026-10-20T00:00:01.000Z' },
    { ...wf('wf-sync', 'ws-sales', 'CRM sync'), createdAt: '2026-10-20T00:00:02.000Z' },
    {
      ...wf('wf-fn', 'ws-sales', 'Webhook relay', 'script'),
      createdAt: '2026-10-20T00:00:03.000Z',
    },
    { ...wf('wf-draft', 'ws-sales', 'Draft'), createdAt: '2026-10-20T00:00:04.000Z' },
    wf('wf-202', 'ws-202', 'Nightly'),
    wf('wf-g', 'ws-g', 'Globex flow'),
  ])
  await h.db.insert(s.workflowVersions).values([
    { id: 'v-enrich-1', workflowId: 'wf-enrich', version: 1, ir: '{}', createdAt: T0 },
    { id: 'v-enrich-2', workflowId: 'wf-enrich', version: 2, ir: '{}', createdAt: T0 },
    { id: 'v-sync-1', workflowId: 'wf-sync', version: 1, ir: '{}', createdAt: T0 },
  ])
  const dep = (
    id: string,
    workflowId: string,
    versionId: string,
    status: string,
    createdAt: string,
  ) => ({
    id,
    workflowId,
    versionId,
    serviceName: id,
    status,
    createdAt,
    updatedAt: createdAt,
  })
  await h.db
    .insert(s.deployments)
    .values([
      dep('d-1', 'wf-enrich', 'v-enrich-1', 'success', '2026-10-21T00:00:00.000Z'),
      dep('d-2', 'wf-enrich', 'v-enrich-2', 'success', '2026-10-22T00:00:00.000Z'),
      dep('d-3', 'wf-sync', 'v-sync-1', 'failed', '2026-10-22T00:00:00.000Z'),
    ])
  const run = (id: string, workflowId: string, status: string, createdAt: string) => ({
    id,
    workflowId,
    versionId: null,
    connectionId: null,
    instanceId: id,
    status,
    createdAt,
    updatedAt: createdAt,
  })
  await h.db
    .insert(s.workflowRuns)
    .values([
      run('r-1', 'wf-enrich', 'complete', OLD),
      run('r-2', 'wf-enrich', 'errored', '2026-10-28T01:00:00.000Z'),
      run('r-3', 'wf-enrich', 'complete', '2026-10-28T02:00:00.000Z'),
      run('r-4', 'wf-sync', 'complete', '2026-10-28T03:00:00.000Z'),
      run('r-5', 'wf-sync', 'errored', RECENT),
      run('r-6', 'wf-fn', 'running', '2026-10-28T07:00:00.000Z'),
      run('r-7', 'wf-202', 'terminated', '2026-10-28T08:00:00.000Z'),
    ])
}
