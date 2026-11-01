import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { presetPermissions, type ConnectionSummary } from '@awaitstep/ir'
import { CONNECTION_NOT_SERVING, prepareDeploy } from '../lib/deploy-prepare.js'
import { recheckConnectionTokens } from '../lib/connection-token.js'
import { runMaintenance } from '../lib/maintenance.js'
import { stubCloudflare, type CloudflareAnswer } from './fixtures/cloudflare.js'
import { createSqliteApp, seedAcme, type SqliteApp } from './sqlite-app.js'

// Connections on the API (B9), on a real database: who may change them,
// the token check on create and replace, which projects one serves and
// what that holds a deploy to, the dashboard's list, the daily re-check and
// its Inbox rows, and the empty-project setup counts.

const ACCOUNT = 'a'.repeat(32)
const ACME = [{ id: ACCOUNT, name: 'Acme' }]

describe('connections on the API', () => {
  let h: SqliteApp
  let answer: CloudflareAnswer
  let calls: { verify: number }

  beforeEach(async () => {
    h = createSqliteApp()
    await seedAcme(h)
    answer = { status: 'active', accounts: ACME }
    calls = stubCloudflare(() => answer)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.useRealTimers()
  })

  const call = (who: string, path: string, init: RequestInit = {}) =>
    h.app.request(`/api${path}`, h.as(who, init))
  const send = (who: string, path: string, body: unknown, method = 'POST') =>
    call(who, path, h.json(body, method))

  const connect = (who = 'u-ama', over: Record<string, unknown> = {}) =>
    send(who, '/connections?org=acme', {
      provider: 'cloudflare',
      name: 'Acme production',
      credentials: { accountId: ACCOUNT, apiToken: 'tok-1' },
      ...over,
    })

  async function connected(over: Record<string, unknown> = {}): Promise<ConnectionSummary> {
    const res = await connect('u-ama', over)
    expect(res.status).toBe(201)
    return res.json()
  }

  async function list(who = 'u-ama', query = ''): Promise<ConnectionSummary[]> {
    const res = await call(who, `/connections?org=acme${query}`)
    expect(res.status).toBe(200)
    return (await res.json()).data
  }

  async function inbox(who: string) {
    const res = await call(who, '/notifications?org=acme')
    expect(res.status).toBe(200)
    return (await res.json()).data as { event: string; title: string }[]
  }

  describe('create', () => {
    it('checks the token and stores what Cloudflare said', async () => {
      answer = { status: 'active', expiresOn: '2026-12-01T00:00:00Z', accounts: ACME }
      const created = await connected()
      expect(created).toMatchObject({
        name: 'Acme production',
        accountSuffix: 'aaaa',
        createdByName: 'Ama Mensah',
        allProjects: true,
        projects: [],
        tokenStatus: 'active',
        tokenExpiresAt: '2026-12-01T00:00:00.000Z',
        deployments: { count: 0, lastAt: null },
        credentials: { accountId: ACCOUNT, apiToken: '***' },
      })
      expect(created.tokenCheckedAt).not.toBeNull()
      expect(JSON.stringify(created)).not.toContain('tok-1')
    })

    it('refuses a token Cloudflare refuses, on the token field, and stores nothing', async () => {
      answer = { status: 'refused' }
      const res = await connect()
      expect(res.status).toBe(400)
      expect(await res.json()).toMatchObject({ field: 'token' })
      answer = { status: 'expired' }
      expect((await connect()).status).toBe(400)
      expect(await list()).toEqual([])
    })

    it('refuses a token that can’t reach the account, on the account field', async () => {
      answer = { status: 'active', accounts: [{ id: 'b'.repeat(32), name: 'Other' }] }
      const res = await connect()
      expect(res.status).toBe(400)
      expect(await res.json()).toMatchObject({ field: 'accountId' })
    })

    it('accepts the account when Cloudflare can’t say whether the token reaches it', async () => {
      answer = { status: 'active', accounts: [], accountLookupFails: true }
      expect((await connect()).status).toBe(201)
    })

    it('finds the account directly, however many the token reaches', async () => {
      // Past the first 50 a listing would miss it; the direct lookup doesn't.
      const many = Array.from({ length: 60 }, (_, i) => ({
        id: `${i}`.padStart(32, 'b'),
        name: `${i}`,
      }))
      answer = { status: 'active', accounts: [...many, ...ACME] }
      expect((await connect()).status).toBe(201)
    })

    it('answers 502 and stores nothing when Cloudflare can’t be reached', async () => {
      answer = { status: 'down' }
      expect((await connect()).status).toBe(502)
      expect(await list()).toEqual([])
    })

    it('allows ten token replacements a minute per person, as creates', async () => {
      const { id } = await connected()
      for (let i = 0; i < 9; i++) {
        const res = await send(
          'u-ama',
          `/connections/${id}?org=acme`,
          { credentials: { apiToken: `tok-${i}` } },
          'PATCH',
        )
        expect(res.status).toBe(200)
      }
      // The create spent one of Ama's ten; the PATCHes the other nine.
      expect(
        (await send('u-ama', `/connections/${id}?org=acme`, { name: 'X' }, 'PATCH')).status,
      ).toBe(429)
    })

    it('allows ten creates a minute per person, as token checks', async () => {
      for (let i = 0; i < 10; i++)
        expect((await connect('u-ama', { name: `C ${i}` })).status).toBe(201)
      const limited = await connect('u-ama', { name: 'C 10' })
      expect(limited.status).toBe(429)
      // Ben's budget is his own.
      expect((await connect('u-ben', { name: 'Ben’s' })).status).toBe(201)
    })

    it('refuses an account id that isn’t 32 hex digits before asking Cloudflare', async () => {
      const res = await connect('u-ama', {
        credentials: { accountId: 'x/../..', apiToken: 'tok' },
      })
      expect(res.status).toBe(400)
      expect(await res.json()).toMatchObject({ field: 'accountId' })
      expect(calls.verify).toBe(0)
      const { id } = await connected()
      const patched = await send(
        'u-ama',
        `/connections/${id}?org=acme`,
        { credentials: { accountId: 'nope', apiToken: 'tok-2' } },
        'PATCH',
      )
      expect(patched.status).toBe(400)
    })

    it('refuses a provider this build doesn’t have', async () => {
      expect((await connect('u-ama', { provider: 'acme-cloud' })).status).toBe(400)
      expect(calls.verify).toBe(0)
    })

    it('narrows to the projects named, and refuses another organization’s', async () => {
      const created = await connected({ projectIds: ['p-101'] })
      expect(created).toMatchObject({
        allProjects: false,
        projects: [{ id: 'p-101', name: 'Project 101', slug: 'project-101' }],
      })
      const foreign = await connect('u-ama', { projectIds: ['p-101', 'p-g'] })
      expect(foreign.status).toBe(400)
      expect(await foreign.json()).toMatchObject({ field: 'projects' })
      expect(await list()).toHaveLength(1)
    })
  })

  describe('who may change connections', () => {
    it('lets owners and admins change them, and members only read', async () => {
      const { id } = await connected()
      expect((await connect('u-ben')).status).toBe(201)
      expect((await connect('u-dan')).status).toBe(403)
      expect(
        (await send('u-dan', `/connections/${id}?org=acme`, { name: 'X' }, 'PATCH')).status,
      ).toBe(403)
      expect(
        (await call('u-fay', `/connections/${id}?org=acme`, { method: 'DELETE' })).status,
      ).toBe(403)
      expect(await list('u-fay')).toHaveLength(2)
      // The refusal came before Cloudflare was asked.
      expect(calls.verify).toBe(2)
    })

    it('lets an organization key read only the projects its creator can see now', async () => {
      await connected({ projectIds: ['p-101', 'p-202'] })
      // Minted by Dan, a member of Project 101 only: as if an admin had been demoted.
      const key = await h.seed.key(
        'k-dan-read',
        'u-dan',
        { level: 'organization' },
        {
          connections: ['read'],
        },
      )
      const res = await h.app.request('/api/connections', key)
      expect(res.status).toBe(200)
      expect((await res.json()).data[0]).toMatchObject({
        projects: [{ id: 'p-101' }],
        hiddenProjects: 1,
      })
    })

    it('holds a key to its creator’s standing', async () => {
      const full = { connections: ['read', 'write', 'delete'] }
      const byAma = await h.seed.key('k-ama', 'u-ama', { level: 'organization' }, full)
      const byDan = await h.seed.key('k-dan', 'u-dan', { level: 'organization' }, full)
      const body = JSON.stringify({
        provider: 'cloudflare',
        name: 'From key',
        credentials: { accountId: ACCOUNT, apiToken: 'tok' },
      })
      expect(
        (await h.app.request('/api/connections', { ...byAma, method: 'POST', body })).status,
      ).toBe(201)
      expect(
        (await h.app.request('/api/connections', { ...byDan, method: 'POST', body })).status,
      ).toBe(403)
    })
  })

  describe('edit', () => {
    it('replaces the token, keeps the account, and re-checks', async () => {
      const { id } = await connected()
      answer = { status: 'active', expiresOn: '2027-01-01T00:00:00Z', accounts: ACME }
      const res = await send(
        'u-ama',
        `/connections/${id}?org=acme`,
        { credentials: { apiToken: 'tok-2' } },
        'PATCH',
      )
      expect(res.status).toBe(200)
      expect(await res.json()).toMatchObject({
        credentials: { accountId: ACCOUNT, apiToken: '***' },
        tokenExpiresAt: '2027-01-01T00:00:00.000Z',
      })
      const stored = await h.adapter.getProviderConnectionById(id)
      expect(JSON.parse(stored!.credentials)).toEqual({ accountId: ACCOUNT, apiToken: 'tok-2' })
    })

    it('keeps the old token when the new one is refused', async () => {
      const { id } = await connected()
      answer = { status: 'refused' }
      const res = await send(
        'u-ama',
        `/connections/${id}?org=acme`,
        { credentials: { apiToken: 'tok-bad' } },
        'PATCH',
      )
      expect(res.status).toBe(400)
      const stored = await h.adapter.getProviderConnectionById(id)
      expect(JSON.parse(stored!.credentials).apiToken).toBe('tok-1')
    })

    it('renames without asking Cloudflare, and changes the projects', async () => {
      const { id } = await connected()
      const before = calls.verify
      const renamed = await send(
        'u-ama',
        `/connections/${id}?org=acme`,
        { name: 'Prod', projectIds: ['p-202'] },
        'PATCH',
      )
      expect(renamed.status).toBe(200)
      expect(await renamed.json()).toMatchObject({
        name: 'Prod',
        allProjects: false,
        projects: [{ id: 'p-202' }],
      })
      expect(calls.verify).toBe(before)
      const back = await send(
        'u-ama',
        `/connections/${id}?org=acme`,
        { allProjects: true },
        'PATCH',
      )
      expect(await back.json()).toMatchObject({ allProjects: true, projects: [] })
      const foreign = await send(
        'u-ama',
        `/connections/${id}?org=acme`,
        { projectIds: ['p-g'] },
        'PATCH',
      )
      expect(foreign.status).toBe(400)
    })

    it('asks for the account again when the stored one can’t be read', async () => {
      const { id } = await connected()
      // Credentials stored under another encryption key read back as unreadable text.
      h.sqlite.prepare('UPDATE connections SET credentials = ? WHERE id = ?').run('garbled', id)
      const res = await send(
        'u-ama',
        `/connections/${id}?org=acme`,
        { credentials: { apiToken: 'tok-2' } },
        'PATCH',
      )
      expect(res.status).toBe(400)
      expect(await res.json()).toMatchObject({ field: 'accountId' })
    })

    it('records the change in the audit log', async () => {
      const { id } = await connected()
      await send('u-ama', `/connections/${id}?org=acme`, { projectIds: ['p-101'] }, 'PATCH')
      const res = await call('u-ama', '/audit-events?org=acme')
      const events = (await res.json()).data as { event: string; detail: string }[]
      expect(events.find((e) => e.event === 'connection.update')?.detail).toContain(
        'Projects changed',
      )
    })
  })

  describe('the list', () => {
    it('names the projects each reader can see and counts the rest', async () => {
      await connected({ projectIds: ['p-101', 'p-202'] })
      expect((await list('u-ama'))[0]).toMatchObject({
        projects: [{ id: 'p-101' }, { id: 'p-202' }],
        hiddenProjects: 0,
      })
      // Dan is a member of Project 101 only; Fay of none.
      expect((await list('u-dan'))[0]).toMatchObject({
        projects: [{ id: 'p-101' }],
        hiddenProjects: 1,
      })
      expect((await list('u-fay'))[0]).toMatchObject({ projects: [], hiddenProjects: 2 })
    })

    it('keeps to the connections serving a project, by slug or id', async () => {
      await connected({ name: 'All' })
      await connected({ name: 'Only 202', projectIds: ['p-202'] })
      const names = (rows: ConnectionSummary[]) => rows.map((c) => c.name).sort()
      expect(names(await list('u-ama', '&project=project-101'))).toEqual(['All'])
      expect(names(await list('u-ama', '&projectId=p-202'))).toEqual(['All', 'Only 202'])
      expect(await list('u-ama', '&project=app')).toEqual([])
      // Fay can't open Project 202: the filter doesn't tell her it exists.
      expect(await list('u-fay', '&project=project-202')).toEqual([])
    })
  })

  describe('deploys', () => {
    it('refuses a new deploy to a project the connection doesn’t serve', async () => {
      const { id } = await connected({ projectIds: ['p-202'] })
      const workflow = (await h.adapter.getWorkflowById('wf-sales'))!
      const prepared = await prepareDeploy({
        db: h.adapter,
        workflow,
        organizationId: 'org-acme',
        projectId: 'p-101',
        connectionId: id,
      })
      expect(prepared).toEqual({ error: CONNECTION_NOT_SERVING, status: 403 })
    })

    it('triggers only through a connection the workflow was deployed with', async () => {
      // Security review M1: the Cloudflare workflow is found by name, so another
      // account could hold another project's workflow of the same name.
      const { id } = await connected({ projectIds: ['p-202'] })
      const s = h.schema
      await h.db.insert(s.workflowVersions).values({
        id: 'v-sales-1',
        workflowId: 'wf-sales',
        version: 1,
        ir: '{}',
        createdAt: '2026-10-20T00:00:00.000Z',
      })
      await h.db.update(s.workflows).set({ currentVersionId: 'v-sales-1' })
      const trigger = () =>
        send('u-ama', '/workflows/wf-sales/trigger?projectId=p-101', { connectionId: id })
      const refused = await trigger()
      expect(refused.status).toBe(404)
      expect((await refused.json()).error).toBe('This workflow isn’t deployed with that connection')

      await h.db.insert(s.deployments).values({
        id: 'd-sales',
        workflowId: 'wf-sales',
        versionId: 'v-sales-1',
        connectionId: id,
        serviceName: 'svc',
        status: 'success',
        createdAt: '2026-10-21T00:00:00.000Z',
      })
      // Past the check: it now asks Cloudflare (stubbed to fail here), not refuses.
      const reached = await trigger()
      expect(reached.status).not.toBe(404)
    })

    it('answers an unknown or foreign connection as not found', async () => {
      const workflow = (await h.adapter.getWorkflowById('wf-sales'))!
      const prepared = await prepareDeploy({
        db: h.adapter,
        workflow,
        organizationId: 'org-acme',
        projectId: 'p-101',
        connectionId: 'nope',
      })
      expect(prepared).toMatchObject({ status: 404 })
    })
  })

  describe('the daily re-check', () => {
    const NOW = new Date('2026-10-31T12:00:00.000Z')

    it('fills in a never-checked token and leaves a fresh one alone', async () => {
      const { id } = await connected()
      await h.adapter.updateConnection(id, {
        organizationId: 'org-acme',
        token: { status: 'unchecked', expiresAt: null, checkedAt: null },
      })
      answer = { status: 'active', expiresOn: '2026-11-04T12:00:00Z', accounts: ACME }
      expect(await recheckConnectionTokens(h.adapter, NOW)).toBe(1)
      expect(await h.adapter.getProviderConnectionById(id)).toMatchObject({
        tokenStatus: 'active',
        tokenExpiresAt: '2026-11-04T12:00:00.000Z',
        tokenCheckedAt: NOW.toISOString(),
      })
      expect(await recheckConnectionTokens(h.adapter, NOW)).toBe(0)
    })

    it('marks a dead token and tells its keepers once', async () => {
      // Ama made it (and owns Acme), Ben admins Acme; Fay, a plain member, isn't told.
      const { id } = await connected()
      await h.adapter.updateConnection(id, {
        organizationId: 'org-acme',
        token: { status: 'active', expiresAt: null, checkedAt: '2026-10-29T00:00:00.000Z' },
      })
      answer = { status: 'refused' }
      expect(await recheckConnectionTokens(h.adapter, NOW)).toBe(1)
      expect((await h.adapter.getProviderConnectionById(id))?.tokenStatus).toBe('invalid')
      for (const who of ['u-ama', 'u-ben']) {
        expect((await inbox(who)).map((n) => n.title)).toEqual([
          'Cloudflare token for Acme production no longer works. Deploys to it will fail.',
        ])
      }
      expect(await inbox('u-fay')).toEqual([])
      // A day later, still dead: checked again, nobody told again.
      expect(await recheckConnectionTokens(h.adapter, new Date('2026-11-01T12:00:01.000Z'))).toBe(1)
      expect(await inbox('u-ama')).toHaveLength(1)
    })

    it('keeps an account-owned token working', async () => {
      // Refused at /user/tokens/verify, verified at its account: before B9 review, read as dead.
      answer = { status: 'active', accountToken: true, accounts: ACME }
      const { id } = await connected()
      await h.adapter.updateConnection(id, {
        organizationId: 'org-acme',
        token: { status: 'active', expiresAt: null, checkedAt: '2026-10-29T00:00:00.000Z' },
      })
      expect(await recheckConnectionTokens(h.adapter, NOW)).toBe(1)
      expect((await h.adapter.getProviderConnectionById(id))?.tokenStatus).toBe('active')
      expect(await inbox('u-ama')).toEqual([])
    })

    it('changes nothing while Cloudflare can’t be reached', async () => {
      const { id } = await connected()
      await h.adapter.updateConnection(id, {
        organizationId: 'org-acme',
        token: { status: 'active', expiresAt: null, checkedAt: '2026-10-29T00:00:00.000Z' },
      })
      answer = { status: 'down' }
      expect(await recheckConnectionTokens(h.adapter, NOW)).toBe(0)
      expect(await h.adapter.getProviderConnectionById(id)).toMatchObject({
        tokenStatus: 'active',
        tokenCheckedAt: '2026-10-29T00:00:00.000Z',
      })
    })

    it('checks the rest when one row’s write fails, and still warns of expiry', async () => {
      vi.useFakeTimers({ toFake: ['Date'] })
      vi.setSystemTime(NOW)
      const a = await connected({ name: 'A' })
      const b = await connected({ name: 'B' })
      for (const { id } of [a, b]) {
        await h.adapter.updateConnection(id, {
          organizationId: 'org-acme',
          token: { status: 'unchecked', expiresAt: null, checkedAt: null },
        })
      }
      answer = { status: 'active', expiresOn: '2026-11-06T12:00:00Z', accounts: ACME }
      const real = h.adapter.recordConnectionTokenCheck.bind(h.adapter)
      vi.spyOn(h.adapter, 'recordConnectionTokenCheck').mockImplementation((id, read, check) =>
        id === a.id ? Promise.reject(new Error('disk full')) : real(id, read, check),
      )
      expect(await recheckConnectionTokens(h.adapter, NOW)).toBe(1)
      expect((await h.adapter.getProviderConnectionById(b.id))?.tokenStatus).toBe('active')
      // A whole re-check failing never stops the expiry warnings.
      vi.spyOn(h.adapter, 'connectionsDueForTokenCheck').mockRejectedValue(new Error('down'))
      await runMaintenance(h.adapter, NOW)
      expect((await inbox('u-ben')).map((n) => n.title)).toEqual([
        'Cloudflare token for B expires in 6 days. Deploys to it will stop.',
      ])
    })

    it('takes the warnings back when the token is replaced or the connection removed', async () => {
      vi.useFakeTimers({ toFake: ['Date'] })
      vi.setSystemTime(NOW)
      answer = { status: 'active', expiresOn: '2026-11-06T12:00:00Z', accounts: ACME }
      const { id } = await connected()
      await runMaintenance(h.adapter, NOW)
      expect(await inbox('u-ben')).toHaveLength(1)
      answer = { status: 'active', accounts: ACME }
      expect(
        (
          await send(
            'u-ama',
            `/connections/${id}?org=acme`,
            { credentials: { apiToken: 'tok-2' } },
            'PATCH',
          )
        ).status,
      ).toBe(200)
      expect(await inbox('u-ben')).toEqual([])

      answer = { status: 'active', expiresOn: '2026-11-06T12:00:00Z', accounts: ACME }
      const other = await connected({ name: 'Other' })
      await runMaintenance(h.adapter, NOW)
      expect(await inbox('u-ben')).toHaveLength(1)
      await call('u-ama', `/connections/${other.id}?org=acme`, { method: 'DELETE' })
      expect(await inbox('u-ben')).toEqual([])
    })

    it('checks at most twenty a tick', async () => {
      for (let i = 0; i < 22; i++) {
        await h.adapter.createConnection({
          id: `c-${i}`,
          organizationId: 'org-acme',
          createdBy: 'u-ama',
          provider: 'cloudflare',
          name: `C ${i}`,
          credentials: JSON.stringify({ accountId: ACCOUNT, apiToken: 'tok' }),
        })
      }
      expect(await recheckConnectionTokens(h.adapter, NOW)).toBe(20)
      expect(await recheckConnectionTokens(h.adapter, NOW)).toBe(2)
    })

    it('warns of an expiring token in the same tick that learns of it', async () => {
      vi.useFakeTimers({ toFake: ['Date'] })
      vi.setSystemTime(NOW)
      const { id } = await connected()
      await h.adapter.updateConnection(id, {
        organizationId: 'org-acme',
        token: { status: 'unchecked', expiresAt: null, checkedAt: null },
      })
      answer = { status: 'active', expiresOn: '2026-11-06T12:00:00Z', accounts: ACME }
      await runMaintenance(h.adapter, NOW)
      expect((await inbox('u-ben')).map((n) => n.title)).toEqual([
        'Cloudflare token for Acme production expires in 6 days. Deploys to it will stop.',
      ])
      await runMaintenance(h.adapter, NOW)
      expect(await inbox('u-ben')).toHaveLength(1)
    })
  })

  describe('project setup', () => {
    it('says connected once the project has a working account that serves it', async () => {
      const setup = async () => (await call('u-ama', '/projects/p-101/setup')).json()
      expect(await setup()).toMatchObject({ cloudflareConnected: false })
      const { id } = await connected({ projectIds: ['p-202'] })
      expect(await setup()).toMatchObject({ cloudflareConnected: false })
      await send('u-ama', `/connections/${id}?org=acme`, { projectIds: ['p-101'] }, 'PATCH')
      // Serving it isn't enough: the project adds the account (23b).
      expect(await setup()).toMatchObject({ cloudflareConnected: false })
      await send('u-ama', '/projects/p-101/connections', { connectionIds: [id] })
      expect(await setup()).toEqual({
        cloudflareConnected: true,
        orgVariables: 0,
        projectVariables: 0,
        projectKeys: 0,
      })
    })

    it('hides a project the caller can’t see, and refuses keys', async () => {
      // Fay has no grant in Project 101.
      expect((await call('u-fay', '/projects/p-101/setup')).status).toBe(404)
      const key = await h.seed.key(
        'k-p',
        'u-ama',
        { level: 'project', projectId: 'p-101' },
        presetPermissions('project', 'full'),
      )
      expect((await h.app.request('/api/projects/p-101/setup', key)).status).toBe(403)
    })
  })
})
