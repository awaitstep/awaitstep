import { describe, it, expect, beforeEach } from 'vitest'
import {
  ACCESS_REASONS,
  canSeeProject,
  presetPermissions,
  resolveRoles,
  type OrgRole,
  type ProjectRole,
  type WorkspaceRole,
} from '@awaitstep/ir'
import { createSqliteApp, seedAcme, type SqliteApp } from './sqlite-app.js'
import { rolesOf } from '../lib/scope-records.js'
import { and, eq } from 'drizzle-orm'

// Roles below the organization, through the real API on a real database:
// the SQL role table against the one in @awaitstep/ir, what is hidden, and
// what each role is refused.

const T1 = '2026-10-28T00:00:00.000Z'
const ORG_ROLES: (OrgRole | null)[] = ['owner', 'admin', 'member', null]
const PROJECT_GRANTS: (ProjectRole | null)[] = ['admin', 'member', null]
const WORKSPACE_GRANTS: (WorkspaceRole | null)[] = ['admin', 'editor', 'viewer', null]

describe('the SQL role table against @awaitstep/ir', () => {
  it('agrees on the project role, the workspace role and visibility for every combination', async () => {
    const h = createSqliteApp()
    await h.seed.org('org-1', 'One', 'one')
    await h.seed.project('p-1', 'org-1', 'P', 'p')
    await h.seed.workspace('ws-1', 'p-1', 'W', 'w')
    let n = 0
    const cases: {
      userId: string
      orgRole: OrgRole | null
      projectGrant: ProjectRole | null
      workspaceGrant: WorkspaceRole | null
    }[] = []
    for (const orgRole of ORG_ROLES) {
      for (const projectGrant of PROJECT_GRANTS) {
        for (const workspaceGrant of WORKSPACE_GRANTS) {
          const userId = `u-${n++}`
          await h.seed.person(userId, userId, `${userId}@one.test`)
          if (orgRole) await h.seed.member(userId, 'org-1', orgRole)
          if (projectGrant) await h.seed.projectGrant('p-1', userId, projectGrant)
          if (workspaceGrant) await h.seed.workspaceGrant('ws-1', userId, workspaceGrant)
          cases.push({ userId, orgRole, projectGrant, workspaceGrant })
        }
      }
    }
    expect(cases).toHaveLength(48)
    for (const c of cases) {
      const expected = resolveRoles(c)
      const label = JSON.stringify(c)
      const workspace = await h.adapter.getWorkspaceIfMember(c.userId, { id: 'ws-1' })
      expect(workspace !== null, `workspace visible: ${label}`).toBe(
        expected.workspaceRole !== null,
      )
      if (workspace) {
        expect(rolesOf(workspace).workspaceRole, label).toBe(expected.workspaceRole)
        expect(rolesOf(workspace).projectRole, label).toBe(expected.projectRole)
      }
      const project = await h.adapter.getProjectIfMember(c.userId, { id: 'p-1' })
      const visible = canSeeProject(c.orgRole, c.projectGrant, c.workspaceGrant !== null)
      expect(project !== null, `project visible: ${label}`).toBe(visible)
      if (project) expect(rolesOf(project).projectRole, label).toBe(expected.projectRole)
      const scope = await h.adapter.getScopeBySlugs(c.userId, {
        org: 'one',
        project: 'p',
        workspace: 'w',
      })
      expect(scope !== null, `org member: ${label}`).toBe(c.orgRole !== null)
      if (scope) {
        expect(scope.project !== null, `scope project: ${label}`).toBe(visible)
        expect(scope.workspace !== null, `scope workspace: ${label}`).toBe(
          expected.workspaceRole !== null,
        )
      }
    }
  })
})

describe('hidden workspaces and projects', () => {
  let h: SqliteApp
  beforeEach(async () => {
    h = createSqliteApp()
    await seedAcme(h)
  })

  it('answers Not found for everything in a project a member has no row in', async () => {
    const scope = await (await h.app.request('/api/scope?org=acme', h.as('u-fay'))).json()
    expect(scope.found).toBe(true)
    expect(scope.org.projectCount).toBe(0)
    const project = await (
      await h.app.request('/api/scope?org=acme&project=project-101', h.as('u-fay'))
    ).json()
    expect(project).toMatchObject({
      found: false,
      notFound: { kind: 'project', slug: 'project-101' },
    })
    expect(
      (await (await h.app.request('/api/projects?org=acme', h.as('u-fay'))).json()).data,
    ).toEqual([])
    expect((await h.app.request('/api/projects/p-101?org=acme', h.as('u-fay'))).status).toBe(404)
    expect(
      (await h.app.request('/api/workspaces?org=acme&project=project-101', h.as('u-fay'))).status,
    ).toBe(404)
    expect(
      (await h.app.request('/api/workflows/wf-sales?projectId=p-101', h.as('u-fay'))).status,
    ).toBe(404)
  })

  it('shows a workspace-only member her workspace and nothing beside it', async () => {
    const scope = await (
      await h.app.request('/api/scope?org=acme&project=project-101&workspace=ops', h.as('u-eve'))
    ).json()
    expect(scope).toMatchObject({ found: false, notFound: { kind: 'workspace', slug: 'ops' } })
    const sales = await (
      await h.app.request('/api/scope?org=acme&project=project-101&workspace=sales', h.as('u-eve'))
    ).json()
    expect(sales.found).toBe(true)
    expect(sales.project.viewerRole).toBeNull()
    expect(sales.project.workspaces.map((w: { slug: string }) => w.slug)).toEqual(['sales'])
    expect(sales.workspace.viewerRole).toBe('viewer')
    expect(sales.workspace.viewerCan.edit).toEqual({
      allowed: false,
      reason: ACCESS_REASONS.needsEditor,
    })

    const workspaces = await (
      await h.app.request('/api/workspaces?org=acme&project=project-101', h.as('u-eve'))
    ).json()
    expect(workspaces.data.map((w: { slug: string }) => w.slug)).toEqual(['sales'])
    expect((await h.app.request('/api/workspaces/ws-ops', h.as('u-eve'))).status).toBe(404)
    expect(
      (await h.app.request('/api/workflows/wf-ops?projectId=p-101', h.as('u-eve'))).status,
    ).toBe(404)
    expect(
      (await h.app.request('/api/workflows/wf-sales?projectId=p-101', h.as('u-eve'))).status,
    ).toBe(200)
    const list = await (await h.app.request('/api/workflows?projectId=p-101', h.as('u-eve'))).json()
    expect(list.data.map((w: { id: string }) => w.id)).toEqual(['wf-sales'])
    expect(
      (await h.app.request('/api/workflows?projectId=p-101&workspace=ops', h.as('u-eve'))).status,
    ).toBe(404)
  })

  it('counts and lists only what the viewer can open on the org home', async () => {
    const orgs = await (await h.app.request('/api/orgs', h.as('u-eve'))).json()
    expect(
      orgs.data.map((o: { slug: string; projectCount: number }) => [o.slug, o.projectCount]),
    ).toEqual([['acme', 1]])
    await h.db.insert(h.schema.workflowRuns).values({
      id: 'r-ops',
      workflowId: 'wf-ops',
      versionId: null,
      connectionId: null,
      instanceId: 'r-ops',
      status: 'errored',
      createdAt: '2026-10-28T00:00:00.000Z',
      updatedAt: '2026-10-28T00:00:00.000Z',
    })
    expect(
      (await (await h.app.request('/api/failing?org=acme', h.as('u-eve'))).json()).data,
    ).toEqual([])
    expect(
      (await (await h.app.request('/api/failing?org=acme', h.as('u-gus'))).json()).data,
    ).toHaveLength(1)
    expect(
      (await (await h.app.request('/api/runs?projectId=p-101', h.as('u-eve'))).json()).data,
    ).toEqual([])
    // The org card on /dashboard: Ops failing counts for Gus, not for Eve, who only opens Sales.
    const [eve] = (await (await h.app.request('/api/orgs', h.as('u-eve'))).json()).data
    expect(eve.grants).toEqual({
      projects: [],
      workspaces: [{ name: 'Sales', projectName: 'Project 101', role: 'viewer' }],
    })
    expect(eve.health).toEqual({ failing: 0, lastRunAt: null })
    const [gus] = (await (await h.app.request('/api/orgs', h.as('u-gus'))).json()).data
    expect(gus.health).toEqual({ failing: 1, lastRunAt: '2026-10-28T00:00:00.000Z' })
  })
})

describe('what each role is refused', () => {
  let h: SqliteApp
  beforeEach(async () => {
    h = createSqliteApp()
    await seedAcme(h)
  })

  const salesWorkflow = (path = '') => `/api/workflows/wf-sales${path}?projectId=p-101`

  it('keeps a Viewer to reading and running', async () => {
    const eve = (init: RequestInit) => h.as('u-eve', init)
    expect((await h.app.request(salesWorkflow(), eve({}))).status).toBe(200)
    const edits: [string, string][] = [
      ['PATCH', salesWorkflow()],
      ['DELETE', salesWorkflow()],
      ['POST', salesWorkflow('/versions')],
      ['PUT', salesWorkflow('/files/lib/x.ts')],
      ['POST', salesWorkflow('/project/convert-handlers')],
      ['POST', salesWorkflow('/test-sessions')],
    ]
    for (const [method, path] of edits) {
      const res = await h.app.request(path, eve(h.json({ name: 'x' }, method)))
      expect(res.status, `${method} ${path}`).toBe(403)
      expect((await res.json()).error, `${method} ${path}`).toBe(ACCESS_REASONS.needsEditor)
    }
    for (const path of [salesWorkflow('/deploy'), salesWorkflow('/takedown')]) {
      const res = await h.app.request(path, eve(h.json({}, 'POST')))
      expect(res.status, path).toBe(403)
      expect((await res.json()).error).toBe(ACCESS_REASONS.needsEditor)
    }
    // Running is allowed: the gate passes, and the handler answers for the run itself.
    const trigger = await h.app.request(salesWorkflow('/trigger'), eve(h.json({}, 'POST')))
    expect(trigger.status).not.toBe(403)
    const create = await h.app.request(
      '/api/workflows?projectId=p-101&workspace=sales',
      eve(h.json({ name: 'New' })),
    )
    expect(create.status).toBe(403)
  })

  it('lets an Editor build and deploy but not manage the workspace', async () => {
    const gus = (init: RequestInit) => h.as('u-gus', init)
    const patch = await h.app.request(
      '/api/workflows/wf-ops?projectId=p-101',
      gus(h.json({ name: 'Renamed' }, 'PATCH')),
    )
    expect(patch.status).toBe(200)
    const create = await h.app.request(
      '/api/workflows?projectId=p-101&workspace=ops',
      gus(h.json({ name: 'New' })),
    )
    expect(create.status).toBe(201)
    // Without naming a workspace, a workspace-only Editor has nowhere to build.
    const nowhere = await h.app.request(
      '/api/workflows?projectId=p-101',
      gus(h.json({ name: 'New' })),
    )
    expect(nowhere.status).toBe(403)
    const rename = await h.app.request(
      '/api/workspaces/ws-ops',
      gus(h.json({ name: 'Mine' }, 'PATCH')),
    )
    expect(rename.status).toBe(403)
    expect((await rename.json()).error).toBe(ACCESS_REASONS.workspaceAdmins)
    const addMember = await h.app.request(
      '/api/workspaces/ws-ops/members',
      gus(h.json({ userId: 'u-fay', role: 'viewer' })),
    )
    expect(addMember.status).toBe(403)
  })

  it('lets a project member build everywhere, and a project admin manage the project', async () => {
    const dan = (init: RequestInit) => h.as('u-dan', init)
    const create = await h.app.request(
      '/api/workflows?projectId=p-101',
      dan(h.json({ name: 'Anywhere' })),
    )
    expect(create.status).toBe(201)
    expect((await create.json()).workspaceId).toBe('ws-sales')
    const workspace = await h.app.request(
      '/api/workspaces?projectId=p-101',
      dan(h.json({ name: 'Mine' })),
    )
    expect(workspace.status).toBe(403)
    expect((await workspace.json()).error).toBe(ACCESS_REASONS.projectAdmins)
    const rename = await h.app.request(
      '/api/projects/p-101?org=acme',
      dan(h.json({ name: 'Renamed' }, 'PATCH')),
    )
    expect(rename.status).toBe(403)

    await h.adapter.saveAccess(
      'org-acme',
      'u-dan',
      { orgRole: 'member', projects: [{ projectId: 'p-101', role: 'admin' }], workspaces: [] },
      'u-ama',
      { callerIsOwner: true },
    )
    const asAdmin = await h.app.request(
      '/api/workspaces?projectId=p-101',
      dan(h.json({ name: 'Mine' })),
    )
    expect(asAdmin.status).toBe(201)
    const renamed = await h.app.request(
      '/api/projects/p-101?org=acme',
      dan(h.json({ name: 'Renamed' }, 'PATCH')),
    )
    expect(renamed.status).toBe(200)
    // Moving a project to another org stays with org owners and admins.
    const move = await h.app.request(
      '/api/projects/p-101/move?org=acme',
      dan(h.json({ organizationId: 'org-globex' })),
    )
    expect(move.status).toBe(403)
    expect((await move.json()).error).toBe(ACCESS_REASONS.orgAdmins)
  })

  it('reports each level’s role and capabilities on the scope', async () => {
    const dan = await (
      await h.app.request('/api/scope?org=acme&project=project-101&workspace=sales', h.as('u-dan'))
    ).json()
    expect(dan.project.viewerRole).toBe('member')
    expect(dan.workspace.viewerRole).toBe('editor')
    await h.seed.workspaceGrant('ws-sales', 'u-dan', 'admin')
    const raised = await (
      await h.app.request('/api/scope?org=acme&project=project-101&workspace=sales', h.as('u-dan'))
    ).json()
    expect(raised.workspace.viewerRole).toBe('admin')
    expect(raised.workspace.viewerCan.manageMembers.allowed).toBe(true)
    const people = raised.workspace.members as {
      id: string
      role: string
      inherited: boolean
      projectRole: string | null
      orgRole: string | null
    }[]
    expect(people.map((p) => [p.id, p.role, p.inherited, p.projectRole, p.orgRole])).toEqual([
      ['u-ama', 'admin', true, 'admin', 'owner'],
      ['u-ben', 'admin', true, 'admin', 'admin'],
      ['u-dan', 'admin', false, 'editor', null],
      ['u-eve', 'viewer', false, null, null],
    ])
  })
})

describe('API keys act with their creator’s standing', () => {
  let h: SqliteApp
  beforeEach(async () => {
    h = createSqliteApp()
    await seedAcme(h)
  })

  // A key with Full access at its level: what it may do is then its creator's standing alone.
  function key(id: string, createdBy: string, projectId: string | null) {
    return projectId
      ? h.seed.key(
          id,
          createdBy,
          { level: 'project', projectId },
          presetPermissions('project', 'full'),
        )
      : h.seed.key(
          id,
          createdBy,
          { level: 'organization' },
          presetPermissions('organization', 'full'),
        )
  }

  it('lets a project member’s key build but not manage, and stops when they lose the project', async () => {
    const asDan = await key('k-dan', 'u-dan', 'p-101')
    const create = await h.app.request('/api/workflows', {
      ...asDan,
      method: 'POST',
      body: JSON.stringify({ name: 'From key' }),
    })
    expect(create.status).toBe(201)
    const workspace = await h.app.request('/api/workspaces', {
      ...asDan,
      method: 'POST',
      body: JSON.stringify({ name: 'From key' }),
    })
    expect(workspace.status).toBe(403)
    expect((await workspace.json()).error).toBe(ACCESS_REASONS.projectAdmins)
    // The roster never reaches a key.
    const list = await (await h.app.request('/api/workspaces', asDan)).json()
    expect(list.data[0].members).toEqual([])

    await h.adapter.saveAccess(
      'org-acme',
      'u-dan',
      { orgRole: 'member', projects: [], workspaces: [] },
      'u-ama',
      { callerIsOwner: true },
    )
    const gone = await h.app.request('/api/workflows', asDan)
    expect(gone.status).toBe(401)
    expect((await gone.json()).error).toMatch(/can no longer access this project/)
  })

  it('lists a project’s keys and variables only to someone who can open it', async () => {
    const minted = await h.app.request(
      '/api/api-keys?org=acme&project=project-101',
      h.as(
        'u-ama',
        h.json({ name: 'Project key', level: 'project', permissions: { workflows: ['read'] } }),
      ),
    )
    expect(minted.status).toBe(201)
    const set = await h.app.request(
      '/api/env-vars?org=acme&project=project-101',
      h.as('u-ama', h.json({ name: 'API_URL', value: 'x', isSecret: false })),
    )
    expect(set.status).toBe(201)
    // Eve can open Project 101 (a Viewer in Sales); Fay, in the organization, can open no project.
    const keysForEve = await h.app.request(
      '/api/api-keys?org=acme&project=project-101',
      h.as('u-eve'),
    )
    expect(keysForEve.status).toBe(200)
    expect((await keysForEve.json()).own).toHaveLength(1)
    expect(
      (await h.app.request('/api/api-keys?org=acme&project=project-101', h.as('u-fay'))).status,
    ).toBe(404)
    const varsForEve = await h.app.request(
      '/api/env-vars?org=acme&project=project-101',
      h.as('u-eve'),
    )
    expect(varsForEve.status).toBe(200)
    expect((await varsForEve.json()).data).toHaveLength(1)
    // A project she cannot open is not found, as the keys are (B4: the
    // address is resolved by the one scope read, never cut by the list).
    expect(
      (await h.app.request('/api/env-vars?org=acme&project=project-101', h.as('u-fay'))).status,
    ).toBe(404)
  })

  it('changes or removes a project’s variables only for someone who can open it', async () => {
    const set = await h.app.request(
      '/api/env-vars?org=acme&project=project-202',
      h.as('u-ama', h.json({ name: 'HIDDEN', value: 'x', isSecret: false })),
    )
    expect(set.status).toBe(201)
    const id = (await set.json()).id
    // Gus is in the organization but can open Project 202 by no route: its
    // address, and so its variable, answers like a missing one.
    const patch = await h.app.request(
      `/api/env-vars/${id}?org=acme&project=project-202`,
      h.as('u-gus', h.json({ value: 'y' }, 'PATCH')),
    )
    expect(patch.status).toBe(404)
    expect(
      (
        await h.app.request(
          `/api/env-vars/${id}?org=acme&project=project-202`,
          h.as('u-gus', { method: 'DELETE' }),
        )
      ).status,
    ).toBe(404)
    // Addressed at the organization, a project's row is not there either.
    expect(
      (
        await h.app.request(
          `/api/env-vars/${id}?org=acme`,
          h.as('u-ama', h.json({ value: 'z' }, 'PATCH')),
        )
      ).status,
    ).toBe(404)
    expect(
      (
        await h.app.request(
          `/api/env-vars/${id}?org=acme&project=project-202`,
          h.as('u-ama', h.json({ value: 'z' }, 'PATCH')),
        )
      ).status,
    ).toBe(200)
    expect(
      (
        await h.app.request(
          `/api/env-vars/${id}?org=acme&project=project-202`,
          h.as('u-ama', { method: 'DELETE' }),
        )
      ).status,
    ).toBe(200)
  })

  it('never names a hidden project’s keys, nor mints or sets anything in one', async () => {
    const asAma = (body: unknown) => h.as('u-ama', h.json(body))
    const orgKey = await h.app.request(
      '/api/api-keys?org=acme',
      asAma({ name: 'Org key', level: 'organization', permissions: { projects: ['read'] } }),
    )
    expect(orgKey.status).toBe(201)
    const p202Key = await h.app.request(
      '/api/api-keys?org=acme&project=project-202',
      asAma({ name: 'P202 key', level: 'project', permissions: { workflows: ['read'] } }),
    )
    expect(p202Key.status).toBe(201)
    // The organization's keys are its owners' and admins' to see; a hidden project's are nobody else's.
    expect((await h.app.request('/api/api-keys?org=acme', h.as('u-eve'))).status).toBe(403)
    expect(
      (await h.app.request('/api/api-keys?org=acme&project=project-202', h.as('u-eve'))).status,
    ).toBe(404)
    const forAma = await (await h.app.request('/api/api-keys?org=acme', h.as('u-ama'))).json()
    expect(forAma.data.map((k: { name: string }) => k.name)).toEqual(['Org key'])
    const mint = await h.app.request(
      '/api/api-keys?org=acme&project=project-202',
      h.as('u-eve', h.json({ name: 'x', level: 'project', permissions: { workflows: ['read'] } })),
    )
    expect(mint.status).toBe(404)
    const set = await h.app.request(
      '/api/env-vars?org=acme&project=project-202',
      h.as('u-eve', h.json({ name: 'X', value: 'x', isSecret: false })),
    )
    expect(set.status).toBe(404)
  })

  describe('keys at three levels', () => {
    const full = (level: 'organization' | 'project' | 'workspace') =>
      presetPermissions(level, 'full')
    const mint = (as: string, query: string, body: unknown) =>
      h.app.request(`/api/api-keys?${query}`, h.as(as, h.json(body)))

    it('are minted by whoever manages the level, with a grid the level offers', async () => {
      // The organization: owners and admins.
      const orgByMember = await mint('u-dan', 'org=acme', {
        name: 'x',
        level: 'organization',
        permissions: full('organization'),
      })
      expect(orgByMember.status).toBe(403)
      expect((await orgByMember.json()).error).toBe(ACCESS_REASONS.orgAdmins)
      const orgKey = await mint('u-ben', 'org=acme', {
        name: 'Org',
        level: 'organization',
        permissions: full('organization'),
      })
      expect(orgKey.status).toBe(201)
      const minted = await orgKey.json()
      expect(minted.key).toMatch(/^ask_[A-Za-z0-9_-]{40}$/)
      expect(minted).toMatchObject({
        level: 'organization',
        keyPrefix: minted.key.slice(0, 8),
        keySuffix: minted.key.slice(-4),
        permissions: full('organization'),
      })
      expect(minted.keyHash).toBeUndefined()
      // A project: its admins. Dan is a member of Project 101.
      const body = { name: 'CI', level: 'project', permissions: full('project') }
      const byMember = await mint('u-dan', 'org=acme&project=project-101', body)
      expect(byMember.status).toBe(403)
      expect((await byMember.json()).error).toBe(ACCESS_REASONS.projectAdmins)
      await h.adapter.saveAccess(
        'org-acme',
        'u-dan',
        { orgRole: 'member', projects: [{ projectId: 'p-101', role: 'admin' }], workspaces: [] },
        'u-ama',
        { callerIsOwner: true },
      )
      expect((await mint('u-dan', 'org=acme&project=project-101', body)).status).toBe(201)
      // A workspace: its admins. Eve is a Viewer in Sales, Gus an Editor in Ops.
      const wsBody = { name: 'Sales CI', level: 'workspace', permissions: full('workspace') }
      const byViewer = await mint('u-eve', 'org=acme&project=project-101&workspace=sales', wsBody)
      expect(byViewer.status).toBe(403)
      expect((await byViewer.json()).error).toBe(ACCESS_REASONS.workspaceAdmins)
      expect(
        (await mint('u-gus', 'org=acme&project=project-101&workspace=ops', wsBody)).status,
      ).toBe(403)
      await h.adapter.setWorkspaceGrant('ws-sales', 'u-eve', 'admin')
      const wsKey = await mint('u-eve', 'org=acme&project=project-101&workspace=sales', wsBody)
      expect(wsKey.status).toBe(201)
      // The listed shape, so the reveal can say "Only Sales" and who minted it.
      expect(await wsKey.json()).toMatchObject({
        level: 'workspace',
        createdByName: 'Eve Park',
        workspaces: [
          { workspace: { id: 'ws-sales', slug: 'sales', name: 'Sales', colour: 'green' } },
        ],
      })
      // The grid must be the level's, non-empty, and the body's level the address's.
      const outside = await mint('u-ben', 'org=acme', {
        name: 'x',
        level: 'organization',
        permissions: { workflows: ['deploy'] },
      })
      expect(outside.status).toBe(422)
      expect((await outside.json()).details[0].message).toMatch(/workflows: deploy/)
      expect(
        (await mint('u-ben', 'org=acme', { name: 'x', level: 'organization', permissions: {} }))
          .status,
      ).toBe(422)
      expect(
        (
          await mint('u-ben', 'org=acme', {
            name: 'x',
            level: 'organization',
            permissions: { projects: ['fly'] },
          })
        ).status,
      ).toBe(422)
      expect(
        (
          await mint('u-ben', 'org=acme', {
            name: 'x',
            level: 'project',
            permissions: full('project'),
          })
        ).status,
      ).toBe(400)
    })

    it('lists each level to those who can open it, and revokes at the level only', async () => {
      await h.seed.key('k-org', 'u-ama', { level: 'organization' }, full('organization'))
      await h.seed.key('k-proj', 'u-ama', { level: 'project', projectId: 'p-101' }, full('project'))
      await h.seed.key(
        'k-sales',
        'u-ama',
        { level: 'workspace', projectId: 'p-101', workspaceId: 'ws-sales' },
        full('workspace'),
      )
      await h.seed.key(
        'k-ops',
        'u-ama',
        { level: 'workspace', projectId: 'p-101', workspaceId: 'ws-ops' },
        full('workspace'),
      )
      expect((await h.app.request('/api/api-keys?org=acme', h.as('u-dan'))).status).toBe(403)
      const org = await (await h.app.request('/api/api-keys?org=acme', h.as('u-ben'))).json()
      expect(org.data.map((k: { id: string; level: string }) => [k.id, k.level])).toEqual([
        ['k-org', 'organization'],
      ])
      // Eve opens Sales only: the project's keys, and Sales's count — never Ops's.
      const project = await (
        await h.app.request('/api/api-keys?org=acme&project=project-101', h.as('u-eve'))
      ).json()
      expect(project.own.map((k: { id: string }) => k.id)).toEqual(['k-proj'])
      expect(project.workspaceCounts).toEqual([
        { workspace: { id: 'ws-sales', slug: 'sales', name: 'Sales', colour: 'green' }, count: 1 },
      ])
      const sales = await (
        await h.app.request(
          '/api/api-keys?org=acme&project=project-101&workspace=sales',
          h.as('u-eve'),
        )
      ).json()
      expect(sales.own.map((k: { id: string }) => k.id)).toEqual(['k-sales'])
      expect(sales.reaching.map((k: { id: string }) => k.id)).toEqual(['k-proj'])
      expect(
        (
          await h.app.request(
            '/api/api-keys?org=acme&project=project-101&workspace=ops',
            h.as('u-eve'),
          )
        ).status,
      ).toBe(404)
      // Revoking: the level's managers, at the level's address.
      await h.adapter.setWorkspaceGrant('ws-sales', 'u-eve', 'admin')
      expect(
        (
          await h.app.request(
            '/api/api-keys/k-proj?org=acme&project=project-101',
            h.as('u-eve', { method: 'DELETE' }),
          )
        ).status,
      ).toBe(403)
      expect(
        (
          await h.app.request(
            '/api/api-keys/k-proj?org=acme&project=project-101&workspace=sales',
            h.as('u-eve', { method: 'DELETE' }),
          )
        ).status,
      ).toBe(404)
      expect(
        (
          await h.app.request(
            '/api/api-keys/k-sales?org=acme&project=project-101&workspace=sales',
            h.as('u-eve', { method: 'DELETE' }),
          )
        ).status,
      ).toBe(200)
      expect(
        (await h.app.request('/api/api-keys/k-org?org=acme', h.as('u-dan', { method: 'DELETE' })))
          .status,
      ).toBe(403)
      expect(
        (await h.app.request('/api/api-keys/k-org?org=acme', h.as('u-ama', { method: 'DELETE' })))
          .status,
      ).toBe(200)
      expect(
        (await h.app.request('/api/api-keys/k-org?org=acme', h.as('u-ama', { method: 'DELETE' })))
          .status,
      ).toBe(404)
    })

    it('reads people with members:read at the key’s own level only', async () => {
      const grid = { members: ['read'] }
      const asOrg = await h.seed.key('k-org-m', 'u-ama', { level: 'organization' }, grid)
      expect((await h.app.request('/api/members', asOrg)).status).toBe(200)
      // A project's people are a project route: not an organization key's,
      // whatever its grid — the level rule, not the cell, answers.
      const onProject = await h.app.request('/api/members?project=project-101', asOrg)
      expect(onProject.status).toBe(403)
      expect((await onProject.json()).error).toMatch(/organization-level API key cannot access/)
      expect((await h.app.request('/api/workspaces/ws-sales/members', asOrg)).status).toBe(403)
      const asProject = await h.seed.key(
        'k-proj-m',
        'u-ama',
        { level: 'project', projectId: 'p-101' },
        grid,
      )
      expect((await h.app.request('/api/members', asProject)).status).toBe(200)
      expect((await h.app.request('/api/workspaces/ws-sales/members', asProject)).status).toBe(200)
      // A workspace key holds no members cell; the refusal names the key
      // (it once said "project-scoped … cannot manage organization resources").
      const asSales = await h.seed.key(
        'k-sales-m',
        'u-ama',
        { level: 'workspace', projectId: 'p-101', workspaceId: 'ws-sales' },
        full('workspace'),
      )
      const refused = await h.app.request('/api/members', asSales)
      expect(refused.status).toBe(403)
      expect((await refused.json()).error).toBe('A workspace-level API key cannot read members')
      const refusedToo = await h.app.request('/api/workspaces/ws-sales/members', asSales)
      expect((await refusedToo.json()).error).toBe('A workspace-level API key cannot read members')
    })

    it('stops a workspace key when its creator can no longer open that workspace', async () => {
      // Eve is a Viewer in Sales through a workspace grant alone; an Ops
      // grant keeps her in the project after Sales is taken away.
      await h.seed.workspaceGrant('ws-ops', 'u-eve', 'viewer')
      const asEve = await h.seed.key(
        'k-eve-sales',
        'u-eve',
        { level: 'workspace', projectId: 'p-101', workspaceId: 'ws-sales' },
        full('workspace'),
      )
      expect((await h.app.request('/api/connections', asEve)).status).toBe(200)
      expect((await h.app.request('/api/workflows/wf-sales', asEve)).status).toBe(200)
      await h.adapter.removeWorkspaceGrant('ws-sales', 'u-eve')
      // Not only the workspace's own routes: the organization reads it held
      // through its cells (connections, nodes, variables) close with it.
      const closed = await h.app.request('/api/connections', asEve)
      expect(closed.status).toBe(401)
      expect((await closed.json()).error).toMatch(/creator can no longer access this workspace/)
      expect((await h.app.request('/api/workflows/wf-sales', asEve)).status).toBe(401)
    })

    it('pins a workspace key to its workspace', async () => {
      const asSales = await h.seed.key(
        'k-sales',
        'u-ama',
        { level: 'workspace', projectId: 'p-101', workspaceId: 'ws-sales' },
        full('workspace'),
      )
      const list = await (await h.app.request('/api/workflows', asSales)).json()
      expect(list.data.map((w: { id: string }) => w.id)).toEqual(['wf-sales'])
      expect((await h.app.request('/api/workflows?workspace=ops', asSales)).status).toBe(404)
      expect((await h.app.request('/api/workflows?workspaceId=ws-ops', asSales)).status).toBe(404)
      expect((await h.app.request('/api/workflows/wf-ops', asSales)).status).toBe(404)
      expect((await h.app.request('/api/workflows/wf-sales', asSales)).status).toBe(200)
      // The deploy-config preview is addressed by a workflow too (it was the
      // one workflow route without the ownership read).
      const preview = { ...asSales, method: 'POST', body: '{}' }
      expect(
        (await h.app.request('/api/workflows/wf-ops/deploy-config-preview', preview)).status,
      ).toBe(404)
      expect(
        (await h.app.request('/api/workflows/wf-sales/deploy-config-preview', preview)).status,
      ).not.toBe(404)
      const created = await h.app.request('/api/workflows', {
        ...asSales,
        method: 'POST',
        body: JSON.stringify({ name: 'From the key' }),
      })
      expect(created.status).toBe(201)
      expect((await created.json()).workspaceId).toBe('ws-sales')
      expect(
        (
          await h.app.request('/api/workflows', {
            ...asSales,
            method: 'POST',
            body: JSON.stringify({ name: 'x', workspaceId: 'ws-ops' }),
          })
        ).status,
      ).toBe(404)
      const move = await h.app.request('/api/workspaces/ws-sales/move-workflows', {
        ...asSales,
        method: 'POST',
        body: JSON.stringify({ workflowIds: ['wf-sales'], targetWorkspaceId: 'ws-ops' }),
      })
      expect(move.status).toBe(403)
      expect((await move.json()).error).toMatch(/workspace-level API key cannot manage workspaces/)
      expect(
        (
          await h.app.request('/api/workspaces/ws-sales', {
            ...asSales,
            method: 'PATCH',
            body: JSON.stringify({ name: 'x' }),
          })
        ).status,
      ).toBe(403)
      expect((await h.app.request('/api/env-vars', asSales)).status).toBe(200)
      // Full access on a workspace key sets that workspace's variables (B4);
      // naming the project in the body is refused rather than obeyed.
      const setVar = await h.app.request('/api/env-vars', {
        ...asSales,
        method: 'POST',
        body: JSON.stringify({ name: 'X', value: 'x' }),
      })
      expect(setVar.status).toBe(201)
      expect(await setVar.json()).toMatchObject({ level: 'workspace', workspaceId: 'ws-sales' })
      const inBody = await h.app.request('/api/env-vars', {
        ...asSales,
        method: 'POST',
        body: JSON.stringify({ projectId: 'p-101', name: 'Y', value: 'y' }),
      })
      expect(inBody.status).toBe(400)
      // The project-wide lists are cut to the pin: a deployment and a run in
      // each workspace, and only Sales comes back.
      await h.db.insert(h.schema.deployments).values([
        { id: 'd-sales', workflowId: 'wf-sales', serviceName: 'sales', createdAt: T1 },
        { id: 'd-ops', workflowId: 'wf-ops', serviceName: 'ops', createdAt: T1 },
      ])
      const run = (id: string, workflowId: string) => ({
        id,
        workflowId,
        versionId: null,
        connectionId: null,
        instanceId: id,
        status: 'complete',
        createdAt: T1,
        updatedAt: T1,
      })
      await h.db
        .insert(h.schema.workflowRuns)
        .values([run('r-sales', 'wf-sales'), run('r-ops', 'wf-ops')])
      const deployments = await (await h.app.request('/api/deployments', asSales)).json()
      expect(deployments.data.map((d: { id: string }) => d.id)).toEqual(['d-sales'])
      const runs = await (await h.app.request('/api/runs', asSales)).json()
      expect(runs.data.map((r: { id: string }) => r.id)).toEqual(['r-sales'])
      // A Viewer's workspace key keeps the Viewer's floor, whatever its grid.
      const asViewer = await h.seed.key(
        'k-eve',
        'u-eve',
        { level: 'workspace', projectId: 'p-101', workspaceId: 'ws-sales' },
        full('workspace'),
      )
      const edit = await h.app.request('/api/workflows/wf-sales', {
        ...asViewer,
        method: 'PATCH',
        body: JSON.stringify({ name: 'x' }),
      })
      expect(edit.status).toBe(403)
      expect((await edit.json()).error).toBe(ACCESS_REASONS.needsEditor)
    })
  })

  it('lets a key create a workspace but not choose its people', async () => {
    const asAma = await key('k-ama', 'u-ama', 'p-101')
    const withPeople = await h.app.request('/api/workspaces', {
      ...asAma,
      method: 'POST',
      body: JSON.stringify({ name: 'By key', members: [{ userId: 'u-fay', role: 'editor' }] }),
    })
    expect(withPeople.status).toBe(403)
    expect((await withPeople.json()).error).toMatch(/cannot add people/)
    const plain = await h.app.request('/api/workspaces', {
      ...asAma,
      method: 'POST',
      body: JSON.stringify({ name: 'By key' }),
    })
    expect(plain.status).toBe(201)
  })

  it('pins a workspace-only creator’s key to that workspace, as a Viewer', async () => {
    const asEve = await key('k-eve', 'u-eve', 'p-101')
    expect((await h.app.request('/api/workflows/wf-sales', asEve)).status).toBe(200)
    expect((await h.app.request('/api/workflows/wf-ops', asEve)).status).toBe(404)
    const edit = await h.app.request('/api/workflows/wf-sales', {
      ...asEve,
      method: 'PATCH',
      body: JSON.stringify({ name: 'x' }),
    })
    expect(edit.status).toBe(403)
    expect((await edit.json()).error).toBe(ACCESS_REASONS.needsEditor)
    const list = await (await h.app.request('/api/workflows', asEve)).json()
    expect(list.data.map((w: { id: string }) => w.id)).toEqual(['wf-sales'])
  })
})

describe('local dev', () => {
  it('is building: a Viewer may read its logs but not start, stop or trigger it', async () => {
    const h = createSqliteApp({ enableLocalDev: true })
    await seedAcme(h)
    const start = await h.app.request(
      '/api/workflows/wf-sales/local-dev/start?projectId=p-101',
      h.as('u-eve', h.json({})),
    )
    expect(start.status).toBe(403)
    expect((await start.json()).error).toBe(ACCESS_REASONS.needsEditor)
    expect(
      (
        await h.app.request(
          '/api/workflows/wf-sales/local-dev/stop?projectId=p-101',
          h.as('u-eve', { method: 'POST' }),
        )
      ).status,
    ).toBe(403)
    expect(
      (await h.app.request('/api/workflows/wf-sales/local-dev/logs?projectId=p-101', h.as('u-eve')))
        .status,
    ).not.toBe(403)
  })
})

describe('variables at three levels', () => {
  let h: SqliteApp
  beforeEach(async () => {
    h = createSqliteApp()
    await seedAcme(h)
  })

  const ORG = 'org=acme'
  const P101 = 'org=acme&project=project-101'
  const P202 = 'org=acme&project=project-202'
  const SALES = 'org=acme&project=project-101&workspace=sales'
  const OPS = 'org=acme&project=project-101&workspace=ops'

  const set = (as: string, at: string, body: Record<string, unknown>) =>
    h.app.request(`/api/env-vars?${at}`, h.as(as, h.json(body)))
  const list = async (as: string, at: string, path = '') =>
    (await h.app.request(`/api/env-vars${path}?${at}`, h.as(as))).json()
  const created = async (as: string, at: string, name: string, value = 'x', isSecret = false) => {
    const res = await set(as, at, { name, value, isSecret })
    expect(res.status, `${name} at ${at}`).toBe(201)
    return (await res.json()) as { id: string }
  }

  it('are set by whoever manages the addressed level, with the dashboard’s reason otherwise', async () => {
    // The organization: owners and admins. Dan is a plain member.
    const byMember = await set('u-dan', ORG, { name: 'REGION', value: 'eu' })
    expect(byMember.status).toBe(403)
    expect((await byMember.json()).error).toBe(ACCESS_REASONS.orgAdmins)
    const byAdmin = await set('u-ben', ORG, { name: 'REGION', value: 'eu' })
    expect(byAdmin.status).toBe(201)
    expect(await byAdmin.json()).toMatchObject({
      level: 'organization',
      projectId: null,
      workspaceId: null,
      value: 'eu',
    })
    // A project: its admins (org owners and admins included). Dan is a project member.
    const byProjectMember = await set('u-dan', P101, { name: 'API_URL', value: 'x' })
    expect(byProjectMember.status).toBe(403)
    expect((await byProjectMember.json()).error).toBe(ACCESS_REASONS.projectAdmins)
    expect((await set('u-ama', P101, { name: 'API_URL', value: 'x' })).status).toBe(201)
    // A workspace: its admins. Gus is an Editor in Ops; Eve a Viewer in Sales.
    const byEditor = await set('u-gus', OPS, { name: 'TOKEN', value: 't', isSecret: true })
    expect(byEditor.status).toBe(403)
    expect((await byEditor.json()).error).toBe(ACCESS_REASONS.workspaceAdmins)
    expect((await set('u-eve', SALES, { name: 'TOKEN', value: 't' })).status).toBe(403)
    await h.seed.workspaceGrant('ws-sales', 'u-dan', 'admin')
    const byWorkspaceAdmin = await set('u-dan', SALES, { name: 'REGION', value: 'apac' })
    expect(byWorkspaceAdmin.status).toBe(201)
    expect(await byWorkspaceAdmin.json()).toMatchObject({
      level: 'workspace',
      projectId: 'p-101',
      workspaceId: 'ws-sales',
    })
    // A place the caller cannot open is not found; a level in the body is refused.
    expect((await set('u-fay', P101, { name: 'X', value: 'x' })).status).toBe(404)
    expect((await set('u-eve', OPS, { name: 'X', value: 'x' })).status).toBe(404)
    const inBody = await set('u-ama', ORG, { name: 'X', value: 'x', projectId: 'p-101' })
    expect(inBody.status).toBe(400)
    expect((await inBody.json()).error).toMatch(/Address the level in the query/)
  })

  it('refuses a name already set at the level, and allows it at another', async () => {
    await created('u-ama', ORG, 'REGION', 'eu')
    const again = await set('u-ama', ORG, { name: 'REGION', value: 'us' })
    expect(again.status).toBe(409)
    expect(await again.json()).toEqual({
      error: 'REGION is already set here. Edit it instead',
      details: [{ path: 'name', message: 'Already set here. Edit it instead' }],
    })
    expect((await set('u-ama', P101, { name: 'REGION', value: 'us' })).status).toBe(201)
    expect((await set('u-ama', SALES, { name: 'REGION', value: 'apac' })).status).toBe(201)
    expect((await set('u-ama', SALES, { name: 'REGION', value: 'again' })).status).toBe(409)
  })

  it('edits and deletes a row only where it is addressed, by whoever manages that level', async () => {
    const orgRow = await created('u-ama', ORG, 'REGION', 'eu')
    const projectRow = await created('u-ama', P101, 'API_URL')
    const salesRow = await created('u-ama', SALES, 'REGION', 'apac')
    const patch = (as: string, id: string, at: string, body: Record<string, unknown>) =>
      h.app.request(`/api/env-vars/${id}?${at}`, h.as(as, h.json(body, 'PATCH')))
    const remove = (as: string, id: string, at: string) =>
      h.app.request(`/api/env-vars/${id}?${at}`, h.as(as, { method: 'DELETE' }))
    // The org row addressed at the project, the Sales row at the project or at Ops: not there.
    expect((await patch('u-ama', orgRow.id, P101, { value: 'x' })).status).toBe(404)
    expect((await patch('u-ama', salesRow.id, P101, { value: 'x' })).status).toBe(404)
    expect((await patch('u-ama', salesRow.id, OPS, { value: 'x' })).status).toBe(404)
    expect((await remove('u-ama', projectRow.id, ORG)).status).toBe(404)
    // The role at the addressed level, before the row is looked for.
    const byMember = await patch('u-dan', projectRow.id, P101, { value: 'x' })
    expect(byMember.status).toBe(403)
    expect((await byMember.json()).error).toBe(ACCESS_REASONS.projectAdmins)
    expect((await remove('u-gus', orgRow.id, ORG)).status).toBe(403)
    // Addressed right, by someone who manages it.
    const edited = await patch('u-ben', orgRow.id, ORG, { value: 'eu-west' })
    expect(edited.status).toBe(200)
    expect(await edited.json()).toMatchObject({ value: 'eu-west', level: 'organization' })
    expect((await remove('u-ama', salesRow.id, SALES)).status).toBe(200)
    expect((await remove('u-ama', salesRow.id, SALES)).status).toBe(404)
    // A rename into a taken name is the same refusal as a create.
    await created('u-ama', P101, 'OTHER')
    const renamed = await patch('u-ama', projectRow.id, P101, { name: 'OTHER' })
    expect(renamed.status).toBe(409)
  })

  it('lists each level’s own rows, the organization’s with how many projects the viewer can open override them', async () => {
    await created('u-ama', ORG, 'REGION', 'eu')
    await created('u-ama', ORG, 'LOG_LEVEL', 'info')
    await created('u-ama', P202, 'REGION', 'us')
    await created('u-ama', SALES, 'REGION', 'apac')
    await created('u-ama', OPS, 'TOKEN', 'hidden', true)
    const forAma = await list('u-ama', ORG)
    expect(
      Object.fromEntries(
        forAma.data.map((v: { name: string; overriddenIn: number }) => [v.name, v.overriddenIn]),
      ),
    ).toEqual({ REGION: 2, LOG_LEVEL: 0 })
    // Eve opens Project 101 (Sales), not Project 202; Fay opens no project.
    const forEve = await list('u-eve', ORG)
    expect(forEve.data.find((v: { name: string }) => v.name === 'REGION').overriddenIn).toBe(1)
    const forFay = await list('u-fay', ORG)
    expect(forFay.data.find((v: { name: string }) => v.name === 'REGION').overriddenIn).toBe(0)
    expect((await list('u-ama', P101)).data).toEqual([])
    expect((await list('u-ama', P202)).data.map((v: { value: string }) => v.value)).toEqual(['us'])
    expect((await list('u-ama', SALES)).data.map((v: { value: string }) => v.value)).toEqual([
      'apac',
    ])
    const ops = await list('u-gus', OPS)
    expect(ops.data).toMatchObject([{ name: 'TOKEN', isSecret: true, value: '••••••••' }])
  })

  it('answers each level’s resolved view: project over org, then the closest level winning', async () => {
    await created('u-ama', ORG, 'REGION', 'eu')
    await created('u-ama', ORG, 'LOG_LEVEL', 'info')
    await created('u-ama', P101, 'API_URL', 'https://101.test')
    await created('u-ama', P202, 'REGION', 'us')
    await created('u-ama', SALES, 'REGION', 'apac')
    const project = await list('u-ama', P101, '/resolved')
    expect(
      project.data.map(
        (v: {
          name: string
          value: string
          setAt: { level: string; name: string }
          overriddenIn: { slug: string }[]
        }) => [v.name, v.value, v.setAt.level, v.setAt.name, v.overriddenIn.map((w) => w.slug)],
      ),
    ).toEqual([
      ['API_URL', 'https://101.test', 'project', 'Project 101', []],
      ['LOG_LEVEL', 'info', 'organization', 'Acme', []],
      ['REGION', 'eu', 'organization', 'Acme', ['sales']],
    ])
    // Gus opens Ops only: Sales's override is not his to see.
    const forGus = await list('u-gus', P101, '/resolved')
    expect(forGus.data.find((v: { name: string }) => v.name === 'REGION').overriddenIn).toEqual([])
    const other = await list('u-ama', P202, '/resolved')
    expect(other.data.map((v: { name: string; value: string }) => [v.name, v.value])).toEqual([
      ['REGION', 'us'],
      ['LOG_LEVEL', 'info'],
    ])
    const sales = await list('u-eve', SALES, '/resolved')
    expect(
      sales.data.map(
        (v: {
          name: string
          value: string
          source: { level: string; name: string }
          overrides: string | null
        }) => [v.name, v.value, v.source.level, v.source.name, v.overrides],
      ),
    ).toEqual([
      ['REGION', 'apac', 'workspace', 'Sales', 'organization'],
      ['API_URL', 'https://101.test', 'project', 'Project 101', null],
      ['LOG_LEVEL', 'info', 'organization', 'Acme', null],
    ])
    const ops = await list('u-gus', OPS, '/resolved')
    expect(ops.data.map((v: { name: string; value: string }) => [v.name, v.value])).toEqual([
      ['API_URL', 'https://101.test'],
      ['LOG_LEVEL', 'info'],
      ['REGION', 'eu'],
    ])
    const atOrg = await h.app.request('/api/env-vars/resolved?org=acme', h.as('u-ama'))
    expect(atOrg.status).toBe(400)
  })

  it('reach keys at their level, with the creator’s standing as the floor', async () => {
    await created('u-ama', ORG, 'REGION', 'eu')
    const opsRow = await created('u-ama', OPS, 'TOKEN', 't', true)
    const full = presetPermissions('workspace', 'full')
    const asSales = await h.seed.key(
      'k-sales',
      'u-ama',
      { level: 'workspace', projectId: 'p-101', workspaceId: 'ws-sales' },
      full,
    )
    const setBySales = await h.app.request('/api/env-vars', {
      ...asSales,
      method: 'POST',
      body: JSON.stringify({ name: 'REGION', value: 'apac' }),
    })
    expect(setBySales.status).toBe(201)
    expect(await setBySales.json()).toMatchObject({ level: 'workspace', workspaceId: 'ws-sales' })
    expect(
      (
        await h.app.request(`/api/env-vars/${opsRow.id}`, {
          ...asSales,
          method: 'PATCH',
          body: JSON.stringify({ value: 'x' }),
        })
      ).status,
    ).toBe(404)
    const resolved = await (await h.app.request('/api/env-vars/resolved', asSales)).json()
    expect(
      resolved.data.map((v: { name: string; value: string; overrides: string | null }) => [
        v.name,
        v.value,
        v.overrides,
      ]),
    ).toEqual([['REGION', 'apac', 'organization']])
    // Gus is an Editor in Ops: his key holds the cell, he does not manage the workspace.
    const asGus = await h.seed.key(
      'k-gus',
      'u-gus',
      { level: 'workspace', projectId: 'p-101', workspaceId: 'ws-ops' },
      full,
    )
    const byGus = await h.app.request('/api/env-vars', {
      ...asGus,
      method: 'POST',
      body: JSON.stringify({ name: 'X', value: 'x' }),
    })
    expect(byGus.status).toBe(403)
    expect((await byGus.json()).error).toBe(ACCESS_REASONS.workspaceAdmins)
    // A project key reads its project's own rows, and resolves a workspace it names.
    const asProject = await h.seed.key(
      'k-p101',
      'u-ama',
      { level: 'project', projectId: 'p-101' },
      presetPermissions('project', 'read'),
    )
    expect((await (await h.app.request('/api/env-vars', asProject)).json()).data).toEqual([])
    const opsView = await (
      await h.app.request('/api/env-vars/resolved?workspace=ops', asProject)
    ).json()
    expect(opsView.data.map((v: { name: string; value: string }) => [v.name, v.value])).toEqual([
      ['TOKEN', '••••••••'],
      ['REGION', 'eu'],
    ])
    const readOnly = await h.app.request('/api/env-vars', {
      ...asProject,
      method: 'POST',
      body: JSON.stringify({ name: 'X', value: 'x' }),
    })
    expect(readOnly.status).toBe(403)
    expect((await readOnly.json()).error).toBe('API key lacks permission: variables:write')
  })

  it('keeps a project’s variables, its workspaces’ included, when the project moves to another organization', async () => {
    await created('u-ama', P101, 'API_URL')
    await created('u-ama', SALES, 'REGION', 'apac')
    // Ama must run Globex too: the move is an owner's or admin's act in both.
    await h.db
      .update(h.schema.member)
      .set({ role: 'admin' })
      .where(
        and(eq(h.schema.member.userId, 'u-ama'), eq(h.schema.member.organizationId, 'org-globex')),
      )
    const moved = await h.app.request(
      '/api/projects/p-101/move?org=acme',
      h.as('u-ama', h.json({ organizationId: 'org-globex' })),
    )
    expect(moved.status).toBe(200)
    const there = await list('u-ama', 'org=globex&project=project-101')
    expect(there.data.map((v: { name: string }) => v.name)).toEqual(['API_URL'])
    const sales = await list('u-ama', 'org=globex&project=project-101&workspace=sales')
    expect(sales.data.map((v: { value: string }) => v.value)).toEqual(['apac'])
    expect((await h.app.request(`/api/env-vars?${P101}`, h.as('u-ama'))).status).toBe(404)
    // Its workflows resolve there too.
    const resolved = await list(
      'u-ama',
      'org=globex&project=project-101&workspace=sales',
      '/resolved',
    )
    expect(resolved.data.map((v: { name: string }) => v.name)).toEqual(['REGION', 'API_URL'])
  })

  it('tells the un-hide refusal from a miss at every level, and refuses a level in the body', async () => {
    const projectRow = await created('u-ama', P101, 'TOKEN', 't', true)
    const salesRow = await created('u-ama', SALES, 'TOKEN', 't', true)
    const flip = (id: string, at: string) =>
      h.app.request(
        `/api/env-vars/${id}?${at}`,
        h.as('u-ama', h.json({ isSecret: false }, 'PATCH')),
      )
    for (const [id, at] of [
      [projectRow.id, P101],
      [salesRow.id, SALES],
    ] as const) {
      const refused = await flip(id, at)
      expect(refused.status).toBe(422)
      const body = (await refused.json()) as { details: { path: string }[] }
      expect(body.details[0]!.path).toBe('value')
      expect(JSON.stringify(body)).not.toContain("'t'")
    }
    // Addressed where the row is not, the same request is a miss.
    expect((await flip(projectRow.id, SALES)).status).toBe(404)
    expect((await flip(salesRow.id, P101)).status).toBe(404)
    const inBody = await set('u-ama', P101, { name: 'X', value: 'x', workspaceId: 'ws-sales' })
    expect(inBody.status).toBe(400)
  })
})
