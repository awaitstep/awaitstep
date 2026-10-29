import { describe, it, expect, beforeEach } from 'vitest'
import { eq } from 'drizzle-orm'
import { createSqliteApp, seedAcme, type SqliteApp } from './sqlite-app.js'

// Inviting people and answering an invite, through the API on a real database.

describe('/api/invitations', () => {
  let h: SqliteApp
  beforeEach(async () => {
    h = createSqliteApp()
    await seedAcme(h)
  })

  const send = (body: unknown, as = 'u-ama') =>
    h.app.request('/api/invitations?org=acme', h.as(as, h.json(body)))

  const twoPlaces = {
    emails: ['Hal@example.test', 'new@example.test'],
    role: 'member',
    places: [
      { projectId: 'p-101', workspaceId: 'ws-sales', role: 'editor' },
      { projectId: 'p-202', workspaceId: null, role: 'member' },
    ],
  }

  it('sends one invitation per address, with an email each, for org owners and admins', async () => {
    const res = await send(twoPlaces)
    expect(res.status).toBe(201)
    const { data } = await res.json()
    expect(data.map((i: { email: string }) => i.email)).toEqual([
      'hal@example.test',
      'new@example.test',
    ])
    expect(h.sent.invitations).toHaveLength(2)
    expect(h.sent.invitations[0]).toMatchObject({
      to: 'hal@example.test',
      url: `http://web.test/invite/${data[0].id}`,
      orgName: 'Acme',
      inviterName: 'Ama Mensah',
      role: 'member',
      place: 'Sales in Project 101 (Editor)',
    })
    expect(Date.parse(h.sent.invitations[0]!.expiresAt) - Date.now()).toBeGreaterThan(
      6.9 * 24 * 3600 * 1000,
    )

    const list = await (await h.app.request('/api/invitations?org=acme', h.as('u-ama'))).json()
    expect(list.data).toHaveLength(2)
    expect(list.data[0]).toMatchObject({
      role: 'member',
      invitedBy: { id: 'u-ama', name: 'Ama Mensah' },
      askedForNewAt: null,
    })
    expect(list.data[0].places).toEqual([
      { kind: 'workspace', project: 'Project 101', workspace: 'Sales', role: 'editor' },
      { kind: 'project', project: 'Project 202', workspace: null, role: 'member' },
    ])
    // A plain member neither lists nor sends: the list's ids are the links.
    expect((await h.app.request('/api/invitations?org=acme', h.as('u-eve'))).status).toBe(403)
    expect((await send(twoPlaces, 'u-dan')).status).toBe(403)
  })

  it('refuses an address already in the org or already invited, a bad place, and a bad address', async () => {
    const member = await send({ emails: ['dan@acme.test'], role: 'member', places: [] })
    expect(member.status).toBe(409)
    expect(await member.json()).toMatchObject({
      error: 'dan@acme.test is already in the organization',
      field: 'emails',
    })
    await send({ emails: ['hal@example.test'], role: 'member', places: [] })
    const again = await send({ emails: ['HAL@example.test'], role: 'member', places: [] })
    expect(again.status).toBe(409)
    expect((await again.json()).error).toMatch(/already invited/)
    const notEmail = await send({ emails: ['nope'], role: 'member', places: [] })
    expect(notEmail.status).toBe(422)
    const wrongRole = await send({
      emails: ['x@example.test'],
      role: 'member',
      places: [{ projectId: 'p-101', workspaceId: null, role: 'editor' }],
    })
    expect(wrongRole.status).toBe(422)
    const elsewhere = await send({
      emails: ['x@example.test'],
      role: 'member',
      places: [{ projectId: 'p-g', workspaceId: null, role: 'member' }],
    })
    expect(elsewhere.status).toBe(404)
  })

  it('refuses a place named twice, or a workspace place a project-wide one already covers', async () => {
    const twice = await send({
      emails: ['x@example.test'],
      role: 'member',
      places: [
        { projectId: 'p-101', workspaceId: 'ws-sales', role: 'editor' },
        { projectId: 'p-101', workspaceId: 'ws-sales', role: 'viewer' },
      ],
    })
    expect(twice.status).toBe(422)
    expect((await twice.json()).details[0].message).toMatch(/named twice/)
    const covered = await send({
      emails: ['x@example.test'],
      role: 'member',
      places: [
        { projectId: 'p-101', workspaceId: null, role: 'member' },
        { projectId: 'p-101', workspaceId: 'ws-sales', role: 'editor' },
      ],
    })
    expect(covered.status).toBe(422)
    expect((await covered.json()).details[0].message).toMatch(/already gives editor access/)
    const raised = await send({
      emails: ['x@example.test'],
      role: 'member',
      places: [
        { projectId: 'p-101', workspaceId: null, role: 'member' },
        { projectId: 'p-101', workspaceId: 'ws-sales', role: 'admin' },
      ],
    })
    expect(raised.status).toBe(201)
  })

  describe('the invite page', () => {
    let id: string
    beforeEach(async () => {
      const res = await send(twoPlaces)
      id = (await res.json()).data[0].id
    })

    it('shows the open invite to its address, the wrong-account card to anyone else, and nothing for a bad token', async () => {
      const open = await (await h.app.request(`/api/invitations/${id}`, h.as('u-hal'))).json()
      expect(open).toMatchObject({
        state: 'open',
        viewerEmail: 'hal@example.test',
        invite: {
          token: id,
          org: { name: 'Acme', slug: 'acme' },
          invitedBy: { id: 'u-ama', name: 'Ama Mensah', email: 'ama@acme.test' },
          email: 'hal@example.test',
          orgRole: 'member',
          place: { kind: 'workspace', name: 'Sales', projectName: 'Project 101', role: 'editor' },
        },
      })
      // Someone else's session sees the card, but not where the invite leads.
      const wrong = await (await h.app.request(`/api/invitations/${id}`, h.as('u-dan'))).json()
      expect(wrong).toMatchObject({
        state: 'wrong-account',
        viewerEmail: 'dan@acme.test',
        invite: { email: 'hal@example.test', place: null },
      })
      expect(await (await h.app.request('/api/invitations/nope', h.as('u-hal'))).json()).toEqual({
        state: 'gone',
      })
      expect((await h.app.request(`/api/invitations/${id}`)).status).toBe(401)
    })

    it('accepts: joins the org with the role and places, and says where to land', async () => {
      const res = await h.app.request(
        `/api/invitations/${id}/accept`,
        h.as('u-hal', { method: 'POST' }),
      )
      expect(res.status).toBe(200)
      expect(await res.json()).toEqual({ org: 'acme', project: 'project-101', workspace: 'sales' })
      const orgs = await (await h.app.request('/api/orgs', h.as('u-hal'))).json()
      expect(
        orgs.data.map((o: { slug: string; role: string; projectCount: number }) => [
          o.slug,
          o.role,
          o.projectCount,
        ]),
      ).toEqual([['acme', 'member', 2]])
      const sales = await (
        await h.app.request(
          '/api/scope?org=acme&project=project-101&workspace=sales',
          h.as('u-hal'),
        )
      ).json()
      expect(sales.workspace.viewerRole).toBe('editor')
      const p202 = await (
        await h.app.request('/api/scope?org=acme&project=project-202', h.as('u-hal'))
      ).json()
      expect(p202.project.viewerRole).toBe('member')
      expect(await (await h.app.request(`/api/invitations/${id}`, h.as('u-hal'))).json()).toEqual({
        state: 'gone',
      })
      expect(
        (await h.app.request(`/api/invitations/${id}/accept`, h.as('u-hal', { method: 'POST' })))
          .status,
      ).toBe(404)
      expect(
        (await (await h.app.request('/api/invitations?org=acme', h.as('u-ama'))).json()).data.map(
          (i: { email: string }) => i.email,
        ),
      ).toEqual(['new@example.test'])
    })

    it('refuses the wrong account on every answer', async () => {
      for (const action of ['accept', 'decline', 'undo-decline', 'ask-again']) {
        const res = await h.app.request(
          `/api/invitations/${id}/${action}`,
          h.as('u-dan', { method: 'POST' }),
        )
        expect(res.status, action).toBe(403)
        expect((await res.json()).error).toBe('This invite is for hal@example.test')
      }
    })

    it('declines with undo, and tells the inviter nothing until B8', async () => {
      expect(
        (await h.app.request(`/api/invitations/${id}/decline`, h.as('u-hal', { method: 'POST' })))
          .status,
      ).toBe(200)
      expect(
        (await (await h.app.request(`/api/invitations/${id}`, h.as('u-hal'))).json()).state,
      ).toBe('declined')
      expect(
        (await h.app.request(`/api/invitations/${id}/accept`, h.as('u-hal', { method: 'POST' })))
          .status,
      ).toBe(409)
      // A declined invite is not waiting on anyone.
      const list = await (await h.app.request('/api/invitations?org=acme', h.as('u-ama'))).json()
      expect(list.data.map((i: { email: string }) => i.email)).toEqual(['new@example.test'])
      expect(
        (
          await h.app.request(
            `/api/invitations/${id}/undo-decline`,
            h.as('u-hal', { method: 'POST' }),
          )
        ).status,
      ).toBe(200)
      expect(
        (await (await h.app.request(`/api/invitations/${id}`, h.as('u-hal'))).json()).state,
      ).toBe('open')
    })

    it('expires after a week: ask again once (an email to the inviter), and resend reopens it', async () => {
      await h.db
        .update(h.schema.invitation)
        .set({ expiresAt: '2026-01-01T00:00:00.000Z' })
        .where(eq(h.schema.invitation.id, id))
      const expired = await (await h.app.request(`/api/invitations/${id}`, h.as('u-hal'))).json()
      expect(expired).toMatchObject({ state: 'expired', askedForNew: false })
      expect(
        (await h.app.request(`/api/invitations/${id}/accept`, h.as('u-hal', { method: 'POST' })))
          .status,
      ).toBe(410)

      const ask = await h.app.request(
        `/api/invitations/${id}/ask-again`,
        h.as('u-hal', { method: 'POST' }),
      )
      expect(await ask.json()).toEqual({ ok: true, asked: true })
      expect(h.sent.requests).toEqual([
        {
          to: 'ama@acme.test',
          url: 'http://web.test/acme/settings/members',
          orgName: 'Acme',
          askerEmail: 'hal@example.test',
        },
      ])
      const askAgain = await h.app.request(
        `/api/invitations/${id}/ask-again`,
        h.as('u-hal', { method: 'POST' }),
      )
      expect(await askAgain.json()).toEqual({ ok: true, asked: false })
      expect(h.sent.requests).toHaveLength(1)
      expect(
        (await (await h.app.request(`/api/invitations/${id}`, h.as('u-hal'))).json()).askedForNew,
      ).toBe(true)
      // The expired invite is not listed as pending until it is resent.
      expect(
        (await (await h.app.request('/api/invitations?org=acme', h.as('u-ama'))).json()).data.map(
          (i: { email: string }) => i.email,
        ),
      ).toEqual(['new@example.test'])

      const resend = await h.app.request(
        `/api/invitations/${id}/resend?org=acme`,
        h.as('u-ama', { method: 'POST' }),
      )
      expect(resend.status).toBe(200)
      expect(h.sent.invitations).toHaveLength(3)
      expect(
        (await (await h.app.request(`/api/invitations/${id}`, h.as('u-hal'))).json()).state,
      ).toBe('open')
      expect(
        (
          await h.app.request(
            `/api/invitations/${id}/resend?org=acme`,
            h.as('u-dan', { method: 'POST' }),
          )
        ).status,
      ).toBe(403)
      expect(
        (
          await h.app.request(
            `/api/invitations/${id}/resend?org=globex`,
            h.as('u-cleo', { method: 'POST' }),
          )
        ).status,
      ).toBe(404)
    })

    it('cancels: the link stops working and the row leaves the list', async () => {
      expect(
        (
          await h.app.request(
            `/api/invitations/${id}?org=acme`,
            h.as('u-dan', { method: 'DELETE' }),
          )
        ).status,
      ).toBe(403)
      expect(
        (
          await h.app.request(
            `/api/invitations/${id}?org=globex`,
            h.as('u-cleo', { method: 'DELETE' }),
          )
        ).status,
      ).toBe(404)
      expect(
        (
          await h.app.request(
            `/api/invitations/${id}?org=acme`,
            h.as('u-ben', { method: 'DELETE' }),
          )
        ).status,
      ).toBe(200)
      expect(await (await h.app.request(`/api/invitations/${id}`, h.as('u-hal'))).json()).toEqual({
        state: 'gone',
      })
      expect(
        (await h.app.request(`/api/invitations/${id}/accept`, h.as('u-hal', { method: 'POST' })))
          .status,
      ).toBe(404)
      expect(
        (await (await h.app.request('/api/invitations?org=acme', h.as('u-ama'))).json()).data,
      ).toHaveLength(1)
      // Already cancelled: said, not repeated.
      const again = await h.app.request(
        `/api/invitations/${id}?org=acme`,
        h.as('u-ben', { method: 'DELETE' }),
      )
      expect(again.status).toBe(409)
      // A declined invite can be cancelled too.
      const other = (await (await h.app.request('/api/invitations?org=acme', h.as('u-ama'))).json())
        .data[0].id
      await h.seed.person('u-new', 'New Person', 'new@example.test')
      expect(
        (
          await h.app.request(
            `/api/invitations/${other}/decline`,
            h.as('u-new', { method: 'POST' }),
          )
        ).status,
      ).toBe(200)
      expect(
        (
          await h.app.request(
            `/api/invitations/${other}?org=acme`,
            h.as('u-ben', { method: 'DELETE' }),
          )
        ).status,
      ).toBe(200)
    })

    it('lists the invites waiting for the session’s address', async () => {
      const mine = await (await h.app.request('/api/me/invitations', h.as('u-hal'))).json()
      expect(mine.data).toEqual([
        {
          token: id,
          org: { name: 'Acme', slug: 'acme', logo: null },
          invitedBy: 'Ama Mensah',
          orgRole: 'member',
          expiresAt: expect.any(String),
        },
      ])
      expect(
        (await (await h.app.request('/api/me/invitations', h.as('u-dan'))).json()).data,
      ).toEqual([])
    })
  })
})
