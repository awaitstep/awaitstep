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
import { sql } from 'drizzle-orm'
import { DrizzleDatabaseAdapter } from '../adapters/index.js'
import * as sqliteSchema from '../schema/sqlite/index.js'
import * as pgSchema from '../schema/pg/index.js'
import { decodeCursor, encodeCursor } from '../pagination.js'
import { isUniqueViolation } from '../db-errors.js'

// The scope, workspace and run queries, run through the real migrations on
// both dialects: they lean on each dialect's JSON aggregates and window
// functions, so the suite is one and the database is the parameter.

const SQLITE_FOLDER = fileURLToPath(new URL('../../drizzle/sqlite', import.meta.url))
const PG_FOLDER = fileURLToPath(new URL('../../drizzle/pg', import.meta.url))

const T0 = '2026-10-20T00:00:00.000Z'
const NOW = new Date('2026-10-28T12:00:00.000Z')
const RECENT = '2026-10-28T06:00:00.000Z'
const OLD = '2026-10-01T00:00:00.000Z'

interface Harness {
  adapter: DrizzleDatabaseAdapter
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  schema: any
  count(table: string, where?: string): Promise<number>
}

async function sqliteHarness(): Promise<Harness> {
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

async function pgHarness(): Promise<Harness> {
  const client = new PGlite()
  const db = drizzlePg(client, { schema: pgSchema })
  await migratePg(db, { migrationsFolder: PG_FOLDER })
  return {
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

// Two orgs. Ama owns Acme and is a member of Globex; Ben is Acme's admin;
// Cleo is in Globex only. Acme has two projects; Project 101 has Sales (with
// four items and some runs) and Ops (empty). Project 202 has Default only.
async function seed(h: Harness) {
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

describe.each([
  ['sqlite', sqliteHarness],
  ['pg', pgHarness],
])('workspaces on %s', (_dialect, create) => {
  let h: Harness

  beforeEach(async () => {
    h = await create()
    await seed(h)
  })

  describe('getScopeBySlugs', () => {
    it('resolves the org alone, with its members and counts', async () => {
      const scope = await h.adapter.getScopeBySlugs('u-ama', { org: 'acme' })
      expect(scope).not.toBeNull()
      expect(scope!.org).toMatchObject({
        id: 'org-acme',
        slug: 'acme',
        name: 'Acme',
        viewerRole: 'owner',
        projectCount: 2,
        memberCount: 2,
      })
      expect(scope!.org.members.map((m) => [m.name, m.role])).toEqual([
        ['Ama Mensah', 'owner'],
        ['Ben Okoro', 'admin'],
      ])
      expect(scope!.project).toBeNull()
      expect(scope!.workspace).toBeNull()
    })

    it('resolves a project with its workspaces and health', async () => {
      const scope = await h.adapter.getScopeBySlugs('u-ama', {
        org: 'acme',
        project: 'project-101',
      })
      expect(scope!.project).toMatchObject({ id: 'p-101', slug: 'project-101' })
      expect(scope!.project!.workspaces).toEqual([
        { id: 'ws-sales', slug: 'sales', name: 'Sales', colour: 'blue' },
        { id: 'ws-ops', slug: 'ops', name: 'Ops', colour: 'amber' },
      ])
      // Three workflows, one deployed (Lead enrichment: latest deployment succeeded; CRM
      // sync's failed), one failing (CRM sync's latest run errored).
      expect(scope!.project!.health).toEqual({
        workflows: 3,
        deployed: 1,
        failing: 1,
        lastRunAt: '2026-10-28T07:00:00.000Z',
      })
      expect(scope!.project!.members).toHaveLength(2)
      expect(scope!.workspace).toBeNull()
    })

    it('resolves a workspace with its counts, creator and siblings', async () => {
      const scope = await h.adapter.getScopeBySlugs(
        'u-ben',
        { org: 'acme', project: 'project-101', workspace: 'sales' },
        NOW,
      )
      expect(scope!.org.viewerRole).toBe('admin')
      expect(scope!.workspace).toMatchObject({
        id: 'ws-sales',
        slug: 'sales',
        colour: 'blue',
        createdByName: 'Ama Mensah',
        lockedByName: null,
        siblings: 2,
      })
      // r-1 is older than 24h; r-2..r-6 are within.
      expect(scope!.workspace!.counts).toEqual({
        workflows: 3,
        deployed: 1,
        functions: 1,
        runs24h: 5,
        failing: 1,
        lastRunAt: '2026-10-28T07:00:00.000Z',
      })
    })

    it('leaves the deepest level null when its slug matches nothing', async () => {
      const missingWorkspace = await h.adapter.getScopeBySlugs('u-ama', {
        org: 'acme',
        project: 'project-101',
        workspace: 'nope',
      })
      expect(missingWorkspace!.project).not.toBeNull()
      expect(missingWorkspace!.workspace).toBeNull()

      const missingProject = await h.adapter.getScopeBySlugs('u-ama', {
        org: 'acme',
        project: 'nope',
        workspace: 'sales',
      })
      expect(missingProject!.org.id).toBe('org-acme')
      expect(missingProject!.project).toBeNull()
      expect(missingProject!.workspace).toBeNull()
    })

    it('is null for a non-member and for an unknown org alike', async () => {
      expect(await h.adapter.getScopeBySlugs('u-cleo', { org: 'acme' })).toBeNull()
      expect(await h.adapter.getScopeBySlugs('u-ama', { org: 'nope' })).toBeNull()
    })

    it('does not resolve a project through another org', async () => {
      const scope = await h.adapter.getScopeBySlugs('u-ama', {
        org: 'globex',
        project: 'project-101',
      })
      expect(scope!.org.id).toBe('org-globex')
      expect(scope!.project).toBeNull()
    })
  })

  describe('membership lookups', () => {
    it('finds an organization by id or slug for a member only', async () => {
      expect(await h.adapter.getOrganizationIfMember('u-ama', { slug: 'acme' })).toEqual({
        id: 'org-acme',
        slug: 'acme',
        role: 'owner',
      })
      expect(await h.adapter.getOrganizationIfMember('u-ama', { id: 'org-globex' })).toEqual({
        id: 'org-globex',
        slug: 'globex',
        role: 'member',
      })
      expect(await h.adapter.getOrganizationIfMember('u-cleo', { slug: 'acme' })).toBeNull()
    })

    it('finds a project by id or slugs, optionally with a workspace of its own', async () => {
      const byId = await h.adapter.getProjectIfMember('u-ama', { id: 'p-101' })
      expect(byId!.project.slug).toBe('project-101')
      expect(byId!.workspaceId).toBeNull()
      expect(byId!.orgRole).toBe('owner')
      expect(byId!.projectGrant).toBeNull()

      const bySlugs = await h.adapter.getProjectIfMember(
        'u-ama',
        { org: 'acme', slug: 'project-101' },
        { slug: 'ops' },
      )
      expect(bySlugs!.workspaceId).toBe('ws-ops')

      const byWorkspaceId = await h.adapter.getProjectIfMember(
        'u-ama',
        { id: 'p-101' },
        { id: 'ws-sales' },
      )
      expect(byWorkspaceId!.workspaceId).toBe('ws-sales')

      // Another project's workspace, or no membership: nothing at all.
      expect(
        await h.adapter.getProjectIfMember('u-ama', { id: 'p-101' }, { id: 'ws-202' }),
      ).toBeNull()
      expect(await h.adapter.getProjectIfMember('u-cleo', { id: 'p-101' })).toBeNull()
    })

    it('finds a workspace by id or slugs for a member, and within a held project', async () => {
      const ids = { workspaceId: 'ws-sales', projectId: 'p-101', organizationId: 'org-acme' }
      const rows = { projectGrant: null, workspaceGrant: null }
      expect(await h.adapter.getWorkspaceIfMember('u-ama', { id: 'ws-sales' })).toEqual({
        ...ids,
        ...rows,
        orgRole: 'owner',
      })
      expect(
        await h.adapter.getWorkspaceIfMember('u-ben', {
          org: 'acme',
          project: 'project-101',
          workspace: 'sales',
        }),
      ).toEqual({ ...ids, ...rows, orgRole: 'admin' })
      expect(await h.adapter.getWorkspaceIfMember('u-cleo', { id: 'ws-sales' })).toBeNull()

      expect(await h.adapter.getWorkspaceInProject('p-101', { slug: 'sales' })).toEqual(ids)
      expect(await h.adapter.getWorkspaceInProject('p-202', { id: 'ws-sales' })).toBeNull()
    })

    it('lists the orgs a user is in with the projects they can open counted', async () => {
      // Ama is a plain member of Globex with no grant there: its one project is hidden.
      const orgs = await h.adapter.listOrganizationsForMember('u-ama')
      expect(orgs.map((o) => [o.slug, o.viewerRole, o.projectCount, o.memberCount])).toEqual([
        ['acme', 'owner', 2, 2],
        ['globex', 'member', 0, 2],
      ])
    })
  })

  describe('projects', () => {
    it('creates the project and its Default workspace together', async () => {
      const { project, workspace } = await h.adapter.createProject({
        id: 'p-new',
        organizationId: 'org-acme',
        name: 'New',
        slug: 'new',
        defaultWorkspaceId: 'ws-new',
        createdBy: 'u-ama',
      })
      expect(project.slug).toBe('new')
      expect(workspace).toMatchObject({ projectId: 'p-new', slug: 'default', createdBy: 'u-ama' })
      expect(await h.count('workspaces', "project_id = 'p-new'")).toBe(1)
    })

    it('reports a slug another project in the org holds as a unique violation', async () => {
      const dup = {
        id: 'p-dup',
        organizationId: 'org-acme',
        name: 'Dup',
        slug: 'project-101',
        defaultWorkspaceId: 'ws-dup',
      }
      // The driver's error reaches the caller through whatever drizzle wraps it in.
      const error = await h.adapter.createProject(dup).then(
        () => null,
        (e: unknown) => e,
      )
      expect(error).not.toBeNull()
      expect(isUniqueViolation(error)).toBe(true)
      expect(isUniqueViolation(new Error('something else'))).toBe(false)
      expect(await h.count('projects', "id = 'p-dup'")).toBe(0)
      expect(await h.count('workspaces', "id = 'ws-dup'")).toBe(0)
    })

    it('leaves no project row when the workspace insert fails', async () => {
      await expect(
        h.adapter.createProject({
          id: 'p-fail',
          organizationId: 'org-acme',
          name: 'Fail',
          slug: 'fail',
          // Already taken: the second insert hits the primary key.
          defaultWorkspaceId: 'ws-sales',
        }),
      ).rejects.toThrow()
      expect(await h.count('projects', "id = 'p-fail'")).toBe(0)
    })

    it('lists projects with workspaces, health and members', async () => {
      const { data } = await h.adapter.listProjectsByOrganization('org-acme', 'u-ama')
      const p101 = data.find((p) => p.id === 'p-101')!
      expect(p101.workspaces.map((w) => w.slug)).toEqual(['sales', 'ops'])
      expect(p101.health).toEqual({
        workflows: 3,
        deployed: 1,
        failing: 1,
        lastRunAt: '2026-10-28T07:00:00.000Z',
      })
      expect(p101.members.map((m) => m.id)).toEqual(['u-ama', 'u-ben'])
      expect(p101.viewer).toEqual({ orgRole: 'owner', projectGrant: null, workspaceGrant: null })
      const p202 = data.find((p) => p.id === 'p-202')!
      expect(p202.health).toEqual({
        workflows: 1,
        deployed: 0,
        failing: 1,
        lastRunAt: '2026-10-28T08:00:00.000Z',
      })
    })
  })

  describe('workspaces', () => {
    it('lists a project’s workspaces oldest first with counts and people', async () => {
      const list = await h.adapter.listWorkspacesByProject('p-101', 'u-ama')
      expect(list.map((w) => w.slug)).toEqual(['sales', 'ops'])
      expect(list[0]).toMatchObject({
        createdByName: 'Ama Mensah',
        siblings: 2,
        projectName: 'Project 101',
        projectLockedAt: null,
      })
      expect(list[0]!.counts.workflows).toBe(3)
      expect(list[1]!.counts).toEqual({
        workflows: 0,
        deployed: 0,
        functions: 0,
        runs24h: 0,
        failing: 0,
        lastRunAt: null,
      })
      expect(list[1]!.members.map((m) => [m.id, m.orgRole, m.lastActiveAt])).toEqual([
        ['u-ama', 'owner', null],
        ['u-ben', 'admin', null],
      ])
      expect(list[1]!.viewer.orgRole).toBe('owner')
    })

    it('creates, updates and reads a workspace', async () => {
      const created = await h.adapter.createWorkspace({
        id: 'ws-x',
        projectId: 'p-101',
        name: 'Experiments',
        slug: 'experiments',
        colour: 'rose',
        createdBy: 'u-ben',
      })
      expect(created!.colour).toBe('rose')
      const updated = await h.adapter.updateWorkspace('ws-x', { name: 'Labs', slug: 'labs' })
      expect(updated).toMatchObject({ name: 'Labs', slug: 'labs', colour: 'rose' })
      expect(await h.adapter.getWorkspaceById('ws-x')).toMatchObject({ slug: 'labs' })
      expect(await h.adapter.updateWorkspace('nope', { name: 'x' })).toBeNull()
    })

    it('refuses a slug a sibling already uses, on create and on rename', async () => {
      const dup = await h.adapter.createWorkspace({
        id: 'ws-dup',
        projectId: 'p-101',
        name: 'Sales again',
        slug: 'sales',
      })
      expect(dup).toBeNull()
      expect(await h.count('workspaces', "id = 'ws-dup'")).toBe(0)
      // The same slug in another project is fine.
      expect(
        await h.adapter.createWorkspace({
          id: 'ws-s2',
          projectId: 'p-202',
          name: 'S',
          slug: 'sales',
        }),
      ).not.toBeNull()

      expect(await h.adapter.updateWorkspace('ws-ops', { slug: 'sales' })).toBeNull()
      expect(await h.adapter.getWorkspaceById('ws-ops')).toMatchObject({ slug: 'ops' })
      // Keeping its own slug is not a conflict.
      expect(
        await h.adapter.updateWorkspace('ws-ops', { slug: 'ops', name: 'Ops 2' }),
      ).toMatchObject({
        name: 'Ops 2',
      })
    })

    it('refuses to delete a project’s last workspace, and cascades otherwise', async () => {
      expect(await h.adapter.deleteWorkspaceUnlessLast('ws-202')).toBe(false)
      expect(await h.count('workspaces', "id = 'ws-202'")).toBe(1)

      expect(await h.adapter.deleteWorkspaceUnlessLast('ws-sales')).toBe(true)
      expect(await h.count('workflows', "workspace_id = 'ws-sales'")).toBe(0)
      expect(await h.count('workflow_runs', "workflow_id = 'wf-enrich'")).toBe(0)
      // Now Ops is the last one.
      expect(await h.adapter.deleteWorkspaceUnlessLast('ws-ops')).toBe(false)
    })

    it('moves workflows within the project only', async () => {
      const moved = await h.adapter.moveWorkflowsToWorkspace('ws-sales', 'ws-ops', [
        'wf-enrich',
        'wf-202',
        'nope',
      ])
      expect(moved).toEqual(['wf-enrich'])
      expect(await h.count('workflows', "workspace_id = 'ws-ops'")).toBe(1)

      // A target in another project moves nothing.
      expect(await h.adapter.moveWorkflowsToWorkspace('ws-sales', 'ws-202', ['wf-sync'])).toEqual(
        [],
      )
      expect(await h.count('workflows', "workspace_id = 'ws-sales'")).toBe(3)
      expect(await h.adapter.moveWorkflowsToWorkspace('ws-sales', 'ws-ops', [])).toEqual([])
    })
  })

  describe('workflows', () => {
    const data = { id: 'wf-new', projectId: 'p-101', createdBy: 'u-ama', name: 'New' }

    it('lands in the project’s oldest workspace when none is named', async () => {
      const created = await h.adapter.createWorkflow(data)
      expect(created).toMatchObject({ id: 'wf-new', workspaceId: 'ws-sales', kind: 'workflow' })
    })

    it('lands in the named workspace when it is the project’s, else nowhere', async () => {
      const created = await h.adapter.createWorkflow({ ...data, workspaceId: 'ws-ops' })
      expect(created!.workspaceId).toBe('ws-ops')
      expect(
        await h.adapter.createWorkflow({ ...data, id: 'wf-bad', workspaceId: 'ws-202' }),
      ).toBeNull()
      expect(await h.count('workflows', "id = 'wf-bad'")).toBe(0)
    })

    it('moves a workflow to another project and into that project’s oldest workspace', async () => {
      const moved = await h.adapter.moveWorkflowToProject('wf-enrich', 'p-202')
      expect(moved).toMatchObject({ id: 'wf-enrich', projectId: 'p-202', workspaceId: 'ws-202' })
      expect(await h.count('workflows', "workspace_id = 'ws-sales'")).toBe(3)
      // Its runs now count against the new workspace, not the old one.
      const scope = await h.adapter.getScopeBySlugs('u-ama', {
        org: 'acme',
        project: 'project-202',
        workspace: 'default',
      })
      expect(scope!.workspace!.counts.workflows).toBe(2)
      expect(await h.adapter.moveWorkflowToProject('nope', 'p-202')).toBeNull()
    })

    it('lists with status, filtered by workspace and kind, with recent runs and the live version', async () => {
      const all = await h.adapter.listWorkflowsWithStatus('p-101')
      expect(all.data).toHaveLength(4)

      const sales = await h.adapter.listWorkflowsWithStatus('p-101', undefined, {
        workspaceId: 'ws-sales',
        kind: 'workflow',
      })
      expect(sales.data.map((w) => w.name)).toEqual(['Draft', 'CRM sync', 'Lead enrichment'])
      const enrich = sales.data.find((w) => w.id === 'wf-enrich')!
      expect(enrich).toMatchObject({
        workspaceId: 'ws-sales',
        deployStatus: 'success',
        deployedVersion: 2,
        lastRunStatus: 'complete',
      })
      // Newest first, finished runs only.
      expect(enrich.recentRunStatuses).toEqual(['complete', 'errored', 'complete'])
      const draft = sales.data.find((w) => w.id === 'wf-draft')!
      expect(draft).toMatchObject({
        deployStatus: null,
        deployedVersion: null,
        recentRunStatuses: [],
      })

      const functions = await h.adapter.listWorkflowsWithStatus('p-101', undefined, {
        kind: 'script',
      })
      expect(functions.data.map((w) => w.id)).toEqual(['wf-fn'])
    })
  })

  describe('runs', () => {
    it('pages a workspace’s runs newest first with counts over the period and search', async () => {
      const page = await h.adapter.listWorkspaceRuns('ws-sales', {
        since: '2026-10-27T12:00:00.000Z',
      })
      expect(page.data.map((r) => r.id)).toEqual(['r-6', 'r-5', 'r-4', 'r-3', 'r-2'])
      expect(page.data[0]).toMatchObject({ workflowName: 'Webhook relay', kind: 'script' })
      expect(page.counts).toEqual({ all: 5, succeeded: 2, failed: 2, running: 1 })
      expect(page.nextCursor).toBeNull()
    })

    it('keeps the counts when filtering by result, and pages with a cursor', async () => {
      const failed = await h.adapter.listWorkspaceRuns('ws-sales', { result: 'failed', limit: 1 })
      expect(failed.data.map((r) => r.id)).toEqual(['r-5'])
      expect(failed.counts).toEqual({ all: 6, succeeded: 3, failed: 2, running: 1 })
      expect(failed.nextCursor).not.toBeNull()
      expect(decodeCursor(failed.nextCursor!).id).toBe('r-5')

      const next = await h.adapter.listWorkspaceRuns('ws-sales', {
        result: 'failed',
        limit: 1,
        cursor: failed.nextCursor!,
      })
      expect(next.data.map((r) => r.id)).toEqual(['r-2'])
      expect(next.nextCursor).toBeNull()
    })

    it('keeps the counts when the result filter or the cursor matches nothing', async () => {
      // Project 202's only run failed: the "Succeeded" pill still says 1 of 1 failed.
      const none = await h.adapter.listWorkspaceRuns('ws-202', { result: 'succeeded' })
      expect(none.data).toEqual([])
      expect(none.nextCursor).toBeNull()
      expect(none.counts).toEqual({ all: 1, succeeded: 0, failed: 1, running: 0 })

      // A cursor past the last run: an empty page, the counts intact.
      const firstFive = await h.adapter.listWorkspaceRuns('ws-sales', { limit: 5 })
      const lastPage = await h.adapter.listWorkspaceRuns('ws-sales', {
        cursor: firstFive.nextCursor!,
        limit: 5,
      })
      expect(lastPage.data.map((r) => r.id)).toEqual(['r-1'])
      expect(lastPage.nextCursor).toBeNull()
      const beyond = await h.adapter.listWorkspaceRuns('ws-sales', {
        cursor: encodeCursor(lastPage.data[0]!.id, lastPage.data[0]!.createdAt),
        limit: 5,
      })
      expect(beyond.data).toEqual([])
      expect(beyond.counts).toEqual({ all: 6, succeeded: 3, failed: 2, running: 1 })
    })

    it('searches the workflow name and the run id, case-insensitively, literally', async () => {
      const byName = await h.adapter.listWorkspaceRuns('ws-sales', { search: 'crm' })
      expect(byName.data.map((r) => r.id)).toEqual(['r-5', 'r-4'])
      expect(byName.counts.all).toBe(2)
      const byId = await h.adapter.listWorkspaceRuns('ws-sales', { search: 'R-3' })
      expect(byId.data.map((r) => r.id)).toEqual(['r-3'])
      const wildcard = await h.adapter.listWorkspaceRuns('ws-sales', { search: '%' })
      expect(wildcard.data).toEqual([])
      expect(wildcard.counts).toEqual({ all: 0, succeeded: 0, failed: 0, running: 0 })
    })

    it('lists the workflows whose latest run failed across the org', async () => {
      const failing = await h.adapter.listFailingWorkflows('org-acme', 'u-ama')
      expect(failing.map((f) => [f.workflow.id, f.workspace.slug, f.run.id])).toEqual([
        ['wf-202', 'default', 'r-7'],
        ['wf-sync', 'sales', 'r-5'],
      ])
      expect(failing[1]).toMatchObject({
        project: { slug: 'project-101', name: 'Project 101' },
        workspace: { colour: 'blue' },
      })
      expect(await h.adapter.listFailingWorkflows('org-globex', 'u-cleo')).toEqual([])
      // A plain member with no grant in Globex sees nothing failing there either.
      expect(await h.adapter.listFailingWorkflows('org-globex', 'u-ama')).toEqual([])
    })
  })

  it('reads timestamps back as UTC ISO strings on every new query', async () => {
    const scope = await h.adapter.getScopeBySlugs('u-ama', {
      org: 'acme',
      project: 'project-101',
      workspace: 'sales',
    })
    expect(scope!.workspace!.createdAt).toBe('2026-10-20T00:00:00.000Z')
    expect(scope!.project!.health.lastRunAt).toMatch(/Z$/)
    const page = await h.adapter.listWorkspaceRuns('ws-sales', {})
    expect(page.data[0]!.createdAt).toBe('2026-10-28T07:00:00.000Z')
    const [raw] = await h.db
      .select({ n: sql<number>`1` })
      .from(h.schema.workspaces)
      .limit(1)
    expect(raw).toBeDefined()
  })
})
