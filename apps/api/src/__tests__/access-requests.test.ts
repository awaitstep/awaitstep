import { describe, it, expect, beforeEach } from 'vitest'
import { createSqliteApp, seedAcme, type SqliteApp } from './sqlite-app.js'

// A Viewer's "Ask for edit access", through the API on a real database.

describe('access requests', () => {
  let h: SqliteApp
  beforeEach(async () => {
    h = createSqliteApp()
    await seedAcme(h)
  })

  const ask = (as = 'u-eve') =>
    h.app.request('/api/workspaces/ws-sales/access-requests', h.as(as, { method: 'POST' }))

  it('lets a Viewer ask once, addressed to the first admin by name', async () => {
    expect(
      await (await h.app.request('/api/workspaces/ws-sales/access-request', h.as('u-eve'))).json(),
    ).toBeNull()
    const res = await ask()
    expect(res.status).toBe(201)
    const request = await res.json()
    expect(request).toMatchObject({
      workspaceId: 'ws-sales',
      from: { id: 'u-eve', name: 'Eve Park' },
      to: { id: 'u-ama', name: 'Ama Mensah' },
      status: 'pending',
    })
    const again = await ask()
    expect(again.status).toBe(200)
    expect((await again.json()).id).toBe(request.id)
    expect(
      (await (await h.app.request('/api/workspaces/ws-sales/access-request', h.as('u-eve'))).json())
        .id,
    ).toBe(request.id)
    // An Editor has nothing to ask for; a stranger finds no workspace.
    expect((await ask('u-dan')).status).toBe(400)
    expect((await ask('u-fay')).status).toBe(404)
  })

  it('is approved or declined by someone who may manage the workspace’s members', async () => {
    const { id } = await (await ask()).json()
    const byDan = await h.app.request(
      `/api/access-requests/${id}/approve`,
      h.as('u-dan', { method: 'POST' }),
    )
    expect(byDan.status).toBe(403)
    const byStranger = await h.app.request(
      `/api/access-requests/${id}/approve`,
      h.as('u-cleo', { method: 'POST' }),
    )
    expect(byStranger.status).toBe(404)
    const byBen = await h.app.request(
      `/api/access-requests/${id}/approve`,
      h.as('u-ben', { method: 'POST' }),
    )
    expect(byBen.status).toBe(200)
    expect(await byBen.json()).toEqual({ ok: true, alreadyEditing: false })
    const scope = await (
      await h.app.request('/api/scope?org=acme&project=project-101&workspace=sales', h.as('u-eve'))
    ).json()
    expect(scope.workspace.viewerRole).toBe('editor')
    expect(
      await (await h.app.request('/api/workspaces/ws-sales/access-request', h.as('u-eve'))).json(),
    ).toBeNull()
    expect(
      (await h.app.request(`/api/access-requests/${id}/decline`, h.as('u-ben', { method: 'POST' })))
        .status,
    ).toBe(409)
    // Who may decide is settled before the request's state is told: an Editor hears 403, a stranger 404, either way nothing about the request.
    expect(
      (await h.app.request(`/api/access-requests/${id}/decline`, h.as('u-dan', { method: 'POST' })))
        .status,
    ).toBe(403)
    expect(
      (
        await h.app.request(
          `/api/access-requests/${id}/decline`,
          h.as('u-cleo', { method: 'POST' }),
        )
      ).status,
    ).toBe(404)
  })

  it('never lowers someone raised to Admin while their request waited', async () => {
    const { id } = await (await ask()).json()
    await h.adapter.setWorkspaceGrant('ws-sales', 'u-eve', 'admin')
    const res = await h.app.request(
      `/api/access-requests/${id}/approve`,
      h.as('u-ama', { method: 'POST' }),
    )
    expect(await res.json()).toEqual({ ok: true, alreadyEditing: true })
    const scope = await (
      await h.app.request('/api/scope?org=acme&project=project-101&workspace=sales', h.as('u-eve'))
    ).json()
    expect(scope.workspace.viewerRole).toBe('admin')
  })

  it('records an approval that changed nothing when they could already edit', async () => {
    const { id } = await (await ask()).json()
    await h.adapter.setWorkspaceGrant('ws-sales', 'u-eve', 'editor')
    const res = await h.app.request(
      `/api/access-requests/${id}/approve`,
      h.as('u-ama', { method: 'POST' }),
    )
    expect(await res.json()).toEqual({ ok: true, alreadyEditing: true })
    // Raised meanwhile, they have nothing left to ask for.
    expect((await ask()).status).toBe(400)
  })

  it('lets a declined Viewer ask again, as a new request', async () => {
    const { id } = await (await ask()).json()
    expect(
      (await h.app.request(`/api/access-requests/${id}/decline`, h.as('u-ama', { method: 'POST' })))
        .status,
    ).toBe(200)
    expect(
      await (await h.app.request('/api/workspaces/ws-sales/access-request', h.as('u-eve'))).json(),
    ).toBeNull()
    const again = await (await ask()).json()
    expect(again.status).toBe('pending')
    expect(again.id).not.toBe(id)
  })

  it('refuses to approve someone who has since lost the workspace', async () => {
    const { id } = await (await ask()).json()
    await h.adapter.removeWorkspaceGrant('ws-sales', 'u-eve')
    const res = await h.app.request(
      `/api/access-requests/${id}/approve`,
      h.as('u-ama', { method: 'POST' }),
    )
    expect(res.status).toBe(409)
    expect((await res.json()).error).toMatch(/no longer in Sales/)
    expect(
      (await h.app.request(`/api/access-requests/${id}/decline`, h.as('u-ama', { method: 'POST' })))
        .status,
    ).toBe(200)
  })
})
