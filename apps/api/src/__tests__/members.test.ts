import { describe, it, expect, beforeEach } from 'vitest'
import { ACCESS_REASONS } from '@awaitstep/ir'
import { createSqliteApp, seedAcme, type SqliteApp } from './sqlite-app.js'

// The people pages and the access editor, through the API on a real database.

describe('/api/members', () => {
  let h: SqliteApp
  beforeEach(async () => {
    h = createSqliteApp()
    await seedAcme(h)
  })

  it('lists the org’s members with where each can work, as the viewer may see it', async () => {
    const res = await h.app.request('/api/members?org=acme', h.as('u-ama'))
    expect(res.status).toBe(200)
    const { data } = await res.json()
    const byId = Object.fromEntries(data.map((m: { id: string }) => [m.id, m]))
    expect(byId['u-ama']).toMatchObject({ role: 'owner', places: [] })
    expect(byId['u-dan'].places).toEqual([
      {
        project: { id: 'p-101', name: 'Project 101', workspaceCount: 2 },
        workspace: null,
        role: 'member',
      },
    ])
    expect(byId['u-eve'].places).toEqual([
      {
        project: { id: 'p-101', name: 'Project 101', workspaceCount: 2 },
        workspace: { id: 'ws-sales', name: 'Sales' },
        role: 'viewer',
      },
    ])
    expect(byId['u-fay'].places).toEqual([])
    // A member who shares no place sees the org's admins and themselves only.
    const asFay = await (await h.app.request('/api/members?org=acme', h.as('u-fay'))).json()
    expect(asFay.data.map((m: { id: string }) => m.id).sort()).toEqual(['u-fay'])
    expect(asFay.data.every((m: { places: unknown[] }) => m.places.length === 0)).toBe(true)
    // Emails are the org admins' to read. Eve shares Sales with Dan, but is not an admin.
    const asEve = await (await h.app.request('/api/members?org=acme', h.as('u-eve'))).json()
    const eveById = Object.fromEntries(asEve.data.map((m: { id: string }) => [m.id, m]))
    expect(eveById['u-eve']).toMatchObject({ email: 'eve@acme.test' })
    expect(eveById['u-dan']).not.toHaveProperty('email')
    expect(eveById['u-ama']).not.toHaveProperty('email')
    expect(byId['u-dan']).toMatchObject({ email: 'dan@acme.test' })
    expect((await h.app.request('/api/members?org=acme', h.as('u-cleo'))).status).toBe(404)
  })

  it('lists a project’s members in two groups, grants in hidden workspaces left out', async () => {
    const asAma = await (
      await h.app.request('/api/members?org=acme&project=project-101', h.as('u-ama'))
    ).json()
    expect(
      asAma.wholeProject.map((m: { person: { id: string }; role: string }) => [
        m.person.id,
        m.role,
      ]),
    ).toEqual([
      ['u-ama', 'owner'],
      ['u-ben', 'org-admin'],
      ['u-dan', 'project-member'],
    ])
    expect(
      asAma.workspacesOnly.map(
        (m: {
          person: { id: string }
          workspaces: { workspace: { slug: string }; role: string }[]
        }) => [m.person.id, m.workspaces.map((w) => [w.workspace.slug, w.role])],
      ),
    ).toEqual([
      ['u-eve', [['sales', 'viewer']]],
      ['u-gus', [['ops', 'editor']]],
    ])
    const asEve = await (
      await h.app.request('/api/members?org=acme&project=project-101', h.as('u-eve'))
    ).json()
    expect(asEve.workspacesOnly.map((m: { person: { id: string } }) => m.person.id)).toEqual([
      'u-eve',
    ])
    expect(
      (await h.app.request('/api/members?org=acme&project=project-202', h.as('u-eve'))).status,
    ).toBe(404)
  })

  describe('the access editor', () => {
    it('reads one person’s access for org owners and admins only', async () => {
      const res = await h.app.request('/api/members/u-eve/access?org=acme', h.as('u-ben'))
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body).toMatchObject({
        person: { id: 'u-eve', name: 'Eve Park' },
        orgRole: 'member',
        projectRoles: {},
        workspaceRoles: { 'ws-sales': 'viewer' },
      })
      expect(
        body.projects.map((p: { id: string; workspaces: { slug: string }[] }) => [
          p.id,
          p.workspaces.map((w) => w.slug),
        ]),
      ).toEqual([
        ['p-101', ['sales', 'ops']],
        ['p-202', ['default']],
      ])
      const asDan = await h.app.request('/api/members/u-eve/access?org=acme', h.as('u-dan'))
      expect(asDan.status).toBe(403)
      expect((await asDan.json()).error).toBe(ACCESS_REASONS.orgAdmins)
      expect(
        (await h.app.request('/api/members/u-cleo/access?org=acme', h.as('u-ama'))).status,
      ).toBe(404)
    })

    it('saves access: the org role and every row, replaced', async () => {
      const grant = {
        orgRole: 'member',
        projects: [{ projectId: 'p-202', role: 'admin' }],
        workspaces: [{ workspaceId: 'ws-ops', role: 'editor' }],
      }
      const res = await h.app.request(
        '/api/members/u-eve/access?org=acme',
        h.as('u-ben', h.json(grant, 'PUT')),
      )
      expect(res.status).toBe(200)
      const after = await (
        await h.app.request('/api/members/u-eve/access?org=acme', h.as('u-ben'))
      ).json()
      expect(after.projectRoles).toEqual({ 'p-202': 'admin' })
      expect(after.workspaceRoles).toEqual({ 'ws-ops': 'editor' })
      const scope = await (
        await h.app.request('/api/scope?org=acme&project=project-202', h.as('u-eve'))
      ).json()
      expect(scope.project.viewerRole).toBe('admin')
      expect((await h.app.request('/api/workspaces/ws-sales', h.as('u-eve'))).status).toBe(404)

      // An org-wide role drops the rows.
      await h.app.request(
        '/api/members/u-eve/access?org=acme',
        h.as('u-ben', h.json({ ...grant, orgRole: 'admin' }, 'PUT')),
      )
      const admin = await (
        await h.app.request('/api/members/u-eve/access?org=acme', h.as('u-ben'))
      ).json()
      expect(admin).toMatchObject({ orgRole: 'admin', projectRoles: {}, workspaceRoles: {} })
    })

    it('lets only owners make or change owners, and keeps one', async () => {
      const toOwner = { orgRole: 'owner', projects: [], workspaces: [] }
      const byAdmin = await h.app.request(
        '/api/members/u-dan/access?org=acme',
        h.as('u-ben', h.json(toOwner, 'PUT')),
      )
      expect(byAdmin.status).toBe(403)
      expect((await byAdmin.json()).error).toMatch(/Only owners/)
      const demoteOwner = await h.app.request(
        '/api/members/u-ama/access?org=acme',
        h.as('u-ben', h.json({ ...toOwner, orgRole: 'admin' }, 'PUT')),
      )
      expect(demoteOwner.status).toBe(403)
      const byOwner = await h.app.request(
        '/api/members/u-dan/access?org=acme',
        h.as('u-ama', h.json(toOwner, 'PUT')),
      )
      expect(byOwner.status).toBe(200)
      // Ama is no longer the only owner, so she can step down.
      const stepDown = await h.app.request(
        '/api/members/u-ama/access?org=acme',
        h.as('u-ama', h.json({ ...toOwner, orgRole: 'admin' }, 'PUT')),
      )
      expect(stepDown.status).toBe(200)
      // Dan is now the only owner.
      const lastOwner = await h.app.request(
        '/api/members/u-dan/access?org=acme',
        h.as('u-dan', h.json({ ...toOwner, orgRole: 'member' }, 'PUT')),
      )
      expect(lastOwner.status).toBe(409)
      expect((await lastOwner.json()).error).toMatch(/someone else an owner/)
    })

    it('counts a project or workspace named twice once, and skips a workspace row the project covers', async () => {
      const grant = {
        orgRole: 'member',
        projects: [
          { projectId: 'p-101', role: 'admin' },
          { projectId: 'p-101', role: 'member' },
        ],
        workspaces: [
          // Project 101 gives her Editor everywhere: an Editor row there adds nothing, an Admin one counts.
          { workspaceId: 'ws-ops', role: 'editor' },
          { workspaceId: 'ws-sales', role: 'admin' },
        ],
      }
      const res = await h.app.request(
        '/api/members/u-eve/access?org=acme',
        h.as('u-ben', h.json(grant, 'PUT')),
      )
      expect(res.status).toBe(200)
      const after = await (
        await h.app.request('/api/members/u-eve/access?org=acme', h.as('u-ben'))
      ).json()
      expect(after.projectRoles).toEqual({ 'p-101': 'member' })
      expect(after.workspaceRoles).toEqual({ 'ws-sales': 'admin' })
    })

    it('refuses rows naming another organization’s project or workspace, writing nothing', async () => {
      const res = await h.app.request(
        '/api/members/u-eve/access?org=acme',
        h.as(
          'u-ama',
          h.json(
            { orgRole: 'member', projects: [{ projectId: 'p-g', role: 'admin' }], workspaces: [] },
            'PUT',
          ),
        ),
      )
      expect(res.status).toBe(404)
      const after = await (
        await h.app.request('/api/members/u-eve/access?org=acme', h.as('u-ama'))
      ).json()
      expect(after.workspaceRoles).toEqual({ 'ws-sales': 'viewer' })
    })

    it('removes someone from the org with every row of theirs, never the last owner', async () => {
      expect(
        (await h.app.request('/api/members/u-dan?org=acme', h.as('u-ben', { method: 'DELETE' })))
          .status,
      ).toBe(200)
      expect(
        (await h.app.request('/api/members/u-dan/access?org=acme', h.as('u-ben'))).status,
      ).toBe(404)
      expect(await h.adapter.getProjectIfMember('u-dan', { id: 'p-101' })).toBeNull()
      const owner = await h.app.request(
        '/api/members/u-ama?org=acme',
        h.as('u-ben', { method: 'DELETE' }),
      )
      expect(owner.status).toBe(403)
      const self = await h.app.request(
        '/api/members/u-ama?org=acme',
        h.as('u-ama', { method: 'DELETE' }),
      )
      expect(self.status).toBe(409)
      expect(
        (await h.app.request('/api/members/u-dan?org=acme', h.as('u-ben', { method: 'DELETE' })))
          .status,
      ).toBe(404)
    })
  })

  describe('a workspace’s own members', () => {
    it('lists everyone who can open it with their role and where it comes from', async () => {
      const res = await h.app.request('/api/workspaces/ws-sales/members', h.as('u-eve'))
      expect(res.status).toBe(200)
      const { data } = await res.json()
      expect(
        data.map((p: { id: string; role: string; inherited: boolean }) => [
          p.id,
          p.role,
          p.inherited,
        ]),
      ).toEqual([
        ['u-ama', 'admin', true],
        ['u-ben', 'admin', true],
        ['u-dan', 'editor', true],
        ['u-eve', 'viewer', false],
      ])
      expect((await h.app.request('/api/workspaces/ws-ops/members', h.as('u-eve'))).status).toBe(
        404,
      )
    })

    it('adds, changes and removes grants, for workspace admins, with the project’s role as the floor', async () => {
      const add = await h.app.request(
        '/api/workspaces/ws-sales/members',
        h.as('u-ama', h.json({ userId: 'u-fay', role: 'viewer' })),
      )
      expect(add.status).toBe(201)
      expect((await h.app.request('/api/workspaces/ws-sales', h.as('u-fay'))).status).toBe(200)
      const again = await h.app.request(
        '/api/workspaces/ws-sales/members',
        h.as('u-ama', h.json({ userId: 'u-fay', role: 'editor' })),
      )
      expect(again.status).toBe(409)
      expect((await again.json()).error).toMatch(/Already in/)
      const outside = await h.app.request(
        '/api/workspaces/ws-sales/members',
        h.as('u-ama', h.json({ userId: 'u-cleo', role: 'viewer' })),
      )
      expect(outside.status).toBe(409)
      expect((await outside.json()).error).toMatch(/join/)
      const pointless = await h.app.request(
        '/api/workspaces/ws-sales/members',
        h.as('u-ama', h.json({ userId: 'u-dan', role: 'viewer' })),
      )
      expect(pointless.status).toBe(409)
      expect((await pointless.json()).error).toMatch(/already have editor access/)
      const raise = await h.app.request(
        '/api/workspaces/ws-sales/members',
        h.as('u-ama', h.json({ userId: 'u-dan', role: 'admin' })),
      )
      expect(raise.status).toBe(201)

      const change = await h.app.request(
        '/api/workspaces/ws-sales/members/u-fay',
        h.as('u-ama', h.json({ role: 'editor' }, 'PATCH')),
      )
      expect(change.status).toBe(200)
      const lower = await h.app.request(
        '/api/workspaces/ws-sales/members/u-dan',
        h.as('u-ama', h.json({ role: 'viewer' }, 'PATCH')),
      )
      expect(lower.status).toBe(409)
      expect(
        (
          await h.app.request(
            '/api/workspaces/ws-sales/members/u-gus',
            h.as('u-ama', h.json({ role: 'viewer' }, 'PATCH')),
          )
        ).status,
      ).toBe(404)

      // Dan is now a workspace admin: he may manage members too.
      const byDan = await h.app.request(
        '/api/workspaces/ws-sales/members/u-fay',
        h.as('u-dan', { method: 'DELETE' }),
      )
      expect(byDan.status).toBe(200)
      expect((await h.app.request('/api/workspaces/ws-sales', h.as('u-fay'))).status).toBe(404)
      const byEve = await h.app.request(
        '/api/workspaces/ws-sales/members/u-dan',
        h.as('u-eve', { method: 'DELETE' }),
      )
      expect(byEve.status).toBe(403)
    })

    it('moves workflows only into a workspace the caller can open and build in', async () => {
      // Eve runs Sales; Ops is hidden from her.
      await h.adapter.setWorkspaceGrant('ws-sales', 'u-eve', 'admin')
      const move = (as: string) =>
        h.app.request(
          '/api/workspaces/ws-sales/move-workflows',
          h.as(as, h.json({ workflowIds: ['wf-sales'], targetWorkspaceId: 'ws-ops' })),
        )
      expect((await move('u-eve')).status).toBe(404)
      await h.adapter.addWorkspaceMember({
        workspaceId: 'ws-ops',
        userId: 'u-eve',
        role: 'viewer',
        createdBy: 'u-ama',
      })
      const asViewerThere = await move('u-eve')
      expect(asViewerThere.status).toBe(403)
      expect((await asViewerThere.json()).error).toBe(ACCESS_REASONS.needsEditor)
      expect(await (await move('u-ama')).json()).toEqual({ moved: ['wf-sales'] })
    })
  })

  it('creates a workspace with its first people, all of them from the org', async () => {
    const res = await h.app.request(
      '/api/workspaces?projectId=p-101',
      h.as(
        'u-ama',
        h.json({
          name: 'Support',
          members: [
            { userId: 'u-fay', role: 'editor' },
            { userId: 'u-eve', role: 'admin' },
          ],
        }),
      ),
    )
    expect(res.status).toBe(201)
    const { id } = await res.json()
    const people = await (
      await h.app.request(`/api/workspaces/${id}/members`, h.as('u-fay'))
    ).json()
    expect(people.data.map((p: { id: string; role: string }) => [p.id, p.role])).toEqual([
      ['u-ama', 'admin'],
      ['u-ben', 'admin'],
      ['u-dan', 'editor'],
      ['u-eve', 'admin'],
      ['u-fay', 'editor'],
    ])
    const outside = await h.app.request(
      '/api/workspaces?projectId=p-101',
      h.as('u-ama', h.json({ name: 'Nope', members: [{ userId: 'u-cleo', role: 'editor' }] })),
    )
    expect(outside.status).toBe(409)
    expect(await h.adapter.getWorkspaceInProject('p-101', { slug: 'nope' })).toBeNull()
    const taken = await h.app.request(
      '/api/workspaces?projectId=p-101',
      h.as('u-ama', h.json({ name: 'Sales', members: [{ userId: 'u-fay', role: 'editor' }] })),
    )
    expect(taken.status).toBe(409)
  })

  it('moves a project to an org the caller also runs, dropping outsiders’ rows', async () => {
    const byMember = await h.app.request(
      '/api/projects/p-101/move?org=acme',
      h.as('u-ama', h.json({ organizationId: 'org-globex' })),
    )
    // Ama runs Acme but is only a member of Globex.
    expect(byMember.status).toBe(403)
    await h.adapter.setOrgRole('org-globex', 'u-ama', 'admin')
    const moved = await h.app.request(
      '/api/projects/p-101/move?org=acme',
      h.as('u-ama', h.json({ organizationId: 'org-globex' })),
    )
    expect(moved.status).toBe(200)
    expect(
      (await h.app.request('/api/scope?org=globex&project=project-101', h.as('u-cleo'))).status,
    ).toBe(200)
    expect(await h.adapter.getProjectIfMember('u-dan', { id: 'p-101' })).toBeNull()
    // The project carries its organization: moving it "to Globex" again is a no-op refusal.
    expect(
      (
        await h.app.request(
          '/api/projects/p-101/move',
          h.as('u-ama', h.json({ organizationId: 'org-globex' })),
        )
      ).status,
    ).toBe(400)
    // A slug the target already uses refuses the move, and nothing of it happens.
    const app = await (
      await h.app.request(
        '/api/projects?org=acme',
        h.as('u-ama', h.json({ name: 'App', slug: 'app' })),
      )
    ).json()
    await h.adapter.saveAccess(
      'org-acme',
      'u-dan',
      { orgRole: 'member', projects: [{ projectId: app.id, role: 'member' }], workspaces: [] },
      'u-ama',
      { callerIsOwner: true },
    )
    const taken = await h.app.request(
      `/api/projects/${app.id}/move?org=acme`,
      h.as('u-ama', h.json({ organizationId: 'org-globex' })),
    )
    expect(taken.status).toBe(409)
    expect((await taken.json()).error).toMatch(/already uses this URL/)
    expect((await h.app.request('/api/scope?org=acme&project=app', h.as('u-dan'))).status).toBe(200)
  })
})
