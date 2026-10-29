import { describe, it, expect, beforeEach, vi } from 'vitest'
import { eq } from 'drizzle-orm'
import { ACCESS_REASONS, presetPermissions } from '@awaitstep/ir'
import { createSqliteApp, seedAcme, type SqliteApp } from './sqlite-app.js'

// Sharing a workflow to its project (B6) through the real API on a real
// database: who may flip the switch, what the lists show to whom, and what
// sharing does not open. Ama owns Acme, Dan is a project member (Editor
// everywhere), Eve a Viewer in Sales only, Gus an Editor in Ops only (Sales
// is hidden from him), Fay a plain org member with no rows.

describe('workflow sharing', () => {
  let h: SqliteApp
  beforeEach(async () => {
    h = createSqliteApp()
    await seedAcme(h)
  })

  const share = (who: string, workflowId: string, shared: boolean) =>
    h.app.request(
      `/api/workflows/${workflowId}/share?projectId=p-101`,
      h.as(who, h.json({ shared }, 'PUT')),
    )
  const read = async (who: string, path: string) => {
    const res = await h.app.request(`/api${path}`, h.as(who))
    return { status: res.status, body: await res.json() }
  }

  async function expectRefused(res: Response, status: number, error?: string) {
    expect(res.status).toBe(status)
    if (error) expect((await res.json()).error).toBe(error)
  }

  describe('PUT /workflows/:id/share', () => {
    it('shares for an Editor of its workspace, keeps the first sharer, and unshares', async () => {
      const on = await share('u-dan', 'wf-sales', true)
      expect(on.status).toBe(200)
      const first = (await on.json()).sharing
      expect(first).toEqual({
        sharedBy: { id: 'u-dan', name: 'Dan Kim' },
        sharedAt: expect.any(String),
      })

      const again = await share('u-ama', 'wf-sales', true)
      expect((await again.json()).sharing).toEqual(first)

      const off = await share('u-ama', 'wf-sales', false)
      expect(await off.json()).toEqual({ sharing: null })
      expect(await (await share('u-ama', 'wf-sales', false)).json()).toEqual({ sharing: null })
    })

    it('refuses a Viewer, and hides the workflow from someone outside its workspace', async () => {
      await expectRefused(
        await share('u-eve', 'wf-sales', true),
        403,
        ACCESS_REASONS.shareNeedsEditor,
      )
      await expectRefused(await share('u-gus', 'wf-sales', true), 404)
      await expectRefused(await share('u-fay', 'wf-sales', true), 404)
      await expectRefused(await share('u-cleo', 'wf-sales', true), 404)
      expect((await h.adapter.getWorkflowById('wf-sales'))!.sharedAt).toBeNull()
    })

    it('takes a key with workflows: write, and refuses a read-only one', async () => {
      const readKey = await h.seed.key(
        'k-read',
        'u-ama',
        { level: 'workspace', projectId: 'p-101', workspaceId: 'ws-sales' },
        presetPermissions('workspace', 'read'),
      )
      const byRead = await h.app.request('/api/workflows/wf-sales/share', {
        ...readKey,
        method: 'PUT',
        body: JSON.stringify({ shared: true }),
      })
      expect(byRead.status).toBe(403)

      const fullKey = await h.seed.key(
        'k-full',
        'u-ama',
        { level: 'workspace', projectId: 'p-101', workspaceId: 'ws-sales' },
        presetPermissions('workspace', 'full'),
      )
      for (const shared of [true, false]) {
        const byFull = await h.app.request('/api/workflows/wf-sales/share', {
          ...fullKey,
          method: 'PUT',
          body: JSON.stringify({ shared }),
        })
        expect(byFull.status).toBe(200)
        expect((await byFull.json()).sharing === null).toBe(!shared)
      }
    })

    it('refuses rather than shares over a move that lands after the gate', async () => {
      // The write holds to the workspace the gate judged; a move in between leaves it nothing to match.
      vi.spyOn(h.adapter, 'setWorkflowShared').mockResolvedValueOnce(null)
      await expectRefused(
        await share('u-ama', 'wf-sales', true),
        409,
        'Something changed meanwhile. Reload and try again',
      )
      expect(h.adapter.setWorkflowShared).toHaveBeenCalledWith(
        'wf-sales',
        'ws-sales',
        'u-ama',
        true,
      )
    })

    it('rejects a body without a boolean', async () => {
      const res = await h.app.request(
        '/api/workflows/wf-sales/share?projectId=p-101',
        h.as('u-ama', h.json({ shared: 'yes' }, 'PUT')),
      )
      expect(res.status).toBe(422)
    })
  })

  describe('the workspace list and counts', () => {
    it('carries `sharing` on each row and counts shared items on the workspace', async () => {
      await share('u-ama', 'wf-sales', true)
      const list = await read('u-ama', '/workflows?projectId=p-101&workspace=sales')
      expect(list.body.data[0]).toMatchObject({
        id: 'wf-sales',
        sharing: { sharedBy: { id: 'u-ama', name: 'Ama Mensah' } },
      })
      expect(list.body.data[0]).not.toHaveProperty('sharedByName')
      const ops = await read('u-ama', '/workflows?projectId=p-101&workspace=ops')
      expect(ops.body.data[0].sharing).toBeNull()

      const workspaces = await read('u-ama', '/workspaces?projectId=p-101')
      const counts = Object.fromEntries(
        workspaces.body.data.map((w: { slug: string; counts: { sharedOut: number } }) => [
          w.slug,
          w.counts.sharedOut,
        ]),
      )
      expect(counts).toEqual({ sales: 1, ops: 0 })
    })
  })

  describe('GET /workspaces/:id/shared', () => {
    beforeEach(async () => {
      await share('u-ama', 'wf-sales', true)
      await share('u-ama', 'wf-ops', true)
    })

    it('lists the other workspaces’ shared items, read-only, never its own', async () => {
      const { status, body } = await read('u-gus', '/workspaces/ws-ops/shared')
      expect(status).toBe(200)
      expect(body.data).toEqual([
        {
          id: 'wf-sales',
          name: 'In sales',
          kind: 'workflow',
          version: null,
          sharedAt: expect.any(String),
          sharedBy: { id: 'u-ama', name: 'Ama Mensah' },
          from: { id: 'ws-sales', slug: 'sales', name: 'Sales', colour: 'green' },
          usedBy: [],
          canOpen: false,
          unshare: { allowed: false, reason: ACCESS_REASONS.unshareElsewhere },
        },
      ])
    })

    it('filters by kind, and is hidden from someone who cannot open the workspace', async () => {
      const functions = await read('u-gus', '/workspaces/ws-ops/shared?kind=script')
      expect(functions.body.data).toEqual([])
      expect((await read('u-eve', '/workspaces/ws-ops/shared')).status).toBe(404)
    })

    it('answers a workspace key with workflows: read', async () => {
      const readKey = await h.seed.key(
        'k-read',
        'u-ama',
        { level: 'workspace', projectId: 'p-101', workspaceId: 'ws-ops' },
        presetPermissions('workspace', 'read'),
      )
      const res = await h.app.request('/api/workspaces/ws-ops/shared', readKey)
      expect(res.status).toBe(200)
      const rows = (await res.json()).data
      expect(rows.map((r: { id: string }) => r.id)).toEqual(['wf-sales'])
      // The key's creator can open Sales; the key, pinned to Ops, cannot.
      expect(rows[0].canOpen).toBe(false)
      expect((await h.app.request('/api/workflows/wf-sales?projectId=p-101', readKey)).status).toBe(
        404,
      )
    })
  })

  describe('GET /projects/:id/shared', () => {
    beforeEach(async () => {
      await share('u-ama', 'wf-sales', true)
      await share('u-ama', 'wf-ops', true)
    })

    const byId = (body: { data: { id: string }[] }) =>
      Object.fromEntries(body.data.map((r) => [r.id, r]))

    it('lists every shared item; outside its workspace it is named but cannot be opened', async () => {
      const { status, body } = await read('u-gus', '/projects/p-101/shared')
      expect(status).toBe(200)
      const rows = byId(body)
      expect(Object.keys(rows).sort()).toEqual(['wf-ops', 'wf-sales'])
      expect(rows['wf-sales']).toMatchObject({
        from: { name: 'Sales' },
        canOpen: false,
        unshare: { allowed: false, reason: 'Only people in Sales can unshare it' },
      })
      expect(rows['wf-ops']).toMatchObject({ canOpen: true, unshare: { allowed: true } })
      // Sharing shows metadata, never the workflow.
      expect((await read('u-gus', '/workflows/wf-sales?projectId=p-101')).status).toBe(404)
      expect((await read('u-gus', '/workflows/wf-sales/full?projectId=p-101')).status).toBe(404)
    })

    it('lets a workspace’s Viewer see but not unshare, and an Editor unshare', async () => {
      const eve = byId((await read('u-eve', '/projects/p-101/shared')).body)
      expect(eve['wf-sales']).toMatchObject({
        canOpen: true,
        unshare: { allowed: false, reason: ACCESS_REASONS.shareNeedsEditor },
      })
      const dan = byId((await read('u-dan', '/projects/p-101/shared')).body)
      expect(dan['wf-sales']).toMatchObject({ canOpen: true, unshare: { allowed: true } })
    })

    it('shows neither the name nor the id of a sharer who has left the organization', async () => {
      await h.db.delete(h.schema.member).where(eq(h.schema.member.userId, 'u-dan'))
      await h.db
        .update(h.schema.workflows)
        .set({ sharedBy: 'u-dan' })
        .where(eq(h.schema.workflows.id, 'wf-sales'))
      const rows = byId((await read('u-ama', '/projects/p-101/shared')).body)
      expect(rows['wf-sales']).toMatchObject({ sharedBy: { id: '', name: 'Someone' } })
      const list = await read('u-ama', '/workflows?projectId=p-101&workspace=sales')
      expect(list.body.data[0].sharing.sharedBy).toEqual({ id: '', name: 'Someone' })
    })

    it('answers a malformed or impossible cursor with 422, not a database error', async () => {
      for (const cursor of ['garbage', 'x_2026-02-31T00:00:00.000Z']) {
        for (const path of ['/projects/p-101/shared', '/workspaces/ws-ops/shared', '/workflows']) {
          const sep = path.includes('?') ? '&' : '?'
          const query =
            path === '/workflows' ? `?projectId=p-101&cursor=${cursor}` : `${sep}cursor=${cursor}`
          expect((await read('u-ama', `${path}${query}`)).status, `${path} ${cursor}`).toBe(422)
        }
      }
    })

    it('drops an unshared item, and is hidden from outsiders and refused to keys', async () => {
      await share('u-ama', 'wf-ops', false)
      const after = await read('u-ama', '/projects/p-101/shared')
      expect(after.body.data.map((r: { id: string }) => r.id)).toEqual(['wf-sales'])
      expect((await read('u-fay', '/projects/p-101/shared')).status).toBe(404)
      expect((await read('u-cleo', '/projects/p-101/shared')).status).toBe(404)
      const orgKey = await h.seed.key(
        'k-org',
        'u-ama',
        { level: 'organization' },
        presetPermissions('organization', 'full'),
      )
      expect((await h.app.request('/api/projects/p-101/shared', orgKey)).status).toBe(403)
      const projectKey = await h.seed.key(
        'k-project',
        'u-ama',
        { level: 'project', projectId: 'p-101' },
        presetPermissions('project', 'full'),
      )
      expect((await h.app.request('/api/projects/p-101/shared', projectKey)).status).toBe(403)
    })
  })

  describe('moves', () => {
    beforeEach(async () => {
      await share('u-ama', 'wf-sales', true)
    })

    it('keeps the share within the project and drops it when the workflow leaves', async () => {
      const within = await h.app.request(
        '/api/workspaces/ws-sales/move-workflows',
        h.as('u-ama', h.json({ workflowIds: ['wf-sales'], targetWorkspaceId: 'ws-ops' })),
      )
      expect(within.status).toBe(200)
      const shared = await read('u-ama', '/projects/p-101/shared')
      expect(shared.body.data[0]).toMatchObject({ id: 'wf-sales', from: { slug: 'ops' } })

      const out = await h.app.request(
        '/api/workflows/wf-sales/move?projectId=p-101',
        h.as('u-ama', h.json({ targetProjectId: 'p-202' }, 'PATCH')),
      )
      expect(out.status).toBe(200)
      expect((await h.adapter.getWorkflowById('wf-sales'))!.sharedAt).toBeNull()
      expect((await read('u-ama', '/projects/p-101/shared')).body.data).toEqual([])
    })
  })
})
