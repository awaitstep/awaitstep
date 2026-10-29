import { describe, it, expect, beforeEach } from 'vitest'
import { and, eq } from 'drizzle-orm'
import { ACCESS_REASONS, presetPermissions } from '@awaitstep/ir'
import { createSqliteApp, seedAcme, type SqliteApp } from './sqlite-app.js'

// The deletion lock (B5) through the real API on a real database: who may
// turn it on and off, and what it keeps from being deleted or moved.

describe('deletion locks', () => {
  let h: SqliteApp
  beforeEach(async () => {
    h = createSqliteApp()
    await seedAcme(h)
  })

  const lock = (who: string, path: string, locked: boolean) =>
    h.app.request(`/api${path}/lock`, h.as(who, h.json({ locked }, 'PUT')))
  const remove = (who: string, path: string) =>
    h.app.request(`/api${path}`, h.as(who, { method: 'DELETE' }))

  async function expectRefused(res: Response, status: number, error: string) {
    expect(res.status).toBe(status)
    expect((await res.json()).error).toBe(error)
  }

  describe('the project lock', () => {
    it('is set by a project admin or an org admin, keeps its first setter, and clears', async () => {
      const on = await lock('u-ben', '/projects/p-101', true)
      expect(on.status).toBe(200)
      const first = (await on.json()).lock
      expect(first).toEqual({
        setBy: { id: 'u-ben', name: 'Ben Okoro' },
        setAt: expect.any(String),
      })

      // A project admin who does not run the org may change it too.
      await h.seed.projectGrant('p-101', 'u-fay', 'admin')
      const again = await lock('u-fay', '/projects/p-101', true)
      expect((await again.json()).lock).toEqual(first)

      const off = await lock('u-fay', '/projects/p-101', false)
      expect(off.status).toBe(200)
      expect(await off.json()).toEqual({ lock: null })
      expect(await (await lock('u-ama', '/projects/p-101', false)).json()).toEqual({ lock: null })
    })

    it('is refused to a project member, outsiders and every key', async () => {
      await expectRefused(
        await lock('u-dan', '/projects/p-101', true),
        403,
        ACCESS_REASONS.projectAdmins,
      )
      expect((await lock('u-cleo', '/projects/p-101', true)).status).toBe(404)
      const projectKey = await h.seed.key(
        'k-full',
        'u-ama',
        { level: 'project', projectId: 'p-101' },
        presetPermissions('project', 'full'),
      )
      const byKey = await h.app.request('/api/projects/p-101/lock', {
        ...projectKey,
        method: 'PUT',
        body: JSON.stringify({ locked: false }),
      })
      expect(byKey.status).toBe(403)
      const orgKey = await h.seed.key(
        'k-org',
        'u-ama',
        { level: 'organization' },
        presetPermissions('organization', 'full'),
      )
      const byOrgKey = await h.app.request('/api/projects/p-101/lock', {
        ...orgKey,
        method: 'PUT',
        body: JSON.stringify({ locked: true }),
      })
      expect(byOrgKey.status).toBe(403)
      expect(await h.adapter.getProjectLocks('p-101', 'org-acme')).toMatchObject({
        ownLock: false,
      })
    })

    it('needs a boolean', async () => {
      const res = await h.app.request(
        '/api/projects/p-101/lock',
        h.as('u-ama', h.json({ locked: 'yes' }, 'PUT')),
      )
      expect(res.status).toBe(422)
    })
  })

  describe('the workspace lock', () => {
    it('is changed by the workspace’s editors and admins, not its viewers', async () => {
      const byEditor = await lock('u-gus', '/workspaces/ws-ops', true)
      expect(byEditor.status).toBe(200)
      expect((await byEditor.json()).lock.setBy).toEqual({ id: 'u-gus', name: 'Gus Roy' })
      await expectRefused(
        await lock('u-eve', '/workspaces/ws-sales', true),
        403,
        ACCESS_REASONS.lockToggle,
      )
      // A workspace the caller cannot open is not found.
      expect((await lock('u-gus', '/workspaces/ws-sales', true)).status).toBe(404)
      expect((await lock('u-ama', '/workspaces/ws-ops', false)).status).toBe(200)
    })

    it('is refused to every key', async () => {
      const workspaceKey = await h.seed.key(
        'k-ws',
        'u-ama',
        { level: 'workspace', projectId: 'p-101', workspaceId: 'ws-sales' },
        presetPermissions('workspace', 'full'),
      )
      const res = await h.app.request('/api/workspaces/ws-sales/lock', {
        ...workspaceKey,
        method: 'PUT',
        body: JSON.stringify({ locked: true }),
      })
      expect(res.status).toBe(403)
    })

    it('cannot be changed while its project is locked', async () => {
      await lock('u-gus', '/workspaces/ws-ops', true)
      await lock('u-ama', '/projects/p-101', true)
      for (const locked of [true, false]) {
        await expectRefused(
          await lock('u-ama', '/workspaces/ws-ops', locked),
          409,
          'Locked by Project 101',
        )
      }
      expect(await h.adapter.getWorkspaceLocks('ws-ops')).toMatchObject({ ownLock: true })
    })
  })

  describe('what a lock blocks', () => {
    it('keeps a locked project, and one with a locked workspace, from being deleted', async () => {
      await lock('u-ama', '/projects/p-101', true)
      await expectRefused(await remove('u-ama', '/projects/p-101'), 409, ACCESS_REASONS.lockFirst)

      await lock('u-ama', '/projects/p-101', false)
      await lock('u-ama', '/workspaces/ws-sales', true)
      await expectRefused(await remove('u-ama', '/projects/p-101'), 409, 'Sales is locked')
      await lock('u-ama', '/workspaces/ws-ops', true)
      await expectRefused(
        await remove('u-ama', '/projects/p-101'),
        409,
        '2 workspaces in it are locked',
      )
      expect(await h.adapter.getProjectById('p-101')).not.toBeNull()

      await lock('u-ama', '/workspaces/ws-sales', false)
      await lock('u-ama', '/workspaces/ws-ops', false)
      expect((await remove('u-ama', '/projects/p-101')).status).toBe(200)
      expect(await h.adapter.getProjectById('p-101')).toBeNull()
    })

    it('shows the same reasons on the scope read the dashboard disables Delete from', async () => {
      await lock('u-ama', '/workspaces/ws-sales', true)
      const scope = await (
        await h.app.request('/api/scope?org=acme&project=project-101', h.as('u-ama'))
      ).json()
      expect(scope.project.viewerCan.delete).toEqual({ allowed: false, reason: 'Sales is locked' })
      // A member is told about the role, never about the workspaces.
      const asDan = await (
        await h.app.request('/api/scope?org=acme&project=project-101', h.as('u-dan'))
      ).json()
      expect(asDan.project.viewerCan.delete.reason).toBe(ACCESS_REASONS.projectAdmins)
    })

    it('never names a locked workspace to someone who cannot open it', async () => {
      // Gus (Editor in Ops only) locks Ops; Eve opens Sales only. Only project
      // admins hear the delete reason, and they open every workspace.
      expect((await lock('u-gus', '/workspaces/ws-ops', true)).status).toBe(200)
      const leaks = (body: unknown) => JSON.stringify(body).includes('Ops is locked')
      for (const who of ['u-eve', 'u-gus', 'u-dan']) {
        const projects = await (await h.app.request('/api/projects?org=acme', h.as(who))).json()
        expect(leaks(projects), who).toBe(false)
        const scope = await (
          await h.app.request('/api/scope?org=acme&project=project-101', h.as(who))
        ).json()
        expect(leaks(scope), who).toBe(false)
        expect(JSON.stringify(scope)).not.toContain('lockedWorkspaces')
      }
      // A key minted by a project member reads the list with its creator's standing.
      const danKey = await h.seed.key(
        'k-dan',
        'u-dan',
        { level: 'organization' },
        presetPermissions('organization', 'full'),
      )
      const byKey = await (await h.app.request('/api/projects', danKey)).json()
      expect(byKey.data.some((p: { id: string }) => p.id === 'p-101')).toBe(true)
      expect(leaks(byKey)).toBe(false)
      // An admin, who opens Ops, is told.
      const asAma = await (await h.app.request('/api/projects?org=acme', h.as('u-ama'))).json()
      expect(leaks(asAma)).toBe(true)
    })

    it('keeps a locked workspace, or one in a locked project, from being deleted', async () => {
      await lock('u-ama', '/workspaces/ws-ops', true)
      await expectRefused(
        await remove('u-ama', '/workspaces/ws-ops'),
        409,
        ACCESS_REASONS.lockFirst,
      )

      await lock('u-ama', '/projects/p-101', true)
      await expectRefused(
        await remove('u-ama', '/workspaces/ws-sales'),
        409,
        'Locked by Project 101',
      )

      await lock('u-ama', '/projects/p-101', false)
      expect((await remove('u-ama', '/workspaces/ws-sales')).status).toBe(200)
      // Ops is now the last one, and still locked: its own lock is named first.
      await expectRefused(
        await remove('u-ama', '/workspaces/ws-ops'),
        409,
        ACCESS_REASONS.lockFirst,
      )
      await lock('u-ama', '/workspaces/ws-ops', false)
      await expectRefused(
        await remove('u-ama', '/workspaces/ws-ops'),
        409,
        ACCESS_REASONS.lastWorkspace,
      )
    })

    it('keeps a project key that may delete from deleting a locked project', async () => {
      await lock('u-ama', '/projects/p-101', true)
      const projectKey = await h.seed.key(
        'k-full',
        'u-ama',
        { level: 'project', projectId: 'p-101' },
        presetPermissions('project', 'full'),
      )
      const res = await h.app.request('/api/workspaces/ws-sales', {
        ...projectKey,
        method: 'DELETE',
      })
      await expectRefused(res, 409, 'Locked by Project 101')
    })

    it('keeps an organization key that may delete projects from deleting a locked one', async () => {
      // A project key never deletes its project (that is organization-level);
      // an org key with `projects: delete` is the key that reaches the lock.
      await lock('u-ama', '/projects/p-101', true)
      const orgKey = await h.seed.key(
        'k-org',
        'u-ama',
        { level: 'organization' },
        presetPermissions('organization', 'full'),
      )
      const res = await h.app.request('/api/projects/p-101', { ...orgKey, method: 'DELETE' })
      await expectRefused(res, 409, ACCESS_REASONS.lockFirst)
      expect(await h.adapter.getProjectById('p-101')).not.toBeNull()
    })

    it('shows a lock with no setter on record as on, and refuses the delete it blocks', async () => {
      await h.db
        .update(h.schema.projects)
        .set({ lockedAt: '2026-10-20T00:00:00.000Z', lockedBy: null })
        .where(eq(h.schema.projects.id, 'p-101'))
      const scope = await (
        await h.app.request('/api/scope?org=acme&project=project-101', h.as('u-ama'))
      ).json()
      expect(scope.project.lock).toEqual({
        setBy: { id: '', name: 'Someone' },
        setAt: '2026-10-20T00:00:00.000Z',
      })
      expect(scope.project.viewerCan.delete.reason).toBe(ACCESS_REASONS.lockFirst)
      await expectRefused(await remove('u-ama', '/projects/p-101'), 409, ACCESS_REASONS.lockFirst)
    })

    it('shows neither the name nor the id of a setter who has left the organization', async () => {
      await h.db
        .update(h.schema.projects)
        .set({ lockedAt: '2026-10-20T00:00:00.000Z', lockedBy: 'u-cleo' })
        .where(eq(h.schema.projects.id, 'p-101'))
      const scope = await (
        await h.app.request('/api/scope?org=acme&project=project-101', h.as('u-ama'))
      ).json()
      expect(scope.project.lock.setBy).toEqual({ id: '', name: 'Someone' })
    })

    it('keeps a locked project in its organization, but not for a workspace’s lock', async () => {
      // Ama runs both organizations for the move.
      await h.db
        .update(h.schema.member)
        .set({ role: 'owner' })
        .where(
          and(
            eq(h.schema.member.userId, 'u-ama'),
            eq(h.schema.member.organizationId, 'org-globex'),
          ),
        )
      const move = () =>
        h.app.request(
          '/api/projects/p-202/move',
          h.as('u-ama', h.json({ organizationId: 'org-globex' })),
        )
      await lock('u-ama', '/projects/p-202', true)
      await expectRefused(await move(), 409, ACCESS_REASONS.lockFirst)
      expect(await h.adapter.getProjectById('p-202')).toMatchObject({ organizationId: 'org-acme' })

      await lock('u-ama', '/projects/p-202', false)
      await lock('u-ama', '/workspaces/ws-202', true)
      expect((await move()).status).toBe(200)
      expect(await h.adapter.getProjectById('p-202')).toMatchObject({
        organizationId: 'org-globex',
      })
    })
  })
})
