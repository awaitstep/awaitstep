import { describe, it, expect, beforeEach } from 'vitest'
import {
  ACCESS_REASONS,
  canSeeProject,
  resolveRoles,
  type OrgRole,
  type ProjectRole,
  type WorkspaceRole,
} from '@awaitstep/ir'
import { createSqliteApp, seedAcme, type SqliteApp } from './sqlite-app.js'
import { hashApiKey } from '../lib/api-key-hash.js'
import { rolesOf } from '../lib/scope-records.js'

// Roles below the organization, through the real API on a real database:
// the SQL role table against the one in @awaitstep/ir, what is hidden, and
// what each role is refused.

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

  async function key(
    id: string,
    createdBy: string,
    projectId: string | null,
    scopes = ['read', 'write', 'deploy'],
  ) {
    const raw = `ask_${id}`
    await h.adapter.createApiKey({
      id,
      organizationId: 'org-acme',
      projectId,
      createdBy,
      name: id,
      keyHash: await hashApiKey(raw),
      keyPrefix: raw.slice(0, 8),
      scopes: JSON.stringify(scopes),
    })
    return { headers: { Authorization: `Bearer ${raw}`, 'Content-Type': 'application/json' } }
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
      '/api/api-keys?org=acme',
      h.as('u-ama', h.json({ name: 'Project key', projectId: 'p-101', scopes: ['read'] })),
    )
    expect(minted.status).toBe(201)
    const set = await h.app.request(
      '/api/env-vars?org=acme',
      h.as('u-ama', h.json({ projectId: 'p-101', name: 'API_URL', value: 'x', isSecret: false })),
    )
    expect(set.status).toBe(201)
    for (const path of [
      '/api/api-keys?org=acme&projectId=p-101',
      '/api/env-vars?org=acme&projectId=p-101',
    ]) {
      const asEve = await (await h.app.request(path, h.as('u-eve'))).json()
      expect(asEve.data, path).toHaveLength(1)
      // Fay is in the organization but can open no project: the project lists nothing to her.
      const asFay = await (await h.app.request(path, h.as('u-fay'))).json()
      expect(asFay.data, path).toEqual([])
    }
  })

  it('never names a hidden project through the organization’s key list, nor mints or sets anything in one', async () => {
    const asAma = (body: unknown) => h.as('u-ama', h.json(body))
    expect(
      (await h.app.request('/api/api-keys?org=acme', asAma({ name: 'Org key', scopes: ['read'] })))
        .status,
    ).toBe(201)
    expect(
      (
        await h.app.request(
          '/api/api-keys?org=acme',
          asAma({ name: 'P202 key', projectId: 'p-202', scopes: ['read'] }),
        )
      ).status,
    ).toBe(201)
    const forEve = await (await h.app.request('/api/api-keys?org=acme', h.as('u-eve'))).json()
    expect(forEve.data.map((k: { projectId: string | null }) => k.projectId)).toEqual([null])
    const forAma = await (await h.app.request('/api/api-keys?org=acme', h.as('u-ama'))).json()
    expect(forAma.data).toHaveLength(2)
    const mint = await h.app.request(
      '/api/api-keys?org=acme',
      h.as('u-eve', h.json({ name: 'x', projectId: 'p-202', scopes: ['read'] })),
    )
    expect(mint.status).toBe(404)
    const set = await h.app.request(
      '/api/env-vars?org=acme',
      h.as('u-eve', h.json({ projectId: 'p-202', name: 'X', value: 'x', isSecret: false })),
    )
    expect(set.status).toBe(404)
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
