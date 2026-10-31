import { beforeEach, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import type { AccountExport, ApiAccount, AccountSession } from '@awaitstep/ir'
import { createSqliteApp, seedAcme, type SqliteApp } from './sqlite-app.js'

// Your account (B10) through the app on a real database: Ama owns Acme alone
// (Ben is its admin) and is a plain member of Globex (Cleo owns it). The
// harness's session for a person is `session-<id>`.

const FUTURE = '2099-01-01T00:00:00.000Z'
const CHROME =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36'

let h: SqliteApp

async function addSession(id: string, userId: string, updatedAt: string, userAgent = CHROME) {
  await h.db.insert(h.schema.session).values({
    id,
    userId,
    token: `token-${id}`,
    expiresAt: FUTURE,
    createdAt: '2026-10-20T00:00:00.000Z',
    updatedAt,
    ipAddress: '81.2.69.160',
    userAgent,
  })
}

async function personRows(table: string, userId: string): Promise<number> {
  const column = table === 'project_members' || table === 'workspace_members' ? 'user_id' : 'userId'
  return (
    h.sqlite.prepare(`SELECT count(*) AS n FROM ${table} WHERE ${column} = ?`).get(userId) as {
      n: number
    }
  ).n
}

function auditOf(organizationId: string) {
  return h.sqlite
    .prepare(
      `SELECT event, action, target, actor_id AS actorId FROM audit_events WHERE organization_id = ? ORDER BY created_at`,
    )
    .all(organizationId) as { event: string; action: string; target: string; actorId: string }[]
}

beforeEach(async () => {
  h = createSqliteApp({ accountProviders: { github: true, google: false, emailLink: true } })
  await seedAcme(h)
  await addSession('session-u-ama', 'u-ama', '2026-10-28T09:00:00.000Z')
  await addSession('s-phone', 'u-ama', '2026-10-28T11:00:00.000Z', 'curl/8.7.1')
  await addSession('s-ben', 'u-ben', '2026-10-28T11:30:00.000Z')
})

describe('GET /api/account', () => {
  it('answers the person, their orgs, why delete is off and their ways in', async () => {
    await h.db.insert(h.schema.account).values({
      id: 'a-gh',
      accountId: '1234',
      providerId: 'github',
      userId: 'u-ama',
      createdAt: '2026-10-21T00:00:00.000Z',
      updatedAt: '2026-10-21T00:00:00.000Z',
    })
    const res = await h.app.request('/api/account', h.as('u-ama'))
    expect(res.status).toBe(200)
    const body = (await res.json()) as ApiAccount
    expect(body.person).toEqual({
      id: 'u-ama',
      name: 'Ama Mensah',
      email: 'ama@acme.test',
      image: null,
      emailVerified: true,
    })
    expect(body.orgs.map((o) => [o.name, o.role, o.projectCount, o.onlyOwner])).toEqual([
      ['Acme', 'owner', 2, true],
      ['Globex', 'member', 0, false],
    ])
    expect(body.deleteBlockedReason).toBe("You're the only owner of Acme")
    expect(body.signInMethods).toEqual([
      {
        provider: 'github',
        connected: true,
        connectedAt: '2026-10-21T00:00:00.000Z',
        accountId: 'a-gh',
      },
      { provider: 'email', connected: true, connectedAt: null, accountId: null },
    ])
    expect(body.providers).toEqual({ github: true, google: false, emailLink: true })
  })

  it('lists a provider the instance turned off while it is still linked, so it can be disconnected', async () => {
    await h.db.insert(h.schema.account).values({
      id: 'a-go',
      accountId: '99',
      providerId: 'google',
      userId: 'u-ben',
      createdAt: '2026-10-21T00:00:00.000Z',
      updatedAt: '2026-10-21T00:00:00.000Z',
    })
    const body = (await (await h.app.request('/api/account', h.as('u-ben'))).json()) as ApiAccount
    expect(body.signInMethods.map((m) => [m.provider, m.connected])).toEqual([
      ['github', false],
      ['google', true],
      ['email', true],
    ])
    expect(body.deleteBlockedReason).toBeNull()
  })

  it('refuses API keys: the account is the person’s alone', async () => {
    const key = await h.seed.key('k-1', 'u-ama', { level: 'organization' }, { workflows: ['read'] })
    const res = await h.app.request('/api/account', key)
    expect(res.status).toBe(403)
  })
})

describe('POST /api/account/orgs/:orgId/leave', () => {
  it('leaves an organization with every row below it and records it there', async () => {
    await h.seed.projectGrant('p-g', 'u-ama', 'member')
    await h.seed.workspaceGrant('ws-g', 'u-ama', 'editor')
    const res = await h.app.request(
      '/api/account/orgs/org-globex/leave',
      h.as('u-ama', { method: 'POST' }),
    )
    expect(res.status).toBe(200)
    expect(await h.adapter.getOrgRole('org-globex', 'u-ama')).toBeNull()
    expect(await personRows('project_members', 'u-ama')).toBe(0)
    expect(await personRows('workspace_members', 'u-ama')).toBe(0)
    expect(auditOf('org-globex')).toEqual([
      { event: 'member.leave', action: 'left', target: 'Globex', actorId: 'u-ama' },
    ])
  })

  it('refuses the only owner, and leaves everything as it was', async () => {
    const res = await h.app.request(
      '/api/account/orgs/org-acme/leave',
      h.as('u-ama', { method: 'POST' }),
    )
    expect(res.status).toBe(409)
    expect(await h.adapter.getOrgRole('org-acme', 'u-ama')).toBe('owner')
    expect(auditOf('org-acme')).toEqual([])
  })

  it('lets an owner leave once someone else owns it too', async () => {
    await h.db
      .update(h.schema.member)
      .set({ role: 'owner' })
      .where(eq(h.schema.member.id, 'm-org-acme-u-ben'))
    const res = await h.app.request(
      '/api/account/orgs/org-acme/leave',
      h.as('u-ama', { method: 'POST' }),
    )
    expect(res.status).toBe(200)
    expect(await h.adapter.getOrgRole('org-acme', 'u-ama')).toBeNull()
  })

  it('is not found for an organization the person is not in', async () => {
    const res = await h.app.request(
      '/api/account/orgs/org-globex/leave',
      h.as('u-ben', { method: 'POST' }),
    )
    expect(res.status).toBe(404)
  })
})

describe('sessions', () => {
  it('lists the person’s sessions by id, current first, the address masked and no token', async () => {
    const res = await h.app.request('/api/account/sessions', h.as('u-ama'))
    expect(res.status).toBe(200)
    const { data } = (await res.json()) as { data: AccountSession[] }
    expect(data).toEqual([
      {
        id: 'session-u-ama',
        device: 'Chrome on macOS',
        kind: 'desktop',
        ip: '81.2.69.x',
        signedInAt: '2026-10-20T00:00:00.000Z',
        activeAt: '2026-10-28T09:00:00.000Z',
        current: true,
      },
      expect.objectContaining({ id: 's-phone', device: 'curl', kind: 'terminal', current: false }),
    ])
    expect(JSON.stringify(data)).not.toContain('token')
  })

  it('signs out another session, and refuses the current one and other people’s', async () => {
    const del = (id: string) =>
      h.app.request(`/api/account/sessions/${id}`, h.as('u-ama', { method: 'DELETE' }))
    expect((await del('session-u-ama')).status).toBe(400)
    expect((await del('s-ben')).status).toBe(404)
    expect((await del('s-phone')).status).toBe(200)
    expect((await del('s-phone')).status).toBe(404)
    expect(await personRows('session', 'u-ben')).toBe(1)
    expect(auditOf('org-acme').map((e) => [e.event, e.action, e.target])).toEqual([
      ['session.revoke', 'signed out a session of', 'their account'],
    ])
    expect(auditOf('org-globex').map((e) => e.event)).toEqual(['session.revoke'])
  })

  it('signs out every other session at once', async () => {
    await addSession('s-tablet', 'u-ama', '2026-10-28T10:00:00.000Z')
    const res = await h.app.request(
      '/api/account/sessions?scope=others',
      h.as('u-ama', { method: 'DELETE' }),
    )
    expect(await res.json()).toEqual({ count: 2 })
    expect(await personRows('session', 'u-ama')).toBe(1)
    expect(auditOf('org-acme').map((e) => e.action)).toEqual(['signed out 2 sessions of'])
  })

  it('needs scope=others to sign out more than one', async () => {
    const res = await h.app.request('/api/account/sessions', h.as('u-ama', { method: 'DELETE' }))
    expect(res.status).toBe(400)
    expect(await personRows('session', 'u-ama')).toBe(2)
  })
})

describe('POST /api/account/export', () => {
  it('downloads the person’s own rows and records the download', async () => {
    await h.seed.workspaceGrant('ws-g', 'u-ama', 'editor')
    const res = await h.app.request('/api/account/export', h.as('u-ama', { method: 'POST' }))
    expect(res.status).toBe(200)
    const body = (await res.json()) as AccountExport
    expect(body.profile).toEqual({ name: 'Ama Mensah', email: 'ama@acme.test', photo: false })
    expect(body.sessions.map((s) => s.id)).toEqual(['session-u-ama', 's-phone'])
    expect(body.memberships).toEqual([
      { organization: 'Acme', role: 'owner', projects: [], workspaces: [] },
      {
        organization: 'Globex',
        role: 'member',
        projects: [],
        workspaces: [{ project: 'Globex app', name: 'Default', role: 'editor' }],
      },
    ])
    // Nothing the organizations own: no workflows, and no one else.
    expect(JSON.stringify(body)).not.toMatch(/In sales|ben@acme/)
    expect(auditOf('org-acme').map((e) => e.event)).toEqual(['account.export'])
  })

  it('is a POST, so a cross-site link can’t write audit rows', async () => {
    const res = await h.app.request('/api/account/export', h.as('u-ama'))
    expect(res.status).toBe(404)
    expect(auditOf('org-acme')).toEqual([])
  })
})
