import { describe, it, expect, beforeEach, vi } from 'vitest'

// PGlite migrates a fresh database per test; under a parallel `pnpm test` that
// runs past vitest's 5s default.
vi.setConfig({ testTimeout: 30_000, hookTimeout: 30_000 })
import { and, eq, sql } from 'drizzle-orm'
import { lockReturning, lockState, lockValues } from '../adapters/projects.js'
import { OverviewFields } from '../adapters/overview-fields.js'
import { decodeCursor, encodeCursor } from '../pagination.js'
import { isUniqueViolation } from '../db-errors.js'
import { type Harness, NOW, T0, pgHarness, seed, sqliteHarness } from './fixtures/workspaces-db.js'

// The scope, workspace and run queries, run through the real migrations on
// both dialects: they lean on each dialect's JSON aggregates and window
// functions, so the suite is one and the database is the parameter.

describe.each([
  ['sqlite', sqliteHarness],
  ['pg', pgHarness],
])('workspaces on %s', (dialect, create) => {
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
        sharedOut: 0,
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
      expect(byId!.workspace).toBeNull()
      expect(byId!.orgRole).toBe('owner')
      expect(byId!.projectGrant).toBeNull()

      // The workspace comes back as the dashboard draws it, from the same read.
      const bySlugs = await h.adapter.getProjectIfMember(
        'u-ama',
        { org: 'acme', slug: 'project-101' },
        { slug: 'ops' },
      )
      expect(bySlugs!.workspace).toEqual({
        id: 'ws-ops',
        slug: 'ops',
        name: 'Ops',
        colour: 'amber',
      })

      const byWorkspaceId = await h.adapter.getProjectIfMember(
        'u-ama',
        { id: 'p-101' },
        { id: 'ws-sales' },
      )
      expect(byWorkspaceId!.workspace?.id).toBe('ws-sales')

      // Another project's workspace, or no membership: nothing at all.
      expect(
        await h.adapter.getProjectIfMember('u-ama', { id: 'p-101' }, { id: 'ws-202' }),
      ).toBeNull()
      expect(await h.adapter.getProjectIfMember('u-cleo', { id: 'p-101' })).toBeNull()
    })

    it('finds a workspace by id or slugs for a member, and within a held project', async () => {
      const ids = { workspaceId: 'ws-sales', projectId: 'p-101', organizationId: 'org-acme' }
      const rows = { projectGrant: null, workspaceGrant: null }
      const names = { workspaceName: 'Sales', projectName: 'Project 101' }
      expect(await h.adapter.getWorkspaceIfMember('u-ama', { id: 'ws-sales' })).toEqual({
        ...ids,
        ...names,
        ...rows,
        orgRole: 'owner',
      })
      expect(
        await h.adapter.getWorkspaceIfMember('u-ben', {
          org: 'acme',
          project: 'project-101',
          workspace: 'sales',
        }),
      ).toEqual({ ...ids, ...names, ...rows, orgRole: 'admin' })
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
        sharedOut: 0,
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
      expect(await h.adapter.deleteWorkspaceUnlessBlocked('ws-202')).toBe(false)
      expect(await h.count('workspaces', "id = 'ws-202'")).toBe(1)

      expect(await h.adapter.deleteWorkspaceUnlessBlocked('ws-sales')).toBe(true)
      expect(await h.count('workflows', "workspace_id = 'ws-sales'")).toBe(0)
      expect(await h.count('workflow_runs', "workflow_id = 'wf-enrich'")).toBe(0)
      // Now Ops is the last one.
      expect(await h.adapter.deleteWorkspaceUnlessBlocked('ws-ops')).toBe(false)
    })

    it('moves workflows within the project only', async () => {
      const moved = await h.adapter.moveWorkflowsToWorkspace('ws-sales', 'ws-ops', [
        'wf-enrich',
        'wf-202',
        'nope',
      ])
      expect(moved).toEqual([{ id: 'wf-enrich', name: 'Lead enrichment' }])
      expect(await h.count('workflows', "workspace_id = 'ws-ops'")).toBe(1)

      // A target in another project moves nothing.
      expect(await h.adapter.moveWorkflowsToWorkspace('ws-sales', 'ws-202', ['wf-sync'])).toEqual(
        [],
      )
      expect(await h.count('workflows', "workspace_id = 'ws-sales'")).toBe(3)
      expect(await h.adapter.moveWorkflowsToWorkspace('ws-sales', 'ws-ops', [])).toEqual([])
    })
  })

  describe('deletion locks', () => {
    it('sets a project lock with its setter’s name, keeps the first setter, and clears it', async () => {
      const on = await h.adapter.setProjectLock('p-101', 'org-acme', 'u-ama', true)
      expect(on).toMatchObject({ lockedBy: 'u-ama', lockedByName: 'Ama Mensah', changed: true })
      expect(on!.lockedAt).toEqual(expect.any(String))
      const again = await h.adapter.setProjectLock('p-101', 'org-acme', 'u-ben', true)
      expect(again).toEqual({ ...on, changed: false })
      const off = { lockedBy: null, lockedAt: null, lockedByName: null }
      expect(await h.adapter.setProjectLock('p-101', 'org-acme', 'u-ben', false)).toEqual({
        ...off,
        changed: true,
      })
      expect(await h.adapter.setProjectLock('p-101', 'org-acme', 'u-ben', false)).toEqual({
        ...off,
        changed: false,
      })
      // Another org's id is not found.
      expect(await h.adapter.setProjectLock('p-g', 'org-acme', 'u-ama', true)).toBeNull()
      expect(await h.count('projects', "id = 'p-g' and locked_at is not null")).toBe(0)
    })

    it('counts a lock by its time alone, and gives one with no setter on record the next', async () => {
      await h.db
        .update(h.schema.projects)
        .set({ lockedAt: T0, lockedBy: null })
        .where(sql`id = 'p-101'`)
      expect(await h.adapter.deleteProject('p-101', 'org-acme')).toBe(false)
      expect(await h.adapter.getProjectLocks('p-101', 'org-acme')).toMatchObject({ ownLock: true })
      const filled = await h.adapter.setProjectLock('p-101', 'org-acme', 'u-ben', true)
      expect(filled).toMatchObject({ lockedBy: 'u-ben', lockedByName: 'Ben Okoro' })
      // The time it was set stays.
      expect(new Date(filled!.lockedAt!).toISOString()).toBe(T0)
    })

    it('names the locked row’s own column when it reads the setter back', () => {
      // RETURNING renders columns bare; the subquery's lookup must say whose
      // `locked_by` it means.
      const query = h.db
        .update(h.schema.workspaces)
        .set({ lockedAt: null })
        .returning(
          lockReturning(
            h.schema.workspaces,
            h.schema.user,
            new OverviewFields(h.schema, dialect),
            'org-acme',
          ),
        )
        .toSQL().sql
      expect(query).toContain('"workspaces"."locked_by"')
    })

    it('names the setter only while they are in the organization', async () => {
      await h.adapter.setProjectLock('p-101', 'org-acme', 'u-ben', true)
      await h.adapter.setWorkspaceLock('ws-202', 'u-ben', true)
      // Ben leaves Acme; his lock stays, his name goes. Cleo (Globex) sets nothing here.
      await h.db.delete(h.schema.member).where(sql`id = 'm-2'`)
      const scope = await h.adapter.getScopeBySlugs('u-ama', {
        org: 'acme',
        project: 'project-101',
        workspace: 'sales',
      })
      expect(scope!.project).toMatchObject({ lockedBy: 'u-ben', lockedByName: null })
      const projects = await h.adapter.listProjectsByOrganization('org-acme', 'u-ama')
      expect(projects.data.find((p) => p.id === 'p-101')!.lockedByName).toBeNull()
      const workspaces = await h.adapter.listWorkspacesByProject('p-202', 'u-ama')
      expect(workspaces[0]).toMatchObject({ lockedBy: 'u-ben', lockedByName: null })
      expect(await h.adapter.setProjectLock('p-101', 'org-acme', 'u-ama', true)).toMatchObject({
        lockedBy: 'u-ben',
        lockedByName: null,
      })
      expect(await h.adapter.setWorkspaceLock('ws-202', 'u-ama', true)).toMatchObject({
        lockedBy: 'u-ben',
        lockedByName: null,
      })
      // A member's name still comes back.
      await h.adapter.setProjectLock('p-101', 'org-acme', 'u-ama', false)
      expect(await h.adapter.setWorkspaceLock('ws-sales', 'u-ama', true)).toMatchObject({
        lockedByName: 'Ama Mensah',
      })
    })

    it('reads the lock on the project and the workspace overviews', async () => {
      await h.adapter.setProjectLock('p-101', 'org-acme', 'u-ben', true)
      const scope = await h.adapter.getScopeBySlugs('u-ama', {
        org: 'acme',
        project: 'project-101',
        workspace: 'sales',
      })
      expect(scope!.project).toMatchObject({ lockedBy: 'u-ben', lockedByName: 'Ben Okoro' })
      expect(scope!.workspace!.projectLockedAt).toEqual(scope!.project!.lockedAt)
    })

    it('never lets the no-change write undo an opposite flip that landed in between', async () => {
      await h.adapter.setProjectLock('p-101', 'org-acme', 'u-ama', true)
      // "Already off?" against a locked row matches nothing and changes nothing.
      const p = h.schema.projects
      const touched = await h.db
        .update(p)
        .set(lockValues(p, 'u-ben', false))
        .where(and(eq(p.id, 'p-101'), lockState(p, false, 'already')))
        .returning({ id: p.id })
      expect(touched).toEqual([])
      expect(await h.count('projects', "id = 'p-101' and locked_at is not null")).toBe(1)
    })

    it('says whether a workspace lock write changed it (B7 logs real changes only)', async () => {
      expect(await h.adapter.setWorkspaceLock('ws-sales', 'u-ama', true)).toMatchObject({
        changed: true,
      })
      expect(await h.adapter.setWorkspaceLock('ws-sales', 'u-ben', true)).toMatchObject({
        lockedBy: 'u-ama',
        changed: false,
      })
      expect(await h.adapter.setWorkspaceLock('ws-sales', 'u-ben', false)).toMatchObject({
        lockedAt: null,
        changed: true,
      })
      expect(await h.adapter.setWorkspaceLock('ws-sales', 'u-ben', false)).toMatchObject({
        changed: false,
      })
    })

    it('refuses a workspace lock change while its project is locked', async () => {
      expect(await h.adapter.setWorkspaceLock('ws-sales', 'u-ama', true)).toMatchObject({
        lockedBy: 'u-ama',
      })
      await h.adapter.setProjectLock('p-101', 'org-acme', 'u-ben', true)
      expect(await h.adapter.setWorkspaceLock('ws-sales', 'u-ama', false)).toBeNull()
      expect(await h.adapter.setWorkspaceLock('ws-ops', 'u-ama', true)).toBeNull()
      expect(await h.count('workspaces', 'locked_at is not null')).toBe(1)
      expect(await h.adapter.setWorkspaceLock('ws-nowhere', 'u-ama', true)).toBeNull()
    })

    it('keeps a locked project, or one with a locked workspace, from being deleted', async () => {
      await h.adapter.setProjectLock('p-101', 'org-acme', 'u-ama', true)
      expect(await h.adapter.deleteProject('p-101', 'org-acme')).toBe(false)
      expect(await h.adapter.getProjectLocks('p-101', 'org-acme')).toEqual({
        ownLock: true,
        lockedWorkspaces: [],
      })
      await h.adapter.setProjectLock('p-101', 'org-acme', 'u-ama', false)
      await h.adapter.setWorkspaceLock('ws-ops', 'u-ama', true)
      await h.adapter.setWorkspaceLock('ws-sales', 'u-ama', true)
      expect(await h.adapter.deleteProject('p-101', 'org-acme')).toBe(false)
      expect(await h.count('workspaces', "project_id = 'p-101'")).toBe(2)
      // Oldest first, every locked one.
      expect(await h.adapter.getProjectLocks('p-101', 'org-acme')).toEqual({
        ownLock: false,
        lockedWorkspaces: ['Sales', 'Ops'],
      })
      const projects = await h.adapter.listProjectsByOrganization('org-acme', 'u-ama')
      expect(projects.data.find((p) => p.id === 'p-101')!.lockedWorkspaces).toEqual([
        'Sales',
        'Ops',
      ])
      await h.adapter.setWorkspaceLock('ws-ops', 'u-ama', false)
      await h.adapter.setWorkspaceLock('ws-sales', 'u-ama', false)
      expect(await h.adapter.deleteProject('p-101', 'org-acme')).toBe(true)
      expect(await h.adapter.getProjectLocks('p-101', 'org-acme')).toBeNull()
    })

    it('keeps a locked workspace, or one in a locked project, from being deleted', async () => {
      await h.adapter.setWorkspaceLock('ws-sales', 'u-ama', true)
      expect(await h.adapter.deleteWorkspaceUnlessBlocked('ws-sales')).toBe(false)
      expect(await h.adapter.getWorkspaceLocks('ws-sales')).toEqual({
        ownLock: true,
        lockedByProject: null,
        isLastWorkspace: false,
      })
      await h.adapter.setProjectLock('p-101', 'org-acme', 'u-ama', true)
      expect(await h.adapter.deleteWorkspaceUnlessBlocked('ws-ops')).toBe(false)
      expect(await h.adapter.getWorkspaceLocks('ws-ops')).toEqual({
        ownLock: false,
        lockedByProject: 'Project 101',
        isLastWorkspace: false,
      })
      await h.adapter.setProjectLock('p-101', 'org-acme', 'u-ama', false)
      expect(await h.adapter.deleteWorkspaceUnlessBlocked('ws-ops')).toBe(true)
      expect(await h.adapter.getWorkspaceLocks('ws-ops')).toBeNull()
      expect(await h.count('workspaces', "id = 'ws-sales'")).toBe(1)
    })

    // better-sqlite3 and PGlite run one statement at a time, so this checks the
    // outcome only; the pg row lock is exercised against a real server in the
    // Docker e2e (plan/qa/b5-docker).
    it('leaves one workspace when both of a project’s two are deleted at once', async () => {
      const results = await Promise.all([
        h.adapter.deleteWorkspaceUnlessBlocked('ws-sales'),
        h.adapter.deleteWorkspaceUnlessBlocked('ws-ops'),
      ])
      expect(results.filter(Boolean)).toHaveLength(1)
      expect(await h.count('workspaces', "project_id = 'p-101'")).toBe(1)
    })

    it('keeps a locked project in its organization', async () => {
      // Ama runs both orgs for the move.
      await h.db
        .update(h.schema.member)
        .set({ role: 'owner' })
        .where(sql`id = 'm-3'`)
      await h.adapter.setProjectLock('p-202', 'org-acme', 'u-ama', true)
      await h.adapter.moveProjectToOrganization('p-202', 'org-acme', 'org-globex', 'u-ama')
      expect(await h.adapter.getProjectById('p-202')).toMatchObject({
        organizationId: 'org-acme',
      })
      // A workspace's own lock does not hold it.
      await h.adapter.setProjectLock('p-202', 'org-acme', 'u-ama', false)
      await h.adapter.setWorkspaceLock('ws-202', 'u-ama', true)
      await h.adapter.moveProjectToOrganization('p-202', 'org-acme', 'org-globex', 'u-ama')
      expect(await h.adapter.getProjectById('p-202')).toMatchObject({
        organizationId: 'org-globex',
      })
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
