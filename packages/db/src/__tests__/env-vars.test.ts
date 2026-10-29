import { describe, it, expect, beforeEach, vi } from 'vitest'

// PGlite migrates a fresh database per test; under a parallel `pnpm test` that
// runs past vitest's 5s default.
vi.setConfig({ testTimeout: 30_000, hookTimeout: 30_000 })
import { fileURLToPath } from 'node:url'
import Database from 'better-sqlite3'
import { PGlite } from '@electric-sql/pglite'
import { drizzle as drizzleSqlite } from 'drizzle-orm/better-sqlite3'
import { migrate as migrateSqlite } from 'drizzle-orm/better-sqlite3/migrator'
import { drizzle as drizzlePg } from 'drizzle-orm/pglite'
import { migrate as migratePg } from 'drizzle-orm/pglite/migrator'
import { eq, type Logger } from 'drizzle-orm'
import { DrizzleDatabaseAdapter } from '../adapters/index.js'
import * as sqliteSchema from '../schema/sqlite/index.js'
import * as pgSchema from '../schema/pg/index.js'
import { isUniqueViolation } from '../db-errors.js'
import type { VariablePlace } from '../types.js'

// Variables at three levels (B4), on both dialects: where a row may be
// written, what each level's list shows, how a project and a workspace
// resolve each name, and that a write by id stays at the place it is
// addressed at.

const SQLITE_FOLDER = fileURLToPath(new URL('../../drizzle/sqlite', import.meta.url))
const PG_FOLDER = fileURLToPath(new URL('../../drizzle/pg', import.meta.url))

const T0 = '2026-10-20T00:00:00.000Z'

interface Harness {
  adapter: DrizzleDatabaseAdapter
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  schema: any
  statements: { n: number }
}

function countingLogger(statements: { n: number }): Logger {
  return {
    logQuery() {
      statements.n += 1
    },
  }
}

async function sqliteHarness(): Promise<Harness> {
  const sqlite = new Database(':memory:')
  sqlite.pragma('foreign_keys = ON')
  const statements = { n: 0 }
  const db = drizzleSqlite(sqlite, { schema: sqliteSchema, logger: countingLogger(statements) })
  migrateSqlite(db, { migrationsFolder: SQLITE_FOLDER })
  return {
    adapter: new DrizzleDatabaseAdapter(db, sqliteSchema, { dialect: 'sqlite' }),
    db,
    schema: sqliteSchema,
    statements,
  }
}

async function pgHarness(): Promise<Harness> {
  const client = new PGlite()
  const statements = { n: 0 }
  const db = drizzlePg(client, { schema: pgSchema, logger: countingLogger(statements) })
  await migratePg(db, { migrationsFolder: PG_FOLDER })
  return {
    adapter: new DrizzleDatabaseAdapter(db, pgSchema, { dialect: 'pg' }),
    db,
    schema: pgSchema,
    statements,
  }
}

// Acme: Ama owns it; Dan is a project member of Project 101; Eve holds a
// Viewer grant in Sales only; Gus an Editor grant in Ops only; Fay is a
// plain member with no grants. Project 101 has Sales and Ops; Project 202
// has Default. Globex is another organization with its own project.
async function seed(h: Harness) {
  const s = h.schema
  const at = { createdAt: T0, updatedAt: T0 }
  const person = (id: string, name: string) => ({
    id,
    name,
    email: `${id}@acme.test`,
    emailVerified: true,
    ...at,
  })
  await h.db
    .insert(s.user)
    .values([
      person('u-ama', 'Ama'),
      person('u-dan', 'Dan'),
      person('u-eve', 'Eve'),
      person('u-fay', 'Fay'),
      person('u-gus', 'Gus'),
      person('u-cleo', 'Cleo'),
    ])
  await h.db.insert(s.organization).values([
    { id: 'org-acme', name: 'Acme', slug: 'acme', createdAt: T0 },
    { id: 'org-globex', name: 'Globex', slug: 'globex', createdAt: T0 },
  ])
  const member = (id: string, userId: string, organizationId: string, role: string) => ({
    id,
    userId,
    organizationId,
    role,
    createdAt: T0,
  })
  await h.db
    .insert(s.member)
    .values([
      member('m-1', 'u-ama', 'org-acme', 'owner'),
      member('m-3', 'u-dan', 'org-acme', 'member'),
      member('m-4', 'u-eve', 'org-acme', 'member'),
      member('m-5', 'u-fay', 'org-acme', 'member'),
      member('m-6', 'u-gus', 'org-acme', 'member'),
      member('m-7', 'u-cleo', 'org-globex', 'owner'),
      member('m-8', 'u-ama', 'org-globex', 'admin'),
    ])
  await h.db.insert(s.projects).values([
    { id: 'p-101', organizationId: 'org-acme', name: 'Project 101', slug: 'project-101', ...at },
    { id: 'p-202', organizationId: 'org-acme', name: 'Project 202', slug: 'project-202', ...at },
    { id: 'p-g', organizationId: 'org-globex', name: 'Globex app', slug: 'app', ...at },
  ])
  const ws = (id: string, projectId: string, name: string, slug: string, colour: string) => ({
    id,
    projectId,
    name,
    slug,
    colour,
    createdBy: 'u-ama',
    ...at,
  })
  await h.db
    .insert(s.workspaces)
    .values([
      ws('ws-sales', 'p-101', 'Sales', 'sales', 'blue'),
      ws('ws-ops', 'p-101', 'Ops', 'ops', 'green'),
      ws('ws-202', 'p-202', 'Default', 'default', 'green'),
      ws('ws-g', 'p-g', 'Default', 'default', 'green'),
    ])
  await h.db
    .insert(s.projectMembers)
    .values([
      { projectId: 'p-101', userId: 'u-dan', role: 'member', createdBy: 'u-ama', createdAt: T0 },
    ])
  await h.db.insert(s.workspaceMembers).values([
    { workspaceId: 'ws-sales', userId: 'u-eve', role: 'viewer', createdBy: 'u-ama', createdAt: T0 },
    { workspaceId: 'ws-ops', userId: 'u-gus', role: 'editor', createdBy: 'u-ama', createdAt: T0 },
  ])
}

const ORG: VariablePlace = { level: 'organization', organizationId: 'org-acme' }
const P101: VariablePlace = { level: 'project', organizationId: 'org-acme', projectId: 'p-101' }
const P202: VariablePlace = { level: 'project', organizationId: 'org-acme', projectId: 'p-202' }
const SALES: VariablePlace = {
  level: 'workspace',
  organizationId: 'org-acme',
  projectId: 'p-101',
  workspaceId: 'ws-sales',
}
const OPS: VariablePlace = {
  level: 'workspace',
  organizationId: 'org-acme',
  projectId: 'p-101',
  workspaceId: 'ws-ops',
}

/** A row as stored, read off the table: the adapter offers no unscoped read by id. */
async function rowOf(h: Harness, id: string): Promise<{ isSecret: boolean } | null> {
  const rows = await h.db
    .select({ isSecret: h.schema.envVars.isSecret })
    .from(h.schema.envVars)
    .where(eq(h.schema.envVars.id, id))
  return rows[0] ?? null
}

let next = 0
function variable(place: VariablePlace, name: string, value: string, isSecret = false) {
  next += 1
  return { id: `v-${next}`, place, createdBy: 'u-ama', name, value, isSecret }
}

/** REGION at the org, overridden in Project 202 and in Sales; API_URL in Project 101; TOKEN (secret) in Ops. */
async function seedVariables(h: Harness) {
  await h.adapter.createEnvVar(variable(ORG, 'REGION', 'eu'))
  await h.adapter.createEnvVar(variable(ORG, 'LOG_LEVEL', 'info'))
  await h.adapter.createEnvVar(variable(P101, 'API_URL', 'https://101.test'))
  await h.adapter.createEnvVar(variable(P202, 'REGION', 'us'))
  await h.adapter.createEnvVar(variable(SALES, 'REGION', 'apac'))
  await h.adapter.createEnvVar(variable(OPS, 'TOKEN', 'hidden', true))
}

describe.each([
  ['sqlite', sqliteHarness],
  ['pg', pgHarness],
])('variables on %s', (_dialect, create) => {
  let h: Harness

  beforeEach(async () => {
    h = await create()
    await seed(h)
  })

  describe('writing at a place', () => {
    it('writes at each level, with the ids of the place on the row', async () => {
      expect(await h.adapter.createEnvVar(variable(ORG, 'A', '1'))).toMatchObject({
        organizationId: 'org-acme',
        projectId: null,
        workspaceId: null,
      })
      expect(await h.adapter.createEnvVar(variable(P101, 'A', '2'))).toMatchObject({
        projectId: 'p-101',
        workspaceId: null,
      })
      expect(await h.adapter.createEnvVar(variable(SALES, 'A', '3'))).toMatchObject({
        projectId: 'p-101',
        workspaceId: 'ws-sales',
      })
    })

    it('writes nothing where the place is not the organization’s, or not the project’s', async () => {
      const elsewhere: VariablePlace = {
        level: 'project',
        organizationId: 'org-acme',
        projectId: 'p-g',
      }
      expect(await h.adapter.createEnvVar(variable(elsewhere, 'A', '1'))).toBeNull()
      const wrongProject: VariablePlace = {
        level: 'workspace',
        organizationId: 'org-acme',
        projectId: 'p-202',
        workspaceId: 'ws-sales',
      }
      expect(await h.adapter.createEnvVar(variable(wrongProject, 'A', '1'))).toBeNull()
      expect(await rowOf(h, 'v-1')).toBeNull()
    })

    it('writes nothing where the author cannot open the place', async () => {
      // Gus opens Ops only; Fay opens no project.
      const asGus = { ...variable(SALES, 'A', '1'), createdBy: 'u-gus' }
      expect(await h.adapter.createEnvVar(asGus)).toBeNull()
      const asFay = { ...variable(P101, 'A', '1'), createdBy: 'u-fay' }
      expect(await h.adapter.createEnvVar(asFay)).toBeNull()
      const gusInOps = { ...variable(OPS, 'A', '1'), createdBy: 'u-gus' }
      expect(await h.adapter.createEnvVar(gusInOps)).not.toBeNull()
    })

    it('allows one name per level, and the same name at different levels', async () => {
      await h.adapter.createEnvVar(variable(ORG, 'REGION', 'eu'))
      await h.adapter.createEnvVar(variable(P101, 'REGION', 'us'))
      await h.adapter.createEnvVar(variable(SALES, 'REGION', 'apac'))
      for (const place of [ORG, P101, SALES]) {
        const error = await h.adapter.createEnvVar(variable(place, 'REGION', 'again')).then(
          () => null,
          (e: unknown) => e,
        )
        expect(isUniqueViolation(error), `duplicate at ${place.level}`).toBe(true)
      }
      // Another workspace of the same project is another place.
      expect(await h.adapter.createEnvVar(variable(OPS, 'REGION', 'us-east'))).not.toBeNull()
    })
  })

  describe('each level’s own list', () => {
    beforeEach(() => seedVariables(h))

    it('lists the organization’s rows with how many projects the viewer can open set the name', async () => {
      const forAma = await h.adapter.listEnvVarsByOrganization('org-acme', undefined, 'u-ama')
      expect(Object.fromEntries(forAma.data.map((v) => [v.name, v.overriddenIn]))).toEqual({
        REGION: 2,
        LOG_LEVEL: 0,
      })
      // Eve opens Project 101 (through Sales), not Project 202; Fay opens nothing.
      const forEve = await h.adapter.listEnvVarsByOrganization('org-acme', undefined, 'u-eve')
      expect(forEve.data.find((v) => v.name === 'REGION')!.overriddenIn).toBe(1)
      const forFay = await h.adapter.listEnvVarsByOrganization('org-acme', undefined, 'u-fay')
      expect(forFay.data.find((v) => v.name === 'REGION')!.overriddenIn).toBe(0)
    })

    it('counts an override in a workspace only for someone who can open that workspace', async () => {
      // LOG_LEVEL is overridden in Ops alone: Gus (Ops) sees the project
      // count it, Eve (Sales) does not — exactly the chips each gets on the
      // project's page.
      await h.adapter.createEnvVar(variable(OPS, 'LOG_LEVEL', 'debug'))
      const count = async (who: string) =>
        (await h.adapter.listEnvVarsByOrganization('org-acme', undefined, who)).data.find(
          (v) => v.name === 'LOG_LEVEL',
        )!.overriddenIn
      expect(await count('u-gus')).toBe(1)
      expect(await count('u-eve')).toBe(0)
      expect(await count('u-ama')).toBe(1)
      await h.adapter.createEnvVar(variable(P101, 'LOG_LEVEL', 'warn'))
      expect(await count('u-eve')).toBe(1)
    })

    it('lists a project’s own rows, not its workspaces’, and a workspace’s own', async () => {
      const project = await h.adapter.listEnvVarsByProject('org-acme', 'p-101')
      expect(project.data.map((v) => v.name)).toEqual(['API_URL'])
      const sales = await h.adapter.listEnvVarsByWorkspace('org-acme', 'p-101', 'ws-sales')
      expect(sales.data.map((v) => [v.name, v.value])).toEqual([['REGION', 'apac']])
      const ops = await h.adapter.listEnvVarsByWorkspace('org-acme', 'p-101', 'ws-ops')
      expect(ops.data.map((v) => [v.name, v.isSecret])).toEqual([['TOKEN', true]])
    })
  })

  describe('resolved for a project', () => {
    beforeEach(() => seedVariables(h))

    it('answers each name once, the project’s own first, with where it is set', async () => {
      h.statements.n = 0
      const rows = await h.adapter.listResolvedVariablesForProject('org-acme', 'p-101', 'u-ama')
      expect(h.statements.n).toBe(1)
      expect(
        rows.map((v) => [
          v.name,
          v.value,
          v.level,
          v.setAt.name,
          v.overriddenIn.map((w) => w.slug),
        ]),
      ).toEqual([
        ['API_URL', 'https://101.test', 'project', 'Project 101', []],
        ['LOG_LEVEL', 'info', 'organization', 'Acme', []],
        ['REGION', 'eu', 'organization', 'Acme', ['sales']],
      ])
      expect(rows[2]!.overriddenIn[0]).toEqual({
        id: 'ws-sales',
        slug: 'sales',
        name: 'Sales',
        colour: 'blue',
      })
      expect(rows[2]!.setAt).toEqual({ level: 'organization', id: 'org-acme', name: 'Acme' })
    })

    it('hides an org value the project sets itself', async () => {
      const rows = await h.adapter.listResolvedVariablesForProject('org-acme', 'p-202', 'u-ama')
      expect(rows.map((v) => [v.name, v.value, v.level])).toEqual([
        ['REGION', 'us', 'project'],
        ['LOG_LEVEL', 'info', 'organization'],
      ])
    })

    it('lists only the overriding workspaces the viewer can open', async () => {
      // Gus opens Ops only: Sales's override is not his to see.
      const forGus = await h.adapter.listResolvedVariablesForProject('org-acme', 'p-101', 'u-gus')
      expect(forGus.find((v) => v.name === 'REGION')!.overriddenIn).toEqual([])
      const forEve = await h.adapter.listResolvedVariablesForProject('org-acme', 'p-101', 'u-eve')
      expect(forEve.find((v) => v.name === 'REGION')!.overriddenIn.map((w) => w.id)).toEqual([
        'ws-sales',
      ])
    })
  })

  describe('resolved for a workspace', () => {
    beforeEach(() => seedVariables(h))

    it('answers each name once, the closest level winning, closest first', async () => {
      h.statements.n = 0
      const sales = await h.adapter.listResolvedVariablesForWorkspace(
        'org-acme',
        'p-101',
        'ws-sales',
      )
      expect(h.statements.n).toBe(1)
      expect(
        sales.map((v) => [v.name, v.value, v.source.level, v.source.name, v.overrides]),
      ).toEqual([
        ['REGION', 'apac', 'workspace', 'Sales', 'organization'],
        ['API_URL', 'https://101.test', 'project', 'Project 101', null],
        ['LOG_LEVEL', 'info', 'organization', 'Acme', null],
      ])
      expect(sales[0]!.source).toEqual({ level: 'workspace', id: 'ws-sales', name: 'Sales' })
      expect(sales[0]!.isSecret).toBe(false)
    })

    it('never shows another workspace’s rows, and names what a project value replaces', async () => {
      await h.adapter.createEnvVar(variable(P101, 'LOG_LEVEL', 'debug'))
      const ops = await h.adapter.listResolvedVariablesForWorkspace('org-acme', 'p-101', 'ws-ops')
      expect(ops.map((v) => [v.name, v.value, v.source.level, v.overrides, v.isSecret])).toEqual([
        ['TOKEN', 'hidden', 'workspace', null, true],
        ['API_URL', 'https://101.test', 'project', null, false],
        ['LOG_LEVEL', 'debug', 'project', 'organization', false],
        ['REGION', 'eu', 'organization', null, false],
      ])
    })
  })

  describe('resolving references', () => {
    beforeEach(() => seedVariables(h))

    it('answers one row per name, the closest level’s', async () => {
      const inSales = await h.adapter.findEnvVarsByNames(
        'org-acme',
        ['REGION', 'API_URL', 'LOG_LEVEL', 'MISSING'],
        'p-101',
        'ws-sales',
      )
      expect(Object.fromEntries(inSales.map((v) => [v.name, v.value]))).toEqual({
        REGION: 'apac',
        API_URL: 'https://101.test',
        LOG_LEVEL: 'info',
      })
      const inOps = await h.adapter.findEnvVarsByNames(
        'org-acme',
        ['REGION', 'TOKEN'],
        'p-101',
        'ws-ops',
      )
      expect(Object.fromEntries(inOps.map((v) => [v.name, v.value]))).toEqual({
        REGION: 'eu',
        TOKEN: 'hidden',
      })
      expect(inOps.find((v) => v.name === 'TOKEN')!.isSecret).toBe(true)
    })

    it('without a workspace reads the project and the org; without a project, the org alone', async () => {
      const project = await h.adapter.findEnvVarsByNames('org-acme', ['REGION', 'TOKEN'], 'p-101')
      expect(Object.fromEntries(project.map((v) => [v.name, v.value]))).toEqual({ REGION: 'eu' })
      const other = await h.adapter.findEnvVarsByNames('org-acme', ['REGION'], 'p-202')
      expect(other.map((v) => v.value)).toEqual(['us'])
      const org = await h.adapter.findEnvVarsByNames('org-acme', ['REGION', 'API_URL'], null)
      expect(org.map((v) => [v.name, v.value])).toEqual([['REGION', 'eu']])
      expect(await h.adapter.findEnvVarsByNames('org-globex', ['REGION'], null)).toEqual([])
      expect(await h.adapter.findEnvVarsByNames('org-acme', [], 'p-101', 'ws-sales')).toEqual([])
    })

    it('reads a workspace’s rows only with their own project', async () => {
      // A workspace named with another project is no place: its rows stay
      // out of every read, even if a workflow row ever disagreed with itself.
      const wrong = await h.adapter.findEnvVarsByNames('org-acme', ['REGION'], 'p-202', 'ws-sales')
      expect(wrong.map((v) => v.value)).toEqual(['us'])
      const resolved = await h.adapter.listResolvedVariablesForWorkspace(
        'org-acme',
        'p-202',
        'ws-sales',
      )
      expect(resolved.map((v) => [v.name, v.source.level])).toEqual([
        ['REGION', 'project'],
        ['LOG_LEVEL', 'organization'],
      ])
      expect(
        (await h.adapter.listEnvVarsByWorkspace('org-acme', 'p-202', 'ws-sales')).data,
      ).toEqual([])
    })

    it('takes any number of names as one bound list', async () => {
      // D1 allows 100 parameters per statement; a workflow with more
      // references than that must still resolve in one query.
      const names = Array.from({ length: 150 }, (_, i) => `NAME_${i}`)
      const found = await h.adapter.findEnvVarsByNames(
        'org-acme',
        [...names, 'REGION'],
        'p-101',
        'ws-sales',
      )
      expect(found.map((v) => v.value)).toEqual(['apac'])
    })
  })

  describe('writes by id, pinned to the place', () => {
    beforeEach(() => seedVariables(h))

    it('updates and deletes a row only where it is addressed', async () => {
      const orgRegion = (await h.adapter.listEnvVarsByOrganization('org-acme')).data.find(
        (v) => v.name === 'REGION',
      )!
      expect(await h.adapter.updateEnvVar(orgRegion.id, P101, { value: 'x' })).toBeNull()
      expect(await h.adapter.updateEnvVar(orgRegion.id, SALES, { value: 'x' })).toBeNull()
      expect(await h.adapter.deleteEnvVar(orgRegion.id, P101)).toBe(false)
      expect((await h.adapter.updateEnvVar(orgRegion.id, ORG, { value: 'eu-west' }))?.value).toBe(
        'eu-west',
      )

      const salesRegion = (await h.adapter.listEnvVarsByWorkspace('org-acme', 'p-101', 'ws-sales'))
        .data[0]!
      expect(await h.adapter.updateEnvVar(salesRegion.id, P101, { value: 'x' })).toBeNull()
      expect(await h.adapter.updateEnvVar(salesRegion.id, OPS, { value: 'x' })).toBeNull()
      expect(await h.adapter.deleteEnvVar(salesRegion.id, ORG)).toBe(false)
      expect(await h.adapter.deleteEnvVar(salesRegion.id, SALES)).toBe(true)
      expect(await rowOf(h, salesRegion.id)).toBeNull()

      const elsewhere: VariablePlace = { level: 'organization', organizationId: 'org-globex' }
      expect(await h.adapter.updateEnvVar(orgRegion.id, elsewhere, { value: 'x' })).toBeNull()
    })

    it('never turns a stored secret readable by flipping the flag', async () => {
      const token = (await h.adapter.listEnvVarsByWorkspace('org-acme', 'p-101', 'ws-ops')).data[0]!
      expect(await h.adapter.updateEnvVar(token.id, OPS, { isSecret: false })).toBeNull()
      expect((await rowOf(h, token.id))?.isSecret).toBe(true)
      // The refusal is told from a miss where the row is addressed, and only there.
      expect(await h.adapter.isSecretVariableAt(token.id, OPS)).toBe(true)
      expect(await h.adapter.isSecretVariableAt(token.id, SALES)).toBe(false)
      expect(await h.adapter.isSecretVariableAt(token.id, P101)).toBe(false)
      const replaced = await h.adapter.updateEnvVar(token.id, OPS, {
        isSecret: false,
        value: 'public',
      })
      expect(replaced).toMatchObject({ isSecret: false, value: 'public' })
    })
  })

  describe('with the rest of the model', () => {
    beforeEach(() => seedVariables(h))

    it('a project’s and its workspaces’ variables move with it to another organization', async () => {
      // Ama runs Globex too (admin), so she may move Project 101 there.
      await h.adapter.moveProjectToOrganization('p-101', 'org-acme', 'org-globex', 'u-ama')
      expect((await h.adapter.listEnvVarsByProject('org-globex', 'p-101')).data).toHaveLength(1)
      expect(
        (await h.adapter.listEnvVarsByWorkspace('org-globex', 'p-101', 'ws-sales')).data,
      ).toHaveLength(1)
      expect((await h.adapter.listEnvVarsByProject('org-acme', 'p-101')).data).toEqual([])
      // Its workflows now resolve against Globex's org values, not Acme's.
      const found = await h.adapter.findEnvVarsByNames(
        'org-globex',
        ['REGION', 'API_URL'],
        'p-101',
        'ws-ops',
      )
      expect(Object.fromEntries(found.map((v) => [v.name, v.value]))).toEqual({
        API_URL: 'https://101.test',
      })
    })

    it('a workspace’s variables go with the workspace', async () => {
      expect(await h.adapter.deleteWorkspaceUnlessLast('ws-sales')).toBe(true)
      const rows = await h.adapter.listResolvedVariablesForProject('org-acme', 'p-101', 'u-ama')
      expect(rows.find((v) => v.name === 'REGION')!.overriddenIn).toEqual([])
    })
  })
})
