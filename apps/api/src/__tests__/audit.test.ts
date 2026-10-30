import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { and, eq } from 'drizzle-orm'
import { presetPermissions, type AuditEvent } from '@awaitstep/ir'
import { recordSignIn, purgeExpiredAuditEvents } from '../lib/audit.js'
import { createSqliteApp, seedAcme, type SqliteApp } from './sqlite-app.js'

// The organization audit log (B7) through the real API on a real database:
// what each sensitive route records, who may read it, and the token-check
// lockout (SA-12). Ama owns Acme, Ben is its admin, Dan a project member of
// Project 101, Eve a Viewer in Sales, Fay a plain member; Ama is a plain
// member of Globex, which Cleo owns.

describe('audit log', () => {
  let h: SqliteApp
  beforeEach(async () => {
    h = createSqliteApp()
    await seedAcme(h)
  })

  const call = (who: string, path: string, init: RequestInit = {}) =>
    h.app.request(`/api${path}`, h.as(who, init))
  const send = (who: string, path: string, body: unknown, method = 'POST') =>
    call(who, path, h.json(body, method))

  async function events(org = 'acme', query = '', who = 'u-ama'): Promise<AuditEvent[]> {
    const res = await call(who, `/audit-events?org=${org}${query}`)
    expect(res.status).toBe(200)
    return (await res.json()).data
  }

  /** The newest event, which must be the only one with this code. */
  async function only(code: string, org = 'acme', who = 'u-ama'): Promise<AuditEvent> {
    const found = (await events(org, '&period=90d', who)).filter((e) => e.event === code)
    expect(found, code).toHaveLength(1)
    return found[0]!
  }

  describe('recording', () => {
    it('records a deletion with who did it and how, at the parent level', async () => {
      expect((await call('u-ben', '/workspaces/ws-ops', { method: 'DELETE' })).status).toBe(200)
      expect(await only('workspace.delete')).toMatchObject({
        kind: 'danger',
        actor: 'Ben Okoro',
        actorType: 'user',
        actorId: 'u-ben',
        actorEmail: 'ben@acme.test',
        action: 'deleted the workspace',
        target: 'Ops',
        detail: 'Dashboard',
        scope: { level: 'project', name: 'Project 101' },
      })

      expect((await call('u-ama', '/projects/p-202', { method: 'DELETE' })).status).toBe(200)
      expect(await only('project.delete')).toMatchObject({
        target: 'Project 202',
        scope: { level: 'organization', name: 'Acme' },
      })
    })

    it('records deletions the lock blocked, with what blocked them', async () => {
      await send('u-ama', '/workspaces/ws-sales/lock', { locked: true }, 'PUT')
      expect((await call('u-ama', '/workspaces/ws-sales', { method: 'DELETE' })).status).toBe(409)
      expect(await only('workspace.delete.blocked')).toMatchObject({
        action: 'tried to delete the workspace',
        target: 'Sales',
        detail: 'Blocked by the deletion lock · Dashboard',
      })

      expect((await call('u-ama', '/projects/p-101', { method: 'DELETE' })).status).toBe(409)
      expect(await only('project.delete.blocked')).toMatchObject({
        target: 'Project 101',
        detail: 'Blocked: Sales is locked · Dashboard',
        scope: { level: 'project', name: 'Project 101' },
      })
    })

    it('records a lock change only when the lock changes', async () => {
      for (const locked of [true, true, false, false]) {
        expect((await send('u-ama', '/projects/p-101/lock', { locked }, 'PUT')).status).toBe(200)
      }
      await send('u-ama', '/workspaces/ws-sales/lock', { locked: true }, 'PUT')
      await send('u-ama', '/workspaces/ws-sales/lock', { locked: true }, 'PUT')
      await send('u-ama', '/workspaces/ws-sales/lock', { locked: false }, 'PUT')
      await send('u-ama', '/workspaces/ws-sales/lock', { locked: false }, 'PUT')
      const lockEvents = (await events()).filter((e) => e.kind === 'lock')
      expect(lockEvents.map((e) => [e.event, e.target])).toEqual([
        ['workspace.unlock', 'Sales'],
        ['workspace.lock', 'Sales'],
        ['project.unlock', 'Project 101'],
        ['project.lock', 'Project 101'],
      ])
      expect(lockEvents[1]!.scope).toEqual({
        level: 'workspace',
        name: 'Project 101 · Sales',
        colour: expect.any(String),
      })
    })

    it('records a share change only when the share changes', async () => {
      for (const shared of [true, true, false, false]) {
        await send('u-dan', '/workflows/wf-sales/share?projectId=p-101', { shared }, 'PUT')
      }
      expect((await events()).map((e) => [e.event, e.actor, e.target])).toEqual([
        ['workflow.unshare', 'Dan Kim', 'In sales'],
        ['workflow.share', 'Dan Kim', 'In sales'],
      ])
    })

    it('records a project move in both organizations, and one the lock blocked', async () => {
      await h.db
        .update(h.schema.member)
        .set({ role: 'admin' })
        .where(
          and(
            eq(h.schema.member.userId, 'u-ama'),
            eq(h.schema.member.organizationId, 'org-globex'),
          ),
        )
      await send('u-ama', '/projects/p-202/lock', { locked: true }, 'PUT')
      expect(
        (await send('u-ama', '/projects/p-202/move', { organizationId: 'org-globex' })).status,
      ).toBe(409)
      expect((await only('project.move.blocked')).detail).toBe(
        'Blocked by the deletion lock · Dashboard',
      )

      await send('u-ama', '/projects/p-202/lock', { locked: false }, 'PUT')
      expect(
        (await send('u-ama', '/projects/p-202/move', { organizationId: 'org-globex' })).status,
      ).toBe(200)
      expect(await only('project.move.out')).toMatchObject({
        target: 'Project 202',
        detail: 'To Globex · Dashboard',
        scope: { level: 'organization', name: 'Acme' },
      })
      expect(await only('project.move.in', 'globex')).toMatchObject({
        detail: 'From Acme · Dashboard',
        scope: { level: 'project', name: 'Project 202' },
      })
    })

    it('records keys with their grid, and revocations', async () => {
      const res = await send('u-ama', '/api-keys?org=acme', {
        name: 'Terraform',
        level: 'organization',
        permissions: { projects: ['read'], audit: ['read'] },
      })
      expect(res.status).toBe(201)
      const { id, key } = await res.json()
      expect(await only('api_key.create')).toMatchObject({
        kind: 'key',
        target: 'Terraform',
        detail: 'read on Projects, Audit log · Dashboard',
        scope: { level: 'organization' },
      })
      expect(JSON.stringify(await events())).not.toContain(key)

      expect((await call('u-ama', `/api-keys/${id}?org=acme`, { method: 'DELETE' })).status).toBe(
        200,
      )
      expect((await only('api_key.revoke')).target).toBe('Terraform')
    })

    it('records connections and variables, never their secrets', async () => {
      const conn = await send('u-ama', '/connections?org=acme', {
        provider: 'cloudflare',
        name: 'Prod',
        credentials: { apiToken: 'cf-secret-token-123', accountId: 'acc' },
      })
      expect(conn.status).toBe(201)
      const { id: connectionId } = await conn.json()
      await send(
        'u-ama',
        `/connections/${connectionId}?org=acme`,
        { name: 'Production', credentials: { apiToken: 'cf-secret-token-456', accountId: 'acc' } },
        'PATCH',
      )
      await call('u-ama', `/connections/${connectionId}?org=acme`, { method: 'DELETE' })

      const variable = await send('u-ama', '/env-vars?org=acme', {
        name: 'STRIPE_KEY',
        value: 'sk_live_very_secret',
        isSecret: true,
      })
      expect(variable.status).toBe(201)
      const { id: variableId } = await variable.json()
      await send('u-ama', `/env-vars/${variableId}?org=acme`, { value: 'sk_live_other' }, 'PATCH')
      await call('u-ama', `/env-vars/${variableId}?org=acme`, { method: 'DELETE' })

      const listed = await events()
      expect(listed.map((e) => [e.event, e.target, e.detail])).toEqual([
        ['variable.delete', 'STRIPE_KEY', 'Dashboard'],
        ['variable.update', 'STRIPE_KEY', 'Value changed · Dashboard'],
        ['variable.create', 'STRIPE_KEY', 'Secret · Dashboard'],
        ['connection.delete', 'Production', 'Dashboard'],
        ['connection.update', 'Production', 'Renamed from Prod, Credentials changed · Dashboard'],
        ['connection.create', 'Prod', 'Cloudflare · Dashboard'],
      ])
      const stored = h.sqlite.prepare('SELECT * FROM audit_events').all()
      for (const secret of ['cf-secret-token', 'sk_live']) {
        expect(JSON.stringify(stored)).not.toContain(secret)
      }
    })

    it('records a connection deleted twice at once only once', async () => {
      const conn = await send('u-ama', '/connections?org=acme', {
        provider: 'cloudflare',
        name: 'Prod',
        credentials: { apiToken: 't', accountId: 'acc' },
      })
      const { id } = await conn.json()
      await Promise.all([
        call('u-ama', `/connections/${id}?org=acme`, { method: 'DELETE' }),
        call('u-ama', `/connections/${id}?org=acme`, { method: 'DELETE' }),
      ])
      expect((await events()).filter((e) => e.event === 'connection.delete')).toHaveLength(1)
    })

    it('records access: invitations, org access, removal and workspace grants', async () => {
      const invited = await send('u-ama', '/invitations?org=acme', {
        emails: ['sam@acme.test'],
        role: 'member',
      })
      expect(invited.status).toBe(201)
      const [{ id: inviteId }] = (await invited.json()).data
      await call('u-ama', `/invitations/${inviteId}?org=acme`, { method: 'DELETE' })

      await send(
        'u-ben',
        '/members/u-fay/access?org=acme',
        { orgRole: 'member', projects: [{ projectId: 'p-202', role: 'admin' }], workspaces: [] },
        'PUT',
      )
      await send('u-ben', '/workspaces/ws-ops/members', { userId: 'u-eve', role: 'viewer' })
      await send('u-ben', '/workspaces/ws-ops/members/u-eve', { role: 'editor' }, 'PATCH')
      // The same role again changes nothing and records nothing.
      expect(
        (await send('u-ben', '/workspaces/ws-ops/members/u-eve', { role: 'editor' }, 'PATCH'))
          .status,
      ).toBe(200)
      await call('u-ben', '/workspaces/ws-ops/members/u-eve', { method: 'DELETE' })
      await call('u-ama', '/members/u-gus?org=acme', { method: 'DELETE' })

      expect((await events()).map((e) => [e.event, e.action, e.target, e.detail])).toEqual([
        ['member.remove', 'removed', 'Gus Roy', 'Dashboard'],
        ['workspace_member.remove', 'removed Eve Park from', 'Ops', 'Dashboard'],
        ['workspace_member.role', 'changed Eve Park’s role in', 'Ops', 'Role: Editor · Dashboard'],
        ['workspace_member.add', 'added Eve Park to', 'Ops', 'Role: Viewer · Dashboard'],
        [
          'member.access',
          'changed the access of',
          'Fay Lund',
          'Org role: Member · 1 project · Dashboard',
        ],
        ['invitation.cancel', 'cancelled the invitation for', 'sam@acme.test', 'Dashboard'],
        ['invitation.create', 'invited', 'sam@acme.test', 'Role: Member · Dashboard'],
      ])
    })

    it('records someone joining through an invitation, in the inviting organization', async () => {
      const invited = await send('u-ama', '/invitations?org=acme', {
        emails: ['hal@example.test'],
        role: 'admin',
      })
      const [{ id }] = (await invited.json()).data
      expect((await call('u-hal', `/invitations/${id}/accept`, { method: 'POST' })).status).toBe(
        200,
      )
      expect(await only('member.join')).toMatchObject({
        kind: 'access',
        actor: 'Hal Ito',
        actorId: 'u-hal',
        actorEmail: 'hal@example.test',
        action: 'joined',
        target: 'Acme',
        detail: 'Role: Admin · Dashboard',
        scope: { level: 'organization', name: 'Acme' },
      })
    })

    it('records workflow moves, between workspaces and between projects', async () => {
      await h.seed.workflow('wf-two', 'p-101', 'ws-sales', 'Second')
      expect(
        (
          await send('u-ama', '/workspaces/ws-sales/move-workflows', {
            workflowIds: ['wf-sales', 'wf-two'],
            targetWorkspaceId: 'ws-ops',
          })
        ).status,
      ).toBe(200)
      expect(
        (
          await send(
            'u-ama',
            '/workflows/wf-ops/move?projectId=p-101',
            { targetProjectId: 'p-202' },
            'PATCH',
          )
        ).status,
      ).toBe(200)
      expect((await events()).map((e) => [e.event, e.target, e.detail, e.scope.name])).toEqual(
        expect.arrayContaining([
          ['workflow.move', 'In ops', 'To Project 202 · Dashboard', 'Project 101 · Ops'],
          ['workflow.move', 'In sales', 'To Ops · Dashboard', 'Project 101 · Sales'],
          ['workflow.move', 'Second', 'To Ops · Dashboard', 'Project 101 · Sales'],
        ]),
      )
    })

    it('records an access request’s answer in its workspace', async () => {
      const asked = await call('u-eve', '/workspaces/ws-sales/access-requests', { method: 'POST' })
      const { id } = await asked.json()
      expect(
        (await call('u-ama', `/access-requests/${id}/approve`, { method: 'POST' })).status,
      ).toBe(200)
      expect(await only('access_request.approve')).toMatchObject({
        action: 'approved Eve Park’s request for',
        target: 'Sales',
        detail: 'Role: Editor · Dashboard',
        scope: { level: 'workspace', name: 'Project 101 · Sales' },
      })
    })

    it('records a declined access request', async () => {
      const asked = await call('u-eve', '/workspaces/ws-sales/access-requests', { method: 'POST' })
      const { id } = await asked.json()
      await call('u-ama', `/access-requests/${id}/decline`, { method: 'POST' })
      expect(await only('access_request.decline')).toMatchObject({
        action: 'declined Eve Park’s request for',
        target: 'Sales',
        detail: 'Dashboard',
      })
    })

    it('keeps a chosen name from reordering the row', async () => {
      const key = await h.seed.key(
        'k-evil',
        'u-ama',
        { level: 'project', projectId: 'p-101' },
        presetPermissions('project', 'full'),
      )
      await h.db
        .update(h.schema.apiKeys)
        .set({ name: 'Ama\u202E snoissimrep' })
        .where(eq(h.schema.apiKeys.id, 'k-evil'))
      await h.app.request('/api/workflows/wf-ops', { ...key, method: 'DELETE' })
      expect((await only('workflow.delete')).actor).toBe('Ama snoissimrep')
    })

    it('names a key as the actor when a key acted', async () => {
      const key = await h.seed.key(
        'k-ci',
        'u-ama',
        { level: 'project', projectId: 'p-101' },
        presetPermissions('project', 'full'),
      )
      const res = await h.app.request('/api/workflows/wf-ops', { ...key, method: 'DELETE' })
      expect(res.status).toBe(200)
      expect(await only('workflow.delete')).toMatchObject({
        actor: 'k-ci',
        actorType: 'key',
        target: 'In ops',
        detail: 'Project API key ask_k-ci…k-ci',
        scope: { level: 'workspace', name: 'Project 101 · Ops' },
      })
    })

    it('records nothing for a refused or failed request', async () => {
      await call('u-dan', '/projects/p-101/lock', h.json({ locked: true }, 'PUT'))
      await call('u-eve', '/workspaces/ws-sales', { method: 'DELETE' })
      await call('u-ama', '/workspaces/ws-nowhere', { method: 'DELETE' })
      expect(await events()).toEqual([])
    })

    it('still answers the operation when the log cannot be written', async () => {
      const spy = vi.spyOn(h.adapter, 'insertAuditEvents').mockRejectedValue(new Error('disk full'))
      const err = vi.spyOn(console, 'error').mockImplementation(() => {})
      expect((await send('u-ama', '/projects/p-101/lock', { locked: true }, 'PUT')).status).toBe(
        200,
      )
      expect(spy).toHaveBeenCalled()
      spy.mockRestore()
      err.mockRestore()
      expect(await events()).toEqual([])
    })

    it('records a sign-in in every organization the person is in', async () => {
      await recordSignIn(h.adapter, {
        id: 'sess-1',
        userId: 'u-ama',
        ipAddress: '81.2.69.142',
      })
      expect(await only('signin')).toMatchObject({
        kind: 'auth',
        actor: 'Ama Mensah',
        action: 'signed in to',
        target: 'Acme',
        detail: '81.2.69.x',
        ip: '81.2.69.x',
      })
      expect((await only('signin', 'globex', 'u-cleo')).target).toBe('Globex')
    })

    it('purges events past 90 days', async () => {
      await h.adapter.insertAuditEvents([
        {
          id: 'old',
          organizationId: 'org-acme',
          projectId: null,
          workspaceId: null,
          level: 'organization',
          kind: 'danger',
          event: 'workflow.delete',
          actorType: 'user',
          actorId: 'u-ama',
          actorName: 'Ama Mensah',
          actorEmail: 'ama@acme.test',
          action: 'deleted the workflow',
          target: 'Old',
          detail: '',
          meta: '{}',
          ip: null,
          createdAt: new Date(Date.now() - 91 * 24 * 60 * 60 * 1000).toISOString(),
        },
      ])
      expect(await events('acme', '&period=90d')).toEqual([])
      expect(await purgeExpiredAuditEvents(h.adapter)).toBe(1)
    })
  })

  describe('GET /audit-events', () => {
    beforeEach(async () => {
      await send('u-ama', '/workspaces/ws-ops/lock', { locked: true }, 'PUT')
      await send('u-ama', '/projects/p-101/lock', { locked: true }, 'PUT')
      await send('u-ben', '/env-vars?org=acme', { name: 'REGION', value: 'eu', isSecret: false })
    })

    it('answers owners and admins, and refuses members', async () => {
      expect((await call('u-ama', '/audit-events?org=acme')).status).toBe(200)
      expect((await call('u-ben', '/audit-events?org=acme')).status).toBe(200)
      expect((await call('u-dan', '/audit-events?org=acme')).status).toBe(403)
      expect((await call('u-cleo', '/audit-events?org=acme')).status).toBe(404)
    })

    it('keeps each organization’s log to itself', async () => {
      expect(await events('globex', '', 'u-cleo')).toEqual([])
      expect((await call('u-ama', '/audit-events?org=globex')).status).toBe(403)
    })

    it('answers an organization key with audit: read, and no other key', async () => {
      const reader = await h.seed.key(
        'k-audit',
        'u-ama',
        { level: 'organization' },
        {
          audit: ['read'],
        },
      )
      const res = await h.app.request('/api/audit-events', reader)
      expect(res.status).toBe(200)
      expect((await res.json()).total).toBe(3)

      const without = await h.seed.key(
        'k-proj',
        'u-ama',
        { level: 'organization' },
        {
          projects: ['read'],
        },
      )
      expect((await h.app.request('/api/audit-events', without)).status).toBe(403)
      const projectKey = await h.seed.key(
        'k-p',
        'u-ama',
        { level: 'project', projectId: 'p-101' },
        presetPermissions('project', 'full'),
      )
      expect((await h.app.request('/api/audit-events', projectKey)).status).toBe(403)
      // A key reads as its creator: once they are no admin, nor is it.
      const byDan = await h.seed.key(
        'k-dan',
        'u-dan',
        { level: 'organization' },
        {
          audit: ['read'],
        },
      )
      expect((await h.app.request('/api/audit-events', byDan)).status).toBe(403)
    })

    it('filters by level and search, and pages with the total on every page', async () => {
      expect((await events('acme', '&level=workspace')).map((e) => e.target)).toEqual(['Ops'])
      expect((await events('acme', '&search=REGION')).map((e) => e.event)).toEqual([
        'variable.create',
      ])
      expect(await events('acme', '&search=%25')).toEqual([])

      const first = await (await call('u-ama', '/audit-events?org=acme&limit=2')).json()
      expect(first.data).toHaveLength(2)
      expect(first.total).toBe(3)
      const second = await (
        await call('u-ama', `/audit-events?org=acme&limit=2&cursor=${first.nextCursor}`)
      ).json()
      expect(second).toMatchObject({ total: 3, nextCursor: null })
      expect(second.data).toHaveLength(1)
    })

    it('refuses an unknown level, period or cursor', async () => {
      for (const query of ['&level=galaxy', '&period=1y', '&cursor=nope', '&limit=0']) {
        expect((await call('u-ama', `/audit-events?org=acme${query}`)).status, query).toBe(422)
      }
    })
  })

  describe('token-check lockout', () => {
    let tokenValid = false
    let cloudflareCalls = 0
    beforeEach(() => {
      tokenValid = false
      cloudflareCalls = 0
      vi.useFakeTimers({ toFake: ['Date'] })
      vi.setSystemTime(new Date('2026-10-30T10:00:00Z'))
      vi.stubGlobal(
        'fetch',
        vi.fn(async (url: string) => {
          cloudflareCalls++
          if (url.includes('/tokens/verify')) {
            return new Response(
              JSON.stringify({ result: { status: tokenValid ? 'active' : 'disabled' } }),
            )
          }
          return new Response(JSON.stringify({ result: [{ id: 'acc', name: 'Acme' }] }))
        }),
      )
    })
    afterEach(() => {
      vi.useRealTimers()
      vi.unstubAllGlobals()
    })

    const check = (who = 'u-ben') =>
      send(who, '/connections/verify-token?org=acme', {
        provider: 'cloudflare',
        credentials: { apiToken: 'tok' },
      })
    const at = (time: string) => vi.setSystemTime(new Date(`2026-10-30T${time}Z`))

    it('allows three failures, then waits 30 s, then doubles', async () => {
      for (let i = 0; i < 4; i++) expect((await (await check()).json()).valid).toBe(false)
      expect(cloudflareCalls).toBe(4)

      at('10:00:10')
      const locked = await check()
      expect(locked.status).toBe(429)
      expect(locked.headers.get('Retry-After')).toBe('20')
      expect((await locked.json()).error).toBe('Too many failed token checks. Try again in 20 s.')
      expect(cloudflareCalls).toBe(4)

      at('10:00:30')
      expect((await check()).status).toBe(200)
      at('10:01:29')
      expect((await check()).headers.get('Retry-After')).toBe('1')
      at('10:01:30')
      expect((await check()).status).toBe(200)

      const log = await events()
      expect(log.filter((e) => e.event === 'connection.verify.failed')).toHaveLength(6)
      expect(
        log.filter((e) => e.event === 'connection.verify.locked').map((e) => e.detail),
      ).toEqual([
        '6 failed checks · locked for 2 min · Dashboard',
        '5 failed checks · locked for 1 min · Dashboard',
        '4 failed checks · locked for 30 s · Dashboard',
      ])
    })

    it('never lets a valid token reset the count, and locks each person on their own', async () => {
      for (let i = 0; i < 3; i++) await check()
      // A token of the caller's own passes, and clears nothing.
      tokenValid = true
      at('10:00:01')
      expect((await (await check()).json()).valid).toBe(true)
      tokenValid = false
      at('10:00:02')
      expect((await check()).status).toBe(200)
      tokenValid = true
      at('10:00:03')
      expect((await check()).status).toBe(429)

      // Ben's failures never counted against Ama, nor hers against him.
      tokenValid = false
      for (let i = 0; i < 4; i++) expect((await check('u-ama')).status).toBe(200)
      expect((await check('u-ama')).status).toBe(429)
      expect((await check()).status).toBe(429)
      const listed = await events()
      expect(listed.some((e) => e.event === 'connection.verify.attempt')).toBe(false)
    })

    it('counts a key’s checks against its creator’s keys, never the creator’s own session', async () => {
      const keyCheck = async (id: string) => {
        const key = await h.seed.key(
          id,
          'u-ben',
          { level: 'project', projectId: 'p-101' },
          presetPermissions('project', 'read'),
        )
        return h.app.request('/api/connections/verify-token', {
          ...key,
          method: 'POST',
          body: JSON.stringify({ provider: 'cloudflare', credentials: { apiToken: 'tok' } }),
        })
      }
      for (const id of ['k-1', 'k-2', 'k-3', 'k-4']) expect((await keyCheck(id)).status).toBe(200)
      // A fresh key buys no fresh checks…
      expect((await keyCheck('k-5')).status).toBe(429)
      expect(cloudflareCalls).toBe(4)
      // …but whoever holds the keys can't lock Ben out of his own dashboard.
      expect((await check()).status).toBe(200)
      // The visible rows still name the key that did it.
      const failed = (await events()).filter((e) => e.event === 'connection.verify.failed')
      expect(failed.map((e) => [e.actor, e.actorType, e.actorId])).toContainEqual([
        'k-1',
        'key',
        'k-1',
      ])
    })

    it('lets at most four of a concurrent burst reach Cloudflare', async () => {
      const answers = await Promise.all(Array.from({ length: 10 }, () => check()))
      const statuses = answers.map((r) => r.status)
      expect(statuses.filter((s) => s === 200)).toHaveLength(4)
      expect(statuses.filter((s) => s === 429)).toHaveLength(6)
      expect(cloudflareCalls).toBe(4)
      const locked = (await events()).filter((e) => e.event === 'connection.verify.locked')
      expect(locked.map((e) => e.detail)).toEqual(['4 failed checks · locked for 30 s · Dashboard'])
    })

    it('withdraws a check that never got an answer', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn(async () => {
          throw new Error('network down')
        }),
      )
      for (let i = 0; i < 5; i++) expect((await check()).status).toBe(500)
      expect(
        h.sqlite
          .prepare(
            "SELECT count(*) AS n FROM audit_events WHERE event = 'connection.verify.attempt'",
          )
          .get(),
      ).toEqual({ n: 0 })
    })

    it('forgets failures older than an hour', async () => {
      for (let i = 0; i < 4; i++) await check()
      at('11:00:01')
      expect((await check()).status).toBe(200)
      expect((await check()).status).toBe(200)
    })
  })
})
