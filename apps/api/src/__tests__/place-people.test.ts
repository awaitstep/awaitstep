import { describe, it, expect, beforeEach } from 'vitest'
import { createSqliteApp, seedAcme, type SqliteApp } from './sqlite-app.js'

// Adding people from a project (21a) or a workspace (21b), through the API
// on a real database: its admins add org members and invite new addresses,
// never wider than that place.

describe('adding people from a project or a workspace', () => {
  let h: SqliteApp
  beforeEach(async () => {
    h = createSqliteApp()
    await seedAcme(h)
    // Fay runs Project 202 and is the Sales workspace's admin; neither is an org admin.
    await h.seed.projectGrant('p-202', 'u-fay', 'admin')
    await h.seed.workspaceGrant('ws-sales', 'u-fay', 'admin')
    await h.seed.projectGrant('p-101', 'u-ben', 'admin')
  })

  const invitationIdFor = (email: string) =>
    (h.sqlite.prepare('SELECT id FROM invitation WHERE email = ?').get(email) as { id: string }).id

  const audit = () =>
    h.sqlite
      .prepare(
        'SELECT event, project_id AS projectId, workspace_id AS workspaceId FROM audit_events ORDER BY created_at',
      )
      .all()

  describe('POST /projects/:id/members', () => {
    const add = (projectId: string, body: unknown, as = 'u-fay') =>
      h.app.request(`/api/projects/${projectId}/members`, h.as(as, h.json(body)))

    it('adds an org member to the whole project, once, and records it', async () => {
      const res = await add('p-202', {
        userId: 'u-gus',
        access: { scope: 'project', role: 'member' },
      })
      expect(res.status).toBe(201)
      expect(await res.json()).toEqual({ userId: 'u-gus', scope: 'project', role: 'member' })
      expect(await h.adapter.projectGrantRows('p-202', 'u-gus')).toMatchObject({
        orgRole: 'member',
        projectGrant: 'member',
      })
      expect(audit()).toContainEqual({
        event: 'project_member.add',
        projectId: 'p-202',
        workspaceId: null,
      })

      const again = await add('p-202', {
        userId: 'u-gus',
        access: { scope: 'project', role: 'admin' },
      })
      expect(again.status).toBe(409)
      expect(await again.json()).toEqual({ error: 'Already in this project' })
    })

    it('says why it refused an outsider or an org admin', async () => {
      const outsider = await add('p-202', {
        userId: 'u-cleo',
        access: { scope: 'project', role: 'member' },
      })
      expect(outsider.status).toBe(409)
      expect(await outsider.json()).toEqual({ error: 'They need to join the organization first' })
      const admin = await add('p-202', {
        userId: 'u-ama',
        access: { scope: 'project', role: 'member' },
      })
      expect(admin.status).toBe(409)
      expect((await admin.json()).error).toMatch(/org owner, so they already reach every project/)
    })

    it('grants one role in the workspaces picked, and answers what it wrote', async () => {
      // Eve has Sales already: only Ops is written, and the answer says so.
      const res = await add(
        'p-101',
        {
          userId: 'u-eve',
          access: { scope: 'workspaces', workspaceIds: ['ws-ops', 'ws-sales'], role: 'viewer' },
        },
        'u-ben',
      )
      expect(res.status).toBe(201)
      expect(await res.json()).toEqual({
        userId: 'u-eve',
        scope: 'workspaces',
        role: 'viewer',
        workspaces: [{ id: 'ws-ops', name: 'Ops' }],
      })
      expect(audit()).toContainEqual({
        event: 'workspace_member.add',
        projectId: 'p-101',
        workspaceId: 'ws-ops',
      })
      // Dan's project grant already gives Editor everywhere.
      const dan = await add(
        'p-101',
        {
          userId: 'u-dan',
          access: { scope: 'workspaces', workspaceIds: ['ws-sales'], role: 'viewer' },
        },
        'u-ben',
      )
      expect(dan.status).toBe(409)
      expect(await dan.json()).toEqual({
        error: 'They already have editor access through the project',
      })
    })

    it('answers 404 for a workspace that isn’t the project’s, writing nothing', async () => {
      const res = await add(
        'p-101',
        {
          userId: 'u-fay',
          access: { scope: 'workspaces', workspaceIds: ['ws-ops', 'ws-202'], role: 'editor' },
        },
        'u-ben',
      )
      expect(res.status).toBe(404)
      expect(
        audit().filter((row) => (row as { event: string }).event === 'workspace_member.add'),
      ).toEqual([])
    })

    it('refuses the whole project for someone who already works in some of its workspaces', async () => {
      const res = await add(
        'p-101',
        { userId: 'u-eve', access: { scope: 'project', role: 'member' } },
        'u-ben',
      )
      expect(res.status).toBe(409)
      expect((await res.json()).error).toMatch(/already work in some of its workspaces/)
    })

    it('answers a same-moment duplicate add with the refusal, not a 500', async () => {
      // The other tab's add landed between this statement's check and its write.
      const unique = Object.assign(new Error('UNIQUE constraint failed: project_members'), {})
      h.adapter.addProjectMember = async () => {
        await h.seed.projectGrant('p-202', 'u-gus', 'member')
        throw unique
      }
      const res = await add('p-202', {
        userId: 'u-gus',
        access: { scope: 'project', role: 'member' },
      })
      expect(res.status).toBe(409)
      expect(await res.json()).toEqual({ error: 'Already in this project' })
    })

    it('is a project admin’s only: a project member or workspace admin is refused', async () => {
      const body = { userId: 'u-gus', access: { scope: 'project', role: 'member' } }
      expect((await add('p-101', body, 'u-dan')).status).toBe(403)
      // Fay runs Sales, not Project 101.
      expect((await add('p-101', body, 'u-fay')).status).toBe(403)
      // Gus opens Ops, so Project 101 is found for him, then refused.
      expect((await add('p-101', body, 'u-gus')).status).toBe(403)
      expect((await add('p-g', body, 'u-fay')).status).toBe(404)
    })
  })

  describe('POST /projects/:id/invitations', () => {
    const invite = (projectId: string, body: unknown, as = 'u-fay') =>
      h.app.request(`/api/projects/${projectId}/invitations`, h.as(as, h.json(body)))

    it('invites a new address as an org Member with this project only', async () => {
      const res = await invite('p-202', {
        emails: ['New@example.test'],
        access: { scope: 'project', role: 'member' },
      })
      expect(res.status).toBe(201)
      // A project admin's reply names the addresses, not the invitations (they can't manage those).
      expect(await res.json()).toEqual({ data: [{ email: 'new@example.test' }] })
      const view = await h.adapter.getInvitation(invitationIdFor('new@example.test'))
      expect(view!.invitation.role).toBe('member')
      expect(view!.places.map((p) => [p.projectId, p.workspaceId, p.role])).toEqual([
        ['p-202', null, 'member'],
      ])
      expect(h.sent.invitations).toHaveLength(1)
      expect(audit()).toContainEqual({
        event: 'invitation.create',
        projectId: 'p-202',
        workspaceId: null,
      })
    })

    it('names only this project’s workspaces', async () => {
      const res = await invite(
        'p-101',
        {
          emails: ['new@example.test'],
          access: { scope: 'workspaces', workspaceIds: ['ws-202'], role: 'viewer' },
        },
        'u-ben',
      )
      expect(res.status).toBe(404)
      expect(h.sent.invitations).toHaveLength(0)
    })

    it('refuses someone already in the organization, and a non-admin', async () => {
      const member = await invite('p-202', {
        emails: ['dan@acme.test'],
        access: { scope: 'project', role: 'member' },
      })
      expect(member.status).toBe(409)
      expect(await member.json()).toMatchObject({
        error: 'dan@acme.test is already in the organization',
      })
      const body = { emails: ['x@example.test'], access: { scope: 'project', role: 'member' } }
      expect((await invite('p-101', body, 'u-dan')).status).toBe(403)
    })
  })

  describe('POST /workspaces/:id/invitations', () => {
    const invite = (workspaceId: string, body: unknown, as = 'u-fay') =>
      h.app.request(`/api/workspaces/${workspaceId}/invitations`, h.as(as, h.json(body)))

    it('lets a workspace admin invite a new address into that workspace only', async () => {
      const res = await invite('ws-sales', { emails: ['new@example.test'], role: 'editor' })
      expect(res.status).toBe(201)
      const view = await h.adapter.getInvitation(invitationIdFor('new@example.test'))
      expect(view!.invitation.role).toBe('member')
      expect(view!.places.map((p) => [p.projectId, p.workspaceId, p.role])).toEqual([
        ['p-101', 'ws-sales', 'editor'],
      ])
      expect(h.sent.invitations[0]).toMatchObject({
        to: 'new@example.test',
        place: 'Sales in Project 101 (Editor)',
      })
      expect(audit()).toContainEqual({
        event: 'invitation.create',
        projectId: 'p-101',
        workspaceId: 'ws-sales',
      })
    })

    it('refuses a workspace viewer', async () => {
      expect(
        (await invite('ws-sales', { emails: ['x@example.test'], role: 'viewer' }, 'u-eve')).status,
      ).toBe(403)
    })

    it('never tells a workspace admin who the org has already invited', async () => {
      // An org admin's pending invite: Fay can't list invitations.
      await h.app.request(
        '/api/invitations?org=acme',
        h.as('u-ama', h.json({ emails: ['secret@example.test'], role: 'member', places: [] })),
      )
      const pending = await invite('ws-sales', { emails: ['secret@example.test'], role: 'viewer' })
      const fresh = await invite('ws-sales', { emails: ['new@example.test'], role: 'viewer' })
      // Both answer alike; only the new address gets an invitation and an email.
      expect(pending.status).toBe(201)
      expect(await pending.json()).toEqual({ data: [{ email: 'secret@example.test' }] })
      expect(fresh.status).toBe(201)
      expect(await fresh.json()).toEqual({ data: [{ email: 'new@example.test' }] })
      expect(h.sent.invitations.map((i) => i.to)).toEqual([
        'secret@example.test',
        'new@example.test',
      ])
    })

    it('spends the email budget on an already-invited address too, so a spent budget tells nothing', async () => {
      await h.app.request(
        '/api/invitations?org=acme',
        h.as('u-ama', h.json({ emails: ['secret@example.test'], role: 'member', places: [] })),
      )
      // Spend Fay's hundred an hour on throwaway addresses (twenty a request).
      for (let batch = 0; batch < 5; batch++) {
        const emails = Array.from({ length: 20 }, (_, i) => `t${batch}-${i}@example.test`)
        expect((await invite('ws-sales', { emails, role: 'viewer' })).status).toBe(201)
      }
      const pending = await invite('ws-sales', { emails: ['secret@example.test'], role: 'viewer' })
      const fresh = await invite('ws-sales', { emails: ['other@example.test'], role: 'viewer' })
      expect([pending.status, fresh.status]).toEqual([429, 429])
    })

    it('still tells an org admin an address is already invited', async () => {
      await invite('ws-sales', { emails: ['x@example.test'], role: 'viewer' }, 'u-ama')
      const again = await invite(
        'ws-sales',
        { emails: ['X@example.test'], role: 'viewer' },
        'u-ama',
      )
      expect(again.status).toBe(409)
      expect(await again.json()).toMatchObject({ error: 'x@example.test is already invited' })
    })
  })
})
