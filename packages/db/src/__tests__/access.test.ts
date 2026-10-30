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
import type { Logger } from 'drizzle-orm'
import { DrizzleDatabaseAdapter } from '../adapters/index.js'
import * as sqliteSchema from '../schema/sqlite/index.js'
import * as pgSchema from '../schema/pg/index.js'
import { eq } from 'drizzle-orm'
import { isUniqueViolation } from '../db-errors.js'

// Roles below the organization, on both dialects: what is hidden, who can
// open what, and every write of the people pages and the invite flow.

const SQLITE_FOLDER = fileURLToPath(new URL('../../drizzle/sqlite', import.meta.url))
const PG_FOLDER = fileURLToPath(new URL('../../drizzle/pg', import.meta.url))

const T0 = '2026-10-20T00:00:00.000Z'
const NOW = '2026-10-28T12:00:00.000Z'
const LATER = '2026-11-04T12:00:00.000Z'
const ACTIVE = '2026-10-28T06:00:00.000Z'

interface Harness {
  adapter: DrizzleDatabaseAdapter
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  schema: any
  count(table: string, where?: string): Promise<number>
  /** The person's rows in better-auth's member table, whose column names differ per dialect. */
  memberRows(userId: string): Promise<{ organizationId: string; role: string }[]>
  statements: { n: number }
}

async function memberRowsOf(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  schema: any,
  userId: string,
): Promise<{ organizationId: string; role: string }[]> {
  return db
    .select({ organizationId: schema.member.organizationId, role: schema.member.role })
    .from(schema.member)
    .where(eq(schema.member.userId, userId))
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
    count: async (table, where = '1=1') =>
      (sqlite.prepare(`SELECT count(*) AS n FROM ${table} WHERE ${where}`).get() as { n: number })
        .n,
    memberRows: (userId) => memberRowsOf(db, sqliteSchema, userId),
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
    count: async (table, where = '1=1') => {
      const result = await client.query<{ n: string }>(
        `SELECT count(*) AS n FROM ${table} WHERE ${where}`,
      )
      return Number(result.rows[0]!.n)
    },
    memberRows: (userId) => memberRowsOf(db, pgSchema, userId),
  }
}

// Acme: Ama owns it, Ben is its admin, Dan is a project member of Project
// 101, Eve holds a Viewer grant in Sales only, Fay is a plain member with no
// grants, Gus holds an Editor grant in Ops only. Globex: Cleo owns it, Ama
// is a plain member there. Project 101 has Sales and Ops; Project 202 has
// Default; Globex has its app with Default.
async function seed(h: Harness) {
  const s = h.schema
  const at = { createdAt: T0, updatedAt: T0 }
  const person = (id: string, name: string, email: string) => ({
    id,
    name,
    email,
    emailVerified: true,
    ...at,
  })
  await h.db
    .insert(s.user)
    .values([
      person('u-ama', 'Ama Mensah', 'ama@acme.test'),
      person('u-ben', 'Ben Okoro', 'ben@acme.test'),
      person('u-dan', 'Dan Kim', 'dan@acme.test'),
      person('u-eve', 'Eve Park', 'eve@acme.test'),
      person('u-fay', 'Fay Lund', 'fay@acme.test'),
      person('u-gus', 'Gus Roy', 'gus@acme.test'),
      person('u-cleo', 'Cleo Park', 'cleo@globex.test'),
      person('u-hal', 'Hal Ito', 'hal@example.test'),
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
      member('m-2', 'u-ben', 'org-acme', 'admin'),
      member('m-3', 'u-dan', 'org-acme', 'member'),
      member('m-4', 'u-eve', 'org-acme', 'member'),
      member('m-5', 'u-fay', 'org-acme', 'member'),
      member('m-6', 'u-gus', 'org-acme', 'member'),
      member('m-7', 'u-cleo', 'org-globex', 'owner'),
      member('m-8', 'u-ama', 'org-globex', 'member'),
    ])
  await h.db.insert(s.session).values([
    {
      id: 's-dan',
      token: 't-dan',
      userId: 'u-dan',
      expiresAt: LATER,
      createdAt: T0,
      updatedAt: ACTIVE,
    },
  ])
  await h.db.insert(s.projects).values([
    { id: 'p-101', organizationId: 'org-acme', name: 'Project 101', slug: 'project-101', ...at },
    { id: 'p-202', organizationId: 'org-acme', name: 'Project 202', slug: 'project-202', ...at },
    { id: 'p-g', organizationId: 'org-globex', name: 'Globex app', slug: 'app', ...at },
  ])
  const ws = (id: string, projectId: string, name: string, slug: string, createdAt: string) => ({
    id,
    projectId,
    name,
    slug,
    colour: 'blue',
    createdBy: 'u-ama',
    createdAt,
    updatedAt: T0,
  })
  await h.db
    .insert(s.workspaces)
    .values([
      ws('ws-sales', 'p-101', 'Sales', 'sales', '2026-10-20T00:00:00.000Z'),
      ws('ws-ops', 'p-101', 'Ops', 'ops', '2026-10-21T00:00:00.000Z'),
      ws('ws-202', 'p-202', 'Default', 'default', T0),
      ws('ws-g', 'p-g', 'Default', 'default', T0),
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
  await h.db.insert(s.workflows).values([
    {
      id: 'wf-sales',
      projectId: 'p-101',
      workspaceId: 'ws-sales',
      createdBy: 'u-ama',
      name: 'In sales',
      ...at,
    },
    {
      id: 'wf-ops',
      projectId: 'p-101',
      workspaceId: 'ws-ops',
      createdBy: 'u-ama',
      name: 'In ops',
      ...at,
    },
  ])
}

describe.each([
  ['sqlite', sqliteHarness],
  ['pg', pgHarness],
])('access on %s', (_dialect, create) => {
  let h: Harness

  beforeEach(async () => {
    h = await create()
    await seed(h)
  })

  describe('what is hidden', () => {
    it('hides a project from a member with no row in it, and its workspaces from a workspace-only member', async () => {
      expect(await h.adapter.getProjectIfMember('u-fay', { id: 'p-101' })).toBeNull()
      expect(await h.adapter.getWorkspaceIfMember('u-fay', { id: 'ws-sales' })).toBeNull()

      const eve = await h.adapter.getProjectIfMember('u-eve', { id: 'p-101' }, { slug: 'sales' })
      expect(eve).toMatchObject({
        workspace: { id: 'ws-sales', slug: 'sales' },
        orgRole: 'member',
        projectGrant: null,
        workspaceGrant: 'viewer',
      })
      expect(
        await h.adapter.getProjectIfMember('u-eve', { id: 'p-101' }, { slug: 'ops' }),
      ).toBeNull()
      expect(await h.adapter.getWorkspaceIfMember('u-eve', { id: 'ws-ops' })).toBeNull()
      // Ops is still a workspace of the project for a key's project pin.
      expect(await h.adapter.getWorkspaceInProject('p-101', { id: 'ws-ops' })).not.toBeNull()
    })

    it('cuts the scope, the lists and the counts to what the viewer can open', async () => {
      const scope = await h.adapter.getScopeBySlugs('u-eve', {
        org: 'acme',
        project: 'project-101',
        workspace: 'ops',
      })
      expect(scope!.org.projectCount).toBe(1)
      expect(scope!.project!.workspaces.map((w) => w.slug)).toEqual(['sales'])
      expect(scope!.project!.health.workflows).toBe(1)
      // Gus is only in Ops, which Eve cannot see; he is not on the card.
      expect(scope!.project!.members.map((m) => m.id)).toEqual(['u-ama', 'u-ben', 'u-dan', 'u-eve'])
      expect(scope!.workspace).toBeNull()

      const projects = await h.adapter.listProjectsByOrganization('org-acme', 'u-eve')
      expect(projects.data.map((p) => p.id)).toEqual(['p-101'])
      expect(projects.data[0]!.viewer).toEqual({
        orgRole: 'member',
        projectGrant: null,
        workspaceGrant: null,
      })
      expect(await h.adapter.listProjectsByOrganization('org-acme', 'u-fay')).toMatchObject({
        data: [],
      })

      const workspaces = await h.adapter.listWorkspacesByProject('p-101', 'u-eve')
      expect(workspaces.map((w) => [w.slug, w.viewer.workspaceGrant])).toEqual([
        ['sales', 'viewer'],
      ])
      expect(
        (await h.adapter.listWorkspacesByProject('p-101', 'u-dan')).map((w) => w.slug),
      ).toEqual(['sales', 'ops'])

      const orgs = await h.adapter.listOrganizationsForMember('u-fay')
      expect(orgs.map((o) => o.projectCount)).toEqual([0])
    })

    it('finds a workflow with the caller’s rows only through a workspace they can open', async () => {
      const sales = await h.adapter.getWorkflowForUser('u-eve', 'wf-sales')
      expect(sales).toMatchObject({
        workflow: { id: 'wf-sales' },
        organizationId: 'org-acme',
        orgRole: 'member',
        projectGrant: null,
        workspaceGrant: 'viewer',
      })
      expect(await h.adapter.getWorkflowForUser('u-eve', 'wf-ops')).toBeNull()
      expect(await h.adapter.getWorkflowForUser('u-dan', 'wf-ops')).toMatchObject({
        projectGrant: 'member',
        workspaceGrant: null,
      })
      expect(await h.adapter.getWorkflowForUser('u-cleo', 'wf-ops')).toBeNull()
    })

    it('lists only workflows, runs and deployments in workspaces the viewer can open', async () => {
      const eve = await h.adapter.listWorkflowsWithStatus('p-101', undefined, {
        visibleTo: 'u-eve',
      })
      expect(eve.data.map((w) => w.id)).toEqual(['wf-sales'])
      const dan = await h.adapter.listWorkflowsWithStatus('p-101', undefined, {
        visibleTo: 'u-dan',
      })
      expect(dan.data).toHaveLength(2)
      await h.db.insert(h.schema.workflowRuns).values([
        {
          id: 'r-ops',
          workflowId: 'wf-ops',
          versionId: null,
          connectionId: null,
          instanceId: 'r-ops',
          status: 'errored',
          createdAt: NOW,
          updatedAt: NOW,
        },
      ])
      expect((await h.adapter.listRecentRunsByProject('p-101', undefined, 'u-eve')).data).toEqual(
        [],
      )
      expect(
        (await h.adapter.listRecentRunsByProject('p-101', undefined, 'u-gus')).data,
      ).toHaveLength(1)
      expect(await h.adapter.listFailingWorkflows('org-acme', 'u-eve')).toEqual([])
      expect(
        (await h.adapter.listFailingWorkflows('org-acme', 'u-gus')).map((f) => f.workflow.id),
      ).toEqual(['wf-ops'])
    })
  })

  describe('people', () => {
    it('lists everyone who can open a workspace with the rows their role comes from', async () => {
      const people = await h.adapter.listWorkspacePeople('ws-sales')
      expect(
        people.map((p) => [p.id, p.orgRole, p.projectGrant, p.workspaceGrant, p.lastActiveAt]),
      ).toEqual([
        ['u-ama', 'owner', null, null, null],
        ['u-ben', 'admin', null, null, null],
        ['u-dan', 'member', 'member', null, ACTIVE],
        ['u-eve', 'member', null, 'viewer', null],
      ])
    })

    it('lists a project’s members with grants only in the workspaces the viewer can open', async () => {
      const asAma = await h.adapter.listProjectMembers('p-101', 'u-ama')
      expect(
        asAma.map((m) => [
          m.id,
          m.orgRole,
          m.projectGrant,
          m.workspaces.map((w) => [w.slug, w.role]),
        ]),
      ).toEqual([
        ['u-ama', 'owner', null, []],
        ['u-ben', 'admin', null, []],
        ['u-dan', 'member', 'member', []],
        ['u-eve', 'member', null, [['sales', 'viewer']]],
        ['u-gus', 'member', null, [['ops', 'editor']]],
      ])
      // Eve cannot see Ops, so Gus — who is only there — is not listed for her.
      const asEve = await h.adapter.listProjectMembers('p-101', 'u-eve')
      expect(asEve.map((m) => m.id)).toEqual(['u-ama', 'u-ben', 'u-dan', 'u-eve'])
    })

    it('lists the org’s members with where they can work, in the viewer’s projects', async () => {
      const asAma = await h.adapter.listOrgMembers('org-acme', 'u-ama')
      const places = Object.fromEntries(
        asAma.map((m) => [
          m.id,
          m.places.map((p) => [p.projectName, p.workspaceCount, p.workspaceName, p.role]),
        ]),
      )
      expect(places).toEqual({
        'u-ama': [],
        'u-ben': [],
        'u-dan': [['Project 101', 2, null, 'member']],
        'u-eve': [['Project 101', 2, 'Sales', 'viewer']],
        'u-fay': [],
        'u-gus': [['Project 101', 2, 'Ops', 'editor']],
      })
      expect(asAma.find((m) => m.id === 'u-dan')!.joinedAt).toBe(T0)
      // Fay can open no project: she sees nobody's places.
      const asFay = await h.adapter.listOrgMembers('org-acme', 'u-fay')
      expect(asFay.every((m) => m.places.length === 0)).toBe(true)
      // Eve can open Sales only: Gus's Ops place is not named to her, and
      // Project 101 counts one workspace for her.
      const asEve = await h.adapter.listOrgMembers('org-acme', 'u-eve')
      const eveSees = Object.fromEntries(
        asEve.map((m) => [m.id, m.places.map((p) => [p.workspaceCount, p.workspaceName, p.role])]),
      )
      expect(eveSees['u-dan']).toEqual([[1, null, 'member']])
      expect(eveSees['u-eve']).toEqual([[1, 'Sales', 'viewer']])
      expect(eveSees['u-gus']).toEqual([])
      // A workspace row someone holds in a project they are in project-wide adds nothing, and is left out.
      await h.db.insert(h.schema.workspaceMembers).values({
        workspaceId: 'ws-sales',
        userId: 'u-dan',
        role: 'viewer',
        createdBy: 'u-ama',
        createdAt: T0,
      })
      const again = await h.adapter.listOrgMembers('org-acme', 'u-ama')
      expect(again.find((m) => m.id === 'u-dan')!.places.map((p) => p.workspaceName)).toEqual([
        null,
      ])
    })

    it('reads one person’s access: every project with its workspaces, and their rows', async () => {
      const eve = await h.adapter.getPersonAccess('org-acme', 'u-eve')
      expect(eve!.person.name).toBe('Eve Park')
      expect(eve!.role).toBe('member')
      expect(eve!.projects.map((p) => [p.id, p.workspaces.map((w) => w.slug)])).toEqual([
        ['p-101', ['sales', 'ops']],
        ['p-202', ['default']],
      ])
      expect(eve!.projectGrants).toEqual([])
      expect(eve!.workspaceGrants).toEqual([{ workspaceId: 'ws-sales', role: 'viewer' }])
      expect(await h.adapter.getPersonAccess('org-acme', 'u-cleo')).toBeNull()
    })

    it('reads each list in one statement', async () => {
      const reads = [
        () =>
          h.adapter.getScopeBySlugs('u-eve', {
            org: 'acme',
            project: 'project-101',
            workspace: 'sales',
          }),
        () => h.adapter.getWorkflowForUser('u-eve', 'wf-sales'),
        () => h.adapter.listWorkspacePeople('ws-sales'),
        () => h.adapter.listProjectMembers('p-101', 'u-ama'),
        () => h.adapter.listOrgMembers('org-acme', 'u-ama'),
        () => h.adapter.getPersonAccess('org-acme', 'u-eve'),
        () => h.adapter.listInvitations('org-acme', 'u-ama', NOW),
        () => h.adapter.getApiKeyAuthByHash('nope'),
        () =>
          h.adapter.checkInOrganization('org-acme', {
            userId: 'u-eve',
            userIds: ['u-fay'],
            projectIds: ['p-101'],
            workspaceIds: ['ws-sales'],
          }),
        () =>
          h.adapter.invitationChecks('org-acme', {
            projectIds: ['p-101'],
            workspaceIds: ['ws-sales'],
            emails: ['hal@example.test'],
            now: NOW,
          }),
        () => h.adapter.getAccessRequestForDecision('nope', 'u-ama'),
        () => h.adapter.listApiKeysByProject('org-acme', 'p-101', undefined, 'u-eve'),
        () => h.adapter.listEnvVarsByProject('org-acme', 'p-101', undefined, 'u-eve'),
      ]
      for (const read of reads) {
        h.statements.n = 0
        await read()
        expect(h.statements.n, read.toString()).toBe(1)
      }
    })
  })

  describe('the access editor', () => {
    it('checks which ids and people are the organization’s, and one person’s role, in one read', async () => {
      expect(
        await h.adapter.checkInOrganization('org-acme', {
          userId: 'u-dan',
          userIds: ['u-dan', 'u-cleo', 'nope'],
          projectIds: ['p-101', 'p-g', 'nope'],
          workspaceIds: ['ws-202', 'ws-g'],
        }),
      ).toEqual({ role: 'member', name: 'Dan Kim', users: 1, projects: 1, workspaces: 1 })
      expect(await h.adapter.checkInOrganization('org-acme', { userId: 'u-cleo' })).toEqual({
        role: null,
        name: 'Cleo Park',
        users: 0,
        projects: 0,
        workspaces: 0,
      })
    })

    it('never leaves the organization without an owner', async () => {
      expect(await h.adapter.setOrgRole('org-acme', 'u-ama', 'admin')).toBe(false)
      await h.adapter.removeOrgMember('org-acme', 'u-ama', { callerIsOwner: true })
      expect(await h.adapter.getOrgRole('org-acme', 'u-ama')).toBe('owner')
      expect(await h.adapter.setOrgRole('org-acme', 'u-ben', 'owner')).toBe(true)
      expect(await h.adapter.setOrgRole('org-acme', 'u-ama', 'admin')).toBe(true)
      expect(await h.adapter.setOrgRole('org-acme', 'u-cleo', 'admin')).toBe(false)
    })

    it('saves access as one unit: the role, then every row of theirs in the organization replaced', async () => {
      await h.adapter.saveAccess(
        'org-acme',
        'u-eve',
        {
          orgRole: 'member',
          projects: [
            { projectId: 'p-202', role: 'admin' },
            { projectId: 'p-101', role: 'member' },
          ],
          workspaces: [
            // Counts no higher than what Project 101 now gives her: skipped.
            { workspaceId: 'ws-ops', role: 'editor' },
            { workspaceId: 'ws-sales', role: 'admin' },
            // Another organization's workspace: skipped by the join.
            { workspaceId: 'ws-g', role: 'admin' },
          ],
        },
        'u-ama',
        { callerIsOwner: true },
      )
      expect(
        await h.count('workspace_members', "user_id = 'u-eve' AND workspace_id = 'ws-ops'"),
      ).toBe(0)
      expect(
        await h.count(
          'workspace_members',
          "user_id = 'u-eve' AND workspace_id = 'ws-sales' AND role = 'admin'",
        ),
      ).toBe(1)
      expect(
        await h.count('workspace_members', "user_id = 'u-eve' AND workspace_id = 'ws-g'"),
      ).toBe(0)
      expect(await h.count('project_members', "user_id = 'u-eve'")).toBe(2)
      expect(await h.adapter.getWorkspaceIfMember('u-eve', { id: 'ws-202' })).toMatchObject({
        projectGrant: 'admin',
      })
      // An org-wide role carries no rows; the rows go with it.
      await h.adapter.saveAccess(
        'org-acme',
        'u-eve',
        { orgRole: 'admin', projects: [], workspaces: [] },
        'u-ama',
        { callerIsOwner: true },
      )
      expect(await h.adapter.getOrgRole('org-acme', 'u-eve')).toBe('admin')
      expect(await h.count('project_members', "user_id = 'u-eve'")).toBe(0)
      expect(await h.count('workspace_members', "user_id = 'u-eve'")).toBe(0)
      // A role change refused (the only owner stepping down) changes nothing else either.
      await h.adapter.saveAccess(
        'org-acme',
        'u-ama',
        { orgRole: 'member', projects: [{ projectId: 'p-101', role: 'admin' }], workspaces: [] },
        'u-ama',
        { callerIsOwner: true },
      )
      expect(await h.adapter.getOrgRole('org-acme', 'u-ama')).toBe('owner')
      expect(await h.count('project_members', "user_id = 'u-ama'")).toBe(0)
    })

    it('lets only an owner change or remove an owner, in the statement', async () => {
      expect(await h.adapter.setOrgRole('org-acme', 'u-ben', 'owner')).toBe(true)
      // Ben is an owner too now, so the only-owner rule no longer protects Ama; the caller's standing does.
      const demote = { orgRole: 'admin', projects: [], workspaces: [] }
      await h.adapter.saveAccess('org-acme', 'u-ama', demote, 'u-dan', { callerIsOwner: false })
      expect(await h.adapter.getOrgRole('org-acme', 'u-ama')).toBe('owner')
      await h.adapter.removeOrgMember('org-acme', 'u-ama', { callerIsOwner: false })
      expect(await h.adapter.getOrgRole('org-acme', 'u-ama')).toBe('owner')
      await h.adapter.saveAccess('org-acme', 'u-ama', demote, 'u-ben', { callerIsOwner: true })
      expect(await h.adapter.getOrgRole('org-acme', 'u-ama')).toBe('admin')
      await h.adapter.removeOrgMember('org-acme', 'u-ama', { callerIsOwner: true })
      expect(await h.adapter.getOrgRole('org-acme', 'u-ama')).toBeNull()
    })

    it('cancels the invitations someone sent when they stop running the organization', async () => {
      const sent = (id: string, inviterId: string) => ({
        id,
        organizationId: 'org-acme',
        email: `${id}@example.test`,
        role: 'member',
        inviterId,
        expiresAt: LATER,
        places: [],
      })
      await h.adapter.createInvitations([sent('inv-ben', 'u-ben'), sent('inv-ama', 'u-ama')])
      const status = async (id: string) => (await h.adapter.getInvitation(id))!.invitation.status
      // Owner to admin still runs the organization: the invitations stand.
      await h.adapter.setOrgRole('org-acme', 'u-ben', 'owner')
      const owner = { callerIsOwner: true }
      await h.adapter.saveAccess(
        'org-acme',
        'u-ama',
        { orgRole: 'admin', projects: [], workspaces: [] },
        'u-ben',
        owner,
      )
      expect(await status('inv-ama')).toBe('pending')
      // Admin to member does not; neither does a removal.
      await h.adapter.saveAccess(
        'org-acme',
        'u-ama',
        { orgRole: 'member', projects: [], workspaces: [] },
        'u-ben',
        owner,
      )
      expect(await status('inv-ama')).toBe('canceled')
      await h.adapter.setOrgRole('org-acme', 'u-ama', 'owner')
      await h.adapter.removeOrgMember('org-acme', 'u-ben', owner)
      expect(await status('inv-ben')).toBe('canceled')
    })

    it('takes any number of ids as one parameter', async () => {
      const many = ['p-101', ...Array.from({ length: 149 }, (_, i) => `p-nope-${i}`)]
      expect(
        await h.adapter.checkInOrganization('org-acme', {
          projectIds: many,
          workspaceIds: ['ws-sales', ...many],
          userIds: many,
        }),
      ).toEqual({ role: null, name: null, users: 0, projects: 1, workspaces: 1 })
    })

    it('removes someone from the organization with every row of theirs in it, as one unit', async () => {
      await h.adapter.removeOrgMember('org-acme', 'u-dan', { callerIsOwner: true })
      expect(await h.memberRows('u-dan')).toEqual([])
      expect(await h.count('project_members', "user_id = 'u-dan'")).toBe(0)
      // The only owner stays, and so do their rows.
      await h.db.insert(h.schema.projectMembers).values({
        projectId: 'p-202',
        userId: 'u-ama',
        role: 'admin',
        createdBy: null,
        createdAt: T0,
      })
      await h.adapter.removeOrgMember('org-acme', 'u-ama', { callerIsOwner: true })
      expect(await h.adapter.getOrgRole('org-acme', 'u-ama')).toBe('owner')
      expect(await h.count('project_members', "user_id = 'u-ama'")).toBe(1)
    })
  })

  describe('a workspace’s own grants', () => {
    it('adds someone from the organization with a role that counts above the project’s', async () => {
      const fay = await h.adapter.addWorkspaceMember({
        workspaceId: 'ws-sales',
        userId: 'u-fay',
        role: 'viewer',
        createdBy: 'u-ama',
      })
      expect(fay).toMatchObject({
        workspaceId: 'ws-sales',
        userId: 'u-fay',
        role: 'viewer',
        personName: 'Fay Lund',
      })
      // Already in.
      expect(
        await h.adapter.addWorkspaceMember({
          workspaceId: 'ws-sales',
          userId: 'u-fay',
          role: 'editor',
          createdBy: 'u-ama',
        }),
      ).toBeNull()
      // Dan is a project member (Editor everywhere): a Viewer or Editor grant does nothing.
      expect(
        await h.adapter.addWorkspaceMember({
          workspaceId: 'ws-sales',
          userId: 'u-dan',
          role: 'editor',
          createdBy: 'u-ama',
        }),
      ).toBeNull()
      expect(
        await h.adapter.addWorkspaceMember({
          workspaceId: 'ws-sales',
          userId: 'u-dan',
          role: 'admin',
          createdBy: 'u-ama',
        }),
      ).toMatchObject({ role: 'admin' })
      // Outside the organization.
      expect(
        await h.adapter.addWorkspaceMember({
          workspaceId: 'ws-sales',
          userId: 'u-cleo',
          role: 'viewer',
          createdBy: 'u-ama',
        }),
      ).toBeNull()
      expect(await h.adapter.getGrantRows('ws-sales', 'u-cleo')).toEqual({
        orgRole: null,
        projectGrant: null,
        workspaceGrant: null,
      })
      expect(await h.adapter.getGrantRows('ws-sales', 'u-dan')).toEqual({
        orgRole: 'member',
        projectGrant: 'member',
        workspaceGrant: 'admin',
      })
      expect(await h.adapter.getGrantRows('nope', 'u-dan')).toBeNull()
    })

    it('changes a grant only to a role that counts, and removes one', async () => {
      expect(await h.adapter.setWorkspaceGrant('ws-sales', 'u-eve', 'editor')).toMatchObject({
        role: 'editor',
        personName: 'Eve Park',
        changed: true,
      })
      // The same role again is no change (B7 logs real changes only).
      expect(await h.adapter.setWorkspaceGrant('ws-sales', 'u-eve', 'editor')).toMatchObject({
        role: 'editor',
        changed: false,
      })
      await h.adapter.addWorkspaceMember({
        workspaceId: 'ws-sales',
        userId: 'u-dan',
        role: 'admin',
        createdBy: 'u-ama',
      })
      expect(await h.adapter.setWorkspaceGrant('ws-sales', 'u-dan', 'editor')).toBeNull()
      expect(await h.adapter.setWorkspaceGrant('ws-sales', 'u-fay', 'editor')).toBeNull()
      expect(await h.adapter.removeWorkspaceGrant('ws-sales', 'u-eve')).toEqual({
        role: 'editor',
        personName: 'Eve Park',
      })
      expect(await h.adapter.removeWorkspaceGrant('ws-sales', 'u-eve')).toBeNull()
      expect(await h.adapter.getWorkspaceIfMember('u-eve', { id: 'ws-sales' })).toBeNull()
    })
  })

  describe('creating with people', () => {
    it('makes a project’s creator its admin unless they run the organization', async () => {
      await h.adapter.createProject({
        id: 'p-dan',
        organizationId: 'org-acme',
        name: 'Dan’s',
        slug: 'dans',
        defaultWorkspaceId: 'ws-dan',
        createdBy: 'u-dan',
      })
      expect(
        await h.count(
          'project_members',
          "project_id = 'p-dan' AND user_id = 'u-dan' AND role = 'admin'",
        ),
      ).toBe(1)
      await h.adapter.createProject({
        id: 'p-ama',
        organizationId: 'org-acme',
        name: 'Ama’s',
        slug: 'amas',
        defaultWorkspaceId: 'ws-ama',
        createdBy: 'u-ama',
      })
      expect(await h.count('project_members', "project_id = 'p-ama'")).toBe(0)
    })

    it('writes a workspace and its first members as one unit, skipping people outside the org', async () => {
      const created = await h.adapter.createWorkspace(
        { id: 'ws-new', projectId: 'p-101', name: 'New', slug: 'new', createdBy: 'u-ama' },
        [
          { userId: 'u-fay', role: 'editor' },
          { userId: 'u-cleo', role: 'editor' },
        ],
      )
      expect(created!.slug).toBe('new')
      expect(await h.count('workspace_members', "workspace_id = 'ws-new'")).toBe(1)
      expect(await h.adapter.getWorkspaceIfMember('u-fay', { id: 'ws-new' })).toMatchObject({
        workspaceGrant: 'editor',
      })
      // Dan is a project member (Editor everywhere): an Editor row adds nothing, an Admin one counts.
      await h.adapter.createWorkspace(
        { id: 'ws-floor', projectId: 'p-101', name: 'Floor', slug: 'floor', createdBy: 'u-ama' },
        [
          { userId: 'u-dan', role: 'editor' },
          { userId: 'u-gus', role: 'admin' },
        ],
      )
      expect(
        await h.count('workspace_members', "workspace_id = 'ws-floor' AND user_id = 'u-dan'"),
      ).toBe(0)
      expect(
        await h.count(
          'workspace_members',
          "workspace_id = 'ws-floor' AND user_id = 'u-gus' AND role = 'admin'",
        ),
      ).toBe(1)
      // A taken slug fails the unit on the unique index; nothing of it is written.
      const error = await h.adapter
        .createWorkspace(
          { id: 'ws-dup', projectId: 'p-101', name: 'Sales', slug: 'sales', createdBy: 'u-ama' },
          [{ userId: 'u-fay', role: 'editor' }],
        )
        .then(
          () => null,
          (e: unknown) => e,
        )
      expect(isUniqueViolation(error)).toBe(true)
      expect(await h.count('workspace_members', "workspace_id = 'ws-dup'")).toBe(0)
    })

    it('moves a project to an organization the mover runs, as one unit, dropping the rows of people not in it', async () => {
      // Cleo runs Globex and is also a plain member of Acme with an Editor grant in Sales.
      await h.db.insert(h.schema.member).values({
        id: 'm-cleo-acme',
        userId: 'u-cleo',
        organizationId: 'org-acme',
        role: 'member',
        createdAt: T0,
      })
      expect(
        await h.adapter.addWorkspaceMember({
          workspaceId: 'ws-sales',
          userId: 'u-cleo',
          role: 'editor',
          createdBy: 'u-ama',
        }),
      ).not.toBeNull()
      // An open invitation into Project 101: its place names a project of the old organization.
      await h.adapter.createInvitations([
        {
          id: 'inv-move',
          organizationId: 'org-acme',
          email: 'hal@example.test',
          role: 'member',
          inviterId: 'u-ama',
          expiresAt: LATER,
          places: [{ id: 'ip-move', projectId: 'p-101', workspaceId: 'ws-sales', role: 'editor' }],
        },
      ])
      // Ama runs Acme but is only a member of Globex: nothing moves.
      await h.adapter.moveProjectToOrganization('p-101', 'org-acme', 'org-globex', 'u-ama')
      expect(await h.count('projects', "id = 'p-101' AND organization_id = 'org-acme'")).toBe(1)
      expect(await h.count('project_members', "project_id = 'p-101'")).toBe(1)
      expect(await h.count('invitation_places', "project_id = 'p-101'")).toBe(1)

      await h.adapter.moveProjectToOrganization('p-101', 'org-acme', 'org-globex', 'u-cleo')
      expect((await h.adapter.getProjectById('p-101'))!.organizationId).toBe('org-globex')
      // Dan, Eve and Gus are not in Globex: their rows go. Cleo's stays, and she now runs the place.
      expect(await h.count('project_members', "project_id = 'p-101'")).toBe(0)
      expect(await h.count('workspace_members', "workspace_id IN ('ws-sales', 'ws-ops')")).toBe(1)
      expect(await h.count('invitation_places', "project_id = 'p-101'")).toBe(0)
      expect(await h.adapter.getWorkspaceIfMember('u-cleo', { id: 'ws-sales' })).toMatchObject({
        orgRole: 'owner',
        workspaceGrant: 'editor',
      })
      expect(await h.adapter.getWorkspaceIfMember('u-dan', { id: 'ws-sales' })).toBeNull()
      // Already Globex's: nothing to move from Acme.
      await h.adapter.moveProjectToOrganization('p-101', 'org-acme', 'org-globex', 'u-cleo')
      expect((await h.adapter.getProjectById('p-101'))!.organizationId).toBe('org-globex')
    })

    it('refuses a move onto a slug the target organization already uses, moving nothing', async () => {
      await h.adapter.setOrgRole('org-globex', 'u-ama', 'admin')
      await h.adapter.createProject({
        id: 'p-app',
        organizationId: 'org-acme',
        name: 'App',
        slug: 'app',
        defaultWorkspaceId: 'ws-app',
        createdBy: 'u-dan',
      })
      const error = await h.adapter
        .moveProjectToOrganization('p-app', 'org-acme', 'org-globex', 'u-ama')
        .then(
          () => null,
          (e: unknown) => e,
        )
      expect(isUniqueViolation(error)).toBe(true)
      expect((await h.adapter.getProjectById('p-app'))!.organizationId).toBe('org-acme')
      expect(await h.count('project_members', "project_id = 'p-app' AND user_id = 'u-dan'")).toBe(1)
    })
  })

  describe('invitations', () => {
    const invite = (
      id: string,
      email: string,
      places: { id: string; projectId: string; workspaceId: string | null; role: string }[],
    ) => ({
      id,
      organizationId: 'org-acme',
      email,
      role: 'member',
      inviterId: 'u-ama',
      expiresAt: LATER,
      places,
    })

    it('checks the places and the addresses before inviting, in one read', async () => {
      await h.adapter.createInvitations([invite('inv-1', 'Hal@example.test', [])])
      expect(
        await h.adapter.invitationChecks('org-acme', {
          projectIds: ['p-101', 'p-g'],
          workspaceIds: ['ws-g'],
          emails: ['dan@acme.test', 'hal@example.test', 'new@example.test'],
          now: NOW,
        }),
      ).toEqual({
        projects: 1,
        workspaces: 0,
        members: ['dan@acme.test'],
        pending: ['hal@example.test'],
      })
      // An expired one is not pending.
      expect(
        await h.adapter.invitationChecks('org-acme', {
          projectIds: [],
          workspaceIds: [],
          emails: ['hal@example.test'],
          now: '2026-12-01T00:00:00.000Z',
        }),
      ).toEqual({ projects: 0, workspaces: 0, members: [], pending: [] })
    })

    it('lists open invitations with places in the viewer’s projects, and one for the page', async () => {
      await h.adapter.createInvitations([
        invite('inv-1', 'hal@example.test', [
          { id: 'ip-1', projectId: 'p-101', workspaceId: 'ws-sales', role: 'editor' },
          { id: 'ip-2', projectId: 'p-202', workspaceId: null, role: 'member' },
          { id: 'ip-3', projectId: 'p-101', workspaceId: 'ws-ops', role: 'viewer' },
        ]),
      ])
      const asAma = await h.adapter.listInvitations('org-acme', 'u-ama', NOW)
      expect(asAma).toHaveLength(1)
      expect(asAma[0]).toMatchObject({
        email: 'hal@example.test',
        role: 'member',
        inviter: { id: 'u-ama', name: 'Ama Mensah' },
        askedForNewAt: null,
      })
      expect(asAma[0]!.places.map((p) => [p.projectSlug, p.workspaceSlug, p.role])).toEqual([
        ['project-101', 'ops', 'viewer'],
        ['project-101', 'sales', 'editor'],
        ['project-202', null, 'member'],
      ])
      // Eve can open Sales only: the Ops place is not named to her, nor Project 202's.
      const asEve = await h.adapter.listInvitations('org-acme', 'u-eve', NOW)
      expect(asEve[0]!.places.map((p) => [p.projectSlug, p.workspaceSlug])).toEqual([
        ['project-101', 'sales'],
      ])
      // Dan is in Project 101 project-wide: both its places, not Project 202's.
      const asDan = await h.adapter.listInvitations('org-acme', 'u-dan', NOW)
      expect(asDan[0]!.places.map((p) => p.workspaceSlug)).toEqual(['ops', 'sales'])
      expect(
        await h.adapter.listInvitations('org-acme', 'u-ama', '2026-12-01T00:00:00.000Z'),
      ).toEqual([])

      const view = await h.adapter.getInvitation('inv-1')
      expect(view).toMatchObject({
        invitation: { id: 'inv-1', status: 'pending', expiresAt: LATER },
        org: { slug: 'acme', name: 'Acme' },
        inviter: { name: 'Ama Mensah', email: 'ama@acme.test' },
      })
      expect(view!.places).toHaveLength(3)
      expect(await h.adapter.getInvitation('nope')).toBeNull()
    })

    it('accepts as one unit: the member row, the places as grants, the status', async () => {
      await h.adapter.createInvitations([
        invite('inv-1', 'hal@example.test', [
          { id: 'ip-1', projectId: 'p-101', workspaceId: 'ws-sales', role: 'editor' },
          { id: 'ip-2', projectId: 'p-202', workspaceId: null, role: 'admin' },
        ]),
      ])
      await h.adapter.acceptInvitation({
        invitationId: 'inv-1',
        userId: 'u-hal',
        memberId: 'm-hal',
        now: NOW,
      })
      expect(await h.memberRows('u-hal')).toEqual([{ organizationId: 'org-acme', role: 'member' }])
      expect(await h.adapter.getWorkspaceIfMember('u-hal', { id: 'ws-sales' })).toMatchObject({
        workspaceGrant: 'editor',
      })
      expect(await h.adapter.getProjectIfMember('u-hal', { id: 'p-202' })).toMatchObject({
        projectGrant: 'admin',
      })
      expect((await h.adapter.getInvitation('inv-1'))!.invitation.status).toBe('accepted')
      // Accepting again changes nothing: no second member row, status untouched.
      await h.adapter.acceptInvitation({
        invitationId: 'inv-1',
        userId: 'u-hal',
        memberId: 'm-hal-2',
        now: NOW,
      })
      expect(await h.memberRows('u-hal')).toHaveLength(1)

      // Someone already in the org accepting a second invite keeps one row and gets the places.
      await h.adapter.createInvitations([
        invite('inv-2', 'eve@acme.test', [
          { id: 'ip-3', projectId: 'p-101', workspaceId: 'ws-sales', role: 'admin' },
        ]),
      ])
      await h.adapter.acceptInvitation({
        invitationId: 'inv-2',
        userId: 'u-eve',
        memberId: 'm-eve-2',
        now: NOW,
      })
      expect(await h.memberRows('u-eve')).toHaveLength(1)
      expect(await h.adapter.getWorkspaceIfMember('u-eve', { id: 'ws-sales' })).toMatchObject({
        workspaceGrant: 'admin',
      })
    })

    it('accepts nothing from an expired, cancelled or foreign-placed invitation, and only places that count', async () => {
      await h.adapter.createInvitations([
        {
          ...invite('inv-late', 'hal@example.test', [
            { id: 'ip-l', projectId: 'p-202', workspaceId: null, role: 'admin' },
          ]),
          expiresAt: T0,
        },
        invite('inv-gone', 'hal@example.test', [
          { id: 'ip-g', projectId: 'p-202', workspaceId: null, role: 'admin' },
        ]),
        invite('inv-mixed', 'hal@example.test', [
          { id: 'ip-m1', projectId: 'p-101', workspaceId: null, role: 'member' },
          // Counts no higher than the project row above: skipped.
          { id: 'ip-m2', projectId: 'p-101', workspaceId: 'ws-sales', role: 'viewer' },
          { id: 'ip-m3', projectId: 'p-101', workspaceId: 'ws-ops', role: 'admin' },
          // Project 202 moves to Globex before the accept: the place is a foreign one now.
          { id: 'ip-m4', projectId: 'p-202', workspaceId: null, role: 'admin' },
        ]),
      ])
      await h.adapter.acceptInvitation({
        invitationId: 'inv-late',
        userId: 'u-hal',
        memberId: 'm-hal-l',
        now: NOW,
      })
      expect(await h.memberRows('u-hal')).toEqual([])
      expect(await h.adapter.cancelInvitation('inv-gone', 'org-acme')).toEqual(expect.any(String))
      await h.adapter.acceptInvitation({
        invitationId: 'inv-gone',
        userId: 'u-hal',
        memberId: 'm-hal-g',
        now: NOW,
      })
      expect(await h.memberRows('u-hal')).toEqual([])
      expect((await h.adapter.getInvitation('inv-gone'))!.invitation.status).toBe('canceled')

      await h.db
        .update(h.schema.projects)
        .set({ organizationId: 'org-globex' })
        .where(eq(h.schema.projects.id, 'p-202'))
      await h.adapter.acceptInvitation({
        invitationId: 'inv-mixed',
        userId: 'u-hal',
        memberId: 'm-hal-m',
        now: NOW,
      })
      expect(await h.memberRows('u-hal')).toEqual([{ organizationId: 'org-acme', role: 'member' }])
      expect(
        await h.count(
          'project_members',
          "user_id = 'u-hal' AND project_id = 'p-101' AND role = 'member'",
        ),
      ).toBe(1)
      expect(await h.count('project_members', "user_id = 'u-hal' AND project_id = 'p-202'")).toBe(0)
      expect(
        await h.count('workspace_members', "user_id = 'u-hal' AND workspace_id = 'ws-sales'"),
      ).toBe(0)
      expect(
        await h.count(
          'workspace_members',
          "user_id = 'u-hal' AND workspace_id = 'ws-ops' AND role = 'admin'",
        ),
      ).toBe(1)
      expect((await h.adapter.getInvitation('inv-mixed'))!.invitation.status).toBe('accepted')
    })

    it('moves between statuses only from the one expected, resends, and records one ask', async () => {
      await h.adapter.createInvitations([invite('inv-1', 'hal@example.test', [])])
      expect(await h.adapter.setInvitationStatus('inv-1', 'pending', 'rejected')).toBe(true)
      expect(await h.adapter.setInvitationStatus('inv-1', 'pending', 'canceled')).toBe(false)
      expect(await h.adapter.setInvitationStatus('inv-1', 'rejected', 'pending')).toBe(true)
      expect(await h.adapter.askForNewInvitation('inv-1', NOW)).toBe(true)
      expect(await h.adapter.askForNewInvitation('inv-1', NOW)).toBe(false)
      expect((await h.adapter.getInvitation('inv-1'))!.invitation.askedForNewAt).toBe(NOW)
      // Sent too recently (it expires later than a send at the floor would): refused; past the floor: resent.
      expect(
        await h.adapter.resendInvitation(
          'inv-1',
          '2026-11-11T00:00:00.000Z',
          '2026-11-04T11:00:00.000Z',
        ),
      ).toBe(false)
      expect(await h.adapter.resendInvitation('inv-1', '2026-11-11T00:00:00.000Z', LATER)).toBe(
        true,
      )
      const after = (await h.adapter.getInvitation('inv-1'))!.invitation
      expect(after.expiresAt).toBe('2026-11-11T00:00:00.000Z')
      expect(after.askedForNewAt).toBeNull()
      expect(await h.adapter.cancelInvitation('inv-1', 'org-globex')).toBeNull()
      expect(await h.adapter.cancelInvitation('inv-1', 'org-acme')).toEqual(expect.any(String))
      expect(await h.adapter.cancelInvitation('inv-1', 'org-acme')).toBeNull()
      expect(await h.adapter.resendInvitation('inv-1', LATER, LATER)).toBe(false)
      // A declined one can be cancelled too: it stops waiting for an undo.
      await h.adapter.createInvitations([invite('inv-2', 'new@example.test', [])])
      expect(await h.adapter.setInvitationStatus('inv-2', 'pending', 'rejected')).toBe(true)
      expect(await h.adapter.cancelInvitation('inv-2', 'org-acme')).toEqual(expect.any(String))
    })

    it('writes many invitations at once, a few rows per statement', async () => {
      await h.adapter.createInvitations(
        Array.from({ length: 12 }, (_, i) =>
          invite(`inv-${i}`, `person-${i}@example.test`, [
            { id: `ip-${i}`, projectId: 'p-101', workspaceId: 'ws-sales', role: 'viewer' },
          ]),
        ),
      )
      const rows = await h.adapter.listInvitations('org-acme', 'u-ama', NOW)
      expect(rows).toHaveLength(12)
      expect(rows.every((r) => r.places.length === 1)).toBe(true)
    })

    it('lists the open invitations waiting for an address', async () => {
      await h.adapter.createInvitations([
        invite('inv-1', 'HAL@example.test', []),
        {
          ...invite('inv-2', 'hal@example.test', []),
          organizationId: 'org-globex',
          inviterId: 'u-cleo',
          expiresAt: T0,
        },
      ])
      const mine = await h.adapter.listInvitationsForEmail('hal@Example.test', NOW)
      expect(mine.map((i) => [i.id, i.org.slug, i.inviterName, i.role])).toEqual([
        ['inv-1', 'acme', 'Ama Mensah', 'member'],
      ])
      expect(await h.adapter.listInvitationsForEmail('nobody@example.test', NOW)).toEqual([])
    })
  })

  describe('access requests', () => {
    it('addresses a request to the workspace’s first admin, once per person', async () => {
      const created = await h.adapter.createAccessRequest({
        id: 'req-1',
        workspaceId: 'ws-sales',
        userId: 'u-eve',
        now: NOW,
      })
      expect(created).toMatchObject({
        created: true,
        request: {
          id: 'req-1',
          from: { id: 'u-eve', name: 'Eve Park' },
          to: { id: 'u-ama', name: 'Ama Mensah' },
          status: 'pending',
        },
      })
      expect(await h.adapter.getOwnAccessRequest('ws-sales', 'u-eve')).toMatchObject({
        id: 'req-1',
      })
      expect(await h.adapter.getOwnAccessRequest('ws-ops', 'u-eve')).toBeNull()
      // Cleo alone runs Globex: nobody else can be asked.
      expect(
        await h.adapter.createAccessRequest({
          id: 'req-2',
          workspaceId: 'ws-g',
          userId: 'u-cleo',
          now: NOW,
        }),
      ).toBeNull()
      // Asking again answers the open one; the index behind the insert's guard allows no second.
      expect(
        await h.adapter.createAccessRequest({
          id: 'req-3',
          workspaceId: 'ws-sales',
          userId: 'u-eve',
          now: NOW,
        }),
      ).toMatchObject({ created: false, request: { id: 'req-1' } })
      const error = await h.db
        .insert(h.schema.accessRequests)
        .values({
          id: 'req-4',
          workspaceId: 'ws-sales',
          userId: 'u-eve',
          toUserId: 'u-ama',
          status: 'pending',
          alreadyEditing: false,
          createdAt: NOW,
        })
        .then(
          () => null,
          (e: unknown) => e,
        )
      expect(isUniqueViolation(error)).toBe(true)
    })

    it('decides a request, granting Editor in the same unit when approved', async () => {
      await h.adapter.createAccessRequest({
        id: 'req-1',
        workspaceId: 'ws-sales',
        userId: 'u-eve',
        now: NOW,
      })
      const decision = await h.adapter.getAccessRequestForDecision('req-1', 'u-gus')
      expect(decision).toMatchObject({
        request: { id: 'req-1', status: 'pending' },
        workspace: {
          id: 'ws-sales',
          name: 'Sales',
          projectId: 'p-101',
          organizationId: 'org-acme',
        },
        asker: {
          name: 'Eve Park',
          orgRole: 'member',
          projectGrant: null,
          workspaceGrant: 'viewer',
        },
        // Gus holds nothing in Sales: the route answers 404 from this alone.
        decider: { orgRole: 'member', projectGrant: null, workspaceGrant: null },
      })
      expect((await h.adapter.getAccessRequestForDecision('req-1', 'u-ama'))!.decider).toEqual({
        orgRole: 'owner',
        projectGrant: null,
        workspaceGrant: null,
      })
      await h.adapter.decideAccessRequest({
        id: 'req-1',
        status: 'approved',
        decidedBy: 'u-ama',
        now: NOW,
        alreadyEditing: false,
        grant: { workspaceId: 'ws-sales', userId: 'u-eve' },
      })
      expect(await h.adapter.getWorkspaceIfMember('u-eve', { id: 'ws-sales' })).toMatchObject({
        workspaceGrant: 'editor',
      })
      expect(
        (await h.adapter.getAccessRequestForDecision('req-1', 'u-ama'))!.request,
      ).toMatchObject({
        status: 'approved',
        decidedBy: 'u-ama',
      })
      expect(await h.adapter.getOwnAccessRequest('ws-sales', 'u-eve')).toBeNull()
      expect(await h.adapter.getAccessRequestForDecision('nope', 'u-ama')).toBeNull()
    })

    it('never lowers or re-adds someone an approval finds changed meanwhile', async () => {
      await h.adapter.createAccessRequest({
        id: 'req-up',
        workspaceId: 'ws-sales',
        userId: 'u-eve',
        now: NOW,
      })
      await h.adapter.setWorkspaceGrant('ws-sales', 'u-eve', 'admin')
      await h.adapter.decideAccessRequest({
        id: 'req-up',
        status: 'approved',
        decidedBy: 'u-ama',
        now: NOW,
        alreadyEditing: false,
        grant: { workspaceId: 'ws-sales', userId: 'u-eve' },
      })
      expect(await h.adapter.getGrantRows('ws-sales', 'u-eve')).toMatchObject({
        workspaceGrant: 'admin',
      })
      await h.adapter.createAccessRequest({
        id: 'req-out',
        workspaceId: 'ws-ops',
        userId: 'u-gus',
        now: NOW,
      })
      await h.adapter.removeWorkspaceGrant('ws-ops', 'u-gus')
      await h.adapter.decideAccessRequest({
        id: 'req-out',
        status: 'approved',
        decidedBy: 'u-ama',
        now: NOW,
        alreadyEditing: false,
        grant: { workspaceId: 'ws-ops', userId: 'u-gus' },
      })
      expect(await h.adapter.getGrantRows('ws-ops', 'u-gus')).toMatchObject({
        workspaceGrant: null,
      })
      expect(
        (await h.adapter.getAccessRequestForDecision('req-out', 'u-ama'))!.request.status,
      ).toBe('approved')
    })
  })

  it('reads a key with its creator’s project standing', async () => {
    await h.adapter.createApiKey({
      level: 'project' as const,
      permissions: '{"workflows":["read"]}',
      id: 'k-eve',
      organizationId: 'org-acme',
      projectId: 'p-101',
      createdBy: 'u-eve',
      name: 'Eve’s',
      keyHash: 'hash-eve',
      keyPrefix: 'ask_eve',
      scopes: '["read"]',
    })
    const auth = await h.adapter.getApiKeyAuthByHash('hash-eve')
    expect(auth).toMatchObject({
      createdByIsMember: true,
      createdByRole: 'member',
      createdByProjectGrant: null,
      createdByHasWorkspaceGrant: true,
    })
    await h.adapter.removeWorkspaceGrant('ws-sales', 'u-eve')
    expect(await h.adapter.getApiKeyAuthByHash('hash-eve')).toMatchObject({
      createdByHasWorkspaceGrant: false,
    })
  })

  describe('keys at three levels', () => {
    const key = (
      id: string,
      createdBy: string,
      at:
        | { level: 'organization' }
        | { level: 'project'; projectId: string }
        | { level: 'workspace'; projectId: string; workspaceId: string },
      permissions = '{"workflows":["read"]}',
    ) =>
      h.adapter.createApiKey({
        id,
        organizationId: 'org-acme',
        createdBy,
        name: id,
        keyHash: `hash-${id}`,
        keyPrefix: 'ask_abcd',
        keySuffix: 'a71d',
        scopes: '["read"]',
        permissions,
        ...at,
      })

    it('mints a workspace key only in a workspace of that project its creator can open', async () => {
      const sales = await key('k-sales', 'u-eve', {
        level: 'workspace',
        projectId: 'p-101',
        workspaceId: 'ws-sales',
      })
      expect(sales).toMatchObject({
        projectId: 'p-101',
        workspaceId: 'ws-sales',
        organizationId: null,
        keySuffix: 'a71d',
      })
      // Ops is hidden from Eve; Default is another project's.
      expect(
        await key('k-ops', 'u-eve', {
          level: 'workspace',
          projectId: 'p-101',
          workspaceId: 'ws-ops',
        }),
      ).toBeNull()
      expect(
        await key('k-202', 'u-ama', {
          level: 'workspace',
          projectId: 'p-101',
          workspaceId: 'ws-202',
        }),
      ).toBeNull()
      expect(await h.adapter.getApiKeyById('k-ops')).toBeNull()
      const auth = await h.adapter.getApiKeyAuthByHash('hash-k-sales')
      expect(auth).toMatchObject({
        workspaceId: 'ws-sales',
        permissions: '{"workflows":["read"]}',
        resolvedOrganizationId: 'org-acme',
        createdByCanOpenWorkspace: true,
      })
      // Sales taken away: the same read says the creator cannot open the
      // key's workspace any more, and auth refuses the key on that.
      await h.adapter.removeWorkspaceGrant('ws-sales', 'u-eve')
      expect(await h.adapter.getApiKeyAuthByHash('hash-k-sales')).toMatchObject({
        createdByCanOpenWorkspace: false,
      })
    })

    it('lists a workspace’s own keys with the live project keys that reach it, and counts keys per workspace the viewer can open', async () => {
      await key('k-own', 'u-ama', {
        level: 'workspace',
        projectId: 'p-101',
        workspaceId: 'ws-sales',
      })
      await key('k-ops', 'u-ama', { level: 'workspace', projectId: 'p-101', workspaceId: 'ws-ops' })
      await key('k-proj', 'u-ama', { level: 'project', projectId: 'p-101' })
      await h.adapter.createApiKey({
        id: 'k-stale',
        level: 'project',
        organizationId: 'org-acme',
        projectId: 'p-101',
        createdBy: 'u-ama',
        name: 'stale',
        keyHash: 'hash-stale',
        keyPrefix: 'ask_stal',
        scopes: '["read"]',
        permissions: '{"workflows":["read"]}',
        expiresAt: T0,
      })
      const sales = await h.adapter.listApiKeysByWorkspace('ws-sales', NOW)
      expect(sales.own.map((k) => [k.id, k.workspace?.slug, k.createdByName])).toEqual([
        ['k-own', 'sales', 'Ama Mensah'],
      ])
      // An expired project key no longer reaches anything, so it is not listed as reaching this one.
      expect(sales.inherited.map((k) => k.id)).toEqual(['k-proj'])
      expect(
        (await h.adapter.listApiKeysByProject('org-acme', 'p-101')).data.map((k) => k.id),
      ).toEqual(['k-stale', 'k-proj'])
      expect(await h.adapter.countApiKeysByWorkspace('p-101', 'u-ama')).toEqual([
        { workspace: { id: 'ws-sales', slug: 'sales', name: 'Sales', colour: 'blue' }, count: 1 },
        { workspace: { id: 'ws-ops', slug: 'ops', name: 'Ops', colour: 'blue' }, count: 1 },
      ])
      // Eve opens Sales only.
      expect(
        (await h.adapter.countApiKeysByWorkspace('p-101', 'u-eve')).map((c) => c.workspace.slug),
      ).toEqual(['sales'])
    })

    it('revokes a key only at its own level’s place', async () => {
      await key('k-own', 'u-ama', {
        level: 'workspace',
        projectId: 'p-101',
        workspaceId: 'ws-sales',
      })
      await key('k-proj', 'u-ama', { level: 'project', projectId: 'p-101' })
      await key('k-org', 'u-ama', { level: 'organization' }, '{"projects":["read"]}')
      expect(
        await h.adapter.revokeApiKey('k-org', { level: 'project', projectId: 'p-101' }),
      ).toBeNull()
      expect(
        await h.adapter.revokeApiKey('k-proj', { level: 'workspace', workspaceId: 'ws-sales' }),
      ).toBeNull()
      expect(
        await h.adapter.revokeApiKey('k-own', { level: 'project', projectId: 'p-101' }),
      ).toBeNull()
      expect(
        (await h.adapter.revokeApiKey('k-own', { level: 'workspace', workspaceId: 'ws-sales' }))
          ?.revokedAt,
      ).not.toBeNull()
      expect(
        (await h.adapter.revokeApiKey('k-proj', { level: 'project', projectId: 'p-101' }))
          ?.revokedAt,
      ).not.toBeNull()
      expect(
        (
          await h.adapter.revokeApiKey('k-org', {
            level: 'organization',
            organizationId: 'org-acme',
          })
        )?.revokedAt,
      ).not.toBeNull()
      expect(
        await h.adapter.revokeApiKey('k-org', {
          level: 'organization',
          organizationId: 'org-acme',
        }),
      ).toBeNull()
      expect((await h.adapter.listApiKeysByWorkspace('ws-sales', NOW)).own).toEqual([])
    })

    it('takes a workspace’s keys with it when the workspace goes, and keeps both for the last workspace', async () => {
      await key('k-own', 'u-ama', {
        level: 'workspace',
        projectId: 'p-101',
        workspaceId: 'ws-sales',
      })
      await key('k-202', 'u-ama', { level: 'workspace', projectId: 'p-202', workspaceId: 'ws-202' })
      expect(await h.adapter.deleteWorkspaceUnlessBlocked('ws-202')).toBe(false)
      expect(await h.adapter.getApiKeyById('k-202')).not.toBeNull()
      // One statement, its answer from the rows it removed: a workspace that
      // never existed is not "deleted".
      expect(await h.adapter.deleteWorkspaceUnlessBlocked('ws-nowhere')).toBe(false)
      // The keys go by the column's cascade on both dialects (the sqlite
      // migration once added the column without one).
      expect(await h.adapter.deleteWorkspaceUnlessBlocked('ws-sales')).toBe(true)
      expect(await h.adapter.getApiKeyById('k-own')).toBeNull()
    })
  })

  it('lists a project’s keys and variables only to someone who can open it', async () => {
    await h.adapter.createApiKey({
      level: 'project' as const,
      permissions: '{"workflows":["read"]}',
      id: 'k-101',
      organizationId: 'org-acme',
      projectId: 'p-101',
      createdBy: 'u-ama',
      name: 'Project key',
      keyHash: 'hash-101',
      keyPrefix: 'ask_101',
      scopes: '["read"]',
    })
    await h.adapter.createEnvVar({
      id: 'v-101',
      place: { level: 'project', organizationId: 'org-acme', projectId: 'p-101' },
      createdBy: 'u-ama',
      name: 'API_URL',
      value: 'x',
      isSecret: false,
    })
    expect(
      (await h.adapter.listApiKeysByProject('org-acme', 'p-101', undefined, 'u-eve')).data,
    ).toHaveLength(1)
    expect(
      (await h.adapter.listApiKeysByProject('org-acme', 'p-101', undefined, 'u-fay')).data,
    ).toEqual([])
    // Variables are addressed at their level (B4): the scope read that resolves
    // the address is what hides a project; the list itself is the project's own.
    expect((await h.adapter.listEnvVarsByProject('org-acme', 'p-101')).data).toHaveLength(1)
    // The organization's list names a project key only to someone who can open its project; org keys always.
    await h.adapter.createApiKey({
      level: 'organization' as const,
      permissions: '{"projects":["read"]}',
      id: 'k-org',
      organizationId: 'org-acme',
      createdBy: 'u-ama',
      name: 'Org key',
      keyHash: 'hash-org',
      keyPrefix: 'ask_org',
      scopes: '["read"]',
    })
    // The organization's list is its own keys; a project's keys are listed at the project.
    const orgKeys = (await h.adapter.listApiKeysByOrganization('org-acme')).data
    expect(orgKeys.map((k) => [k.id, k.createdByName])).toEqual([['k-org', 'Ama Mensah']])
    // Nor is a key or variable made in a project its author cannot open.
    expect(
      await h.adapter.createApiKey({
        level: 'project' as const,
        permissions: '{"workflows":["read"]}',
        id: 'k-hidden',
        organizationId: 'org-acme',
        projectId: 'p-202',
        createdBy: 'u-eve',
        name: 'x',
        keyHash: 'hash-h',
        keyPrefix: 'ask_h',
        scopes: '["read"]',
      }),
    ).toBeNull()
    expect(
      await h.adapter.createEnvVar({
        id: 'v-hidden',
        place: { level: 'project', organizationId: 'org-acme', projectId: 'p-202' },
        createdBy: 'u-eve',
        name: 'X',
        value: 'x',
        isSecret: false,
      }),
    ).toBeNull()
  })
})
