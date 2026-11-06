import { describe, it, expect, beforeEach, vi } from 'vitest'
import { eq } from 'drizzle-orm'
import type { WorkflowProvider, WorkflowRunDetail } from '@awaitstep/codegen'
import type { InboxPage } from '@awaitstep/ir'
import { runMaintenance } from '../lib/maintenance.js'
import { syncActiveRuns } from '../lib/run-sync.js'
import { createSqliteApp, seedAcme, type SqliteApp } from './sqlite-app.js'

// The Inbox and What's new (B8) through the API on a real database: who is
// told what, read marks, the keys' refusal, and the periodic jobs.

describe('the Inbox', () => {
  let h: SqliteApp
  beforeEach(async () => {
    h = createSqliteApp()
    await seedAcme(h)
  })

  const inbox = async (as: string, org = 'acme'): Promise<InboxPage> => {
    const res = await h.app.request(`/api/notifications?org=${org}`, h.as(as))
    expect(res.status).toBe(200)
    return res.json()
  }
  const ask = (as = 'u-eve') =>
    h.app.request('/api/workspaces/ws-sales/access-requests', h.as(as, { method: 'POST' }))
  const decide = (id: string, decision: 'approve' | 'decline', as = 'u-ben') =>
    h.app.request(`/api/access-requests/${id}/${decision}`, h.as(as, { method: 'POST' }))

  describe('edit-access requests', () => {
    it('reach the addressee once, waiting on them, and email them', async () => {
      const { id } = await (await ask()).json()
      await ask()
      const ama = await inbox('u-ama')
      expect(ama.data).toHaveLength(1)
      expect(ama.data[0]).toMatchObject({
        kind: 'request',
        event: 'access_request.create',
        title: 'Eve Park asked for edit access to Sales',
        where: 'Project 101 · Sales',
        read: false,
        needsAction: true,
        request: { id, status: 'pending' },
      })
      expect(ama.counts).toEqual({ all: 1, unread: 1, action: 1 })
      expect(h.sent.accessRequests).toEqual([
        {
          to: 'ama@acme.test',
          url: 'http://web.test/acme/inbox',
          askerName: 'Eve Park',
          workspaceName: 'Sales',
          projectName: 'Project 101',
        },
      ])
      // Nobody else hears of it, the asker included.
      expect((await inbox('u-ben')).data).toEqual([])
      expect((await inbox('u-eve')).data).toEqual([])
    })

    it('show the outcome once answered, and tell the asker', async () => {
      const { id } = await (await ask()).json()
      expect((await decide(id, 'approve')).status).toBe(200)
      const [row] = (await inbox('u-ama')).data
      expect(row).toMatchObject({
        read: true,
        needsAction: false,
        request: { status: 'approved', outcome: 'Approved. Eve is now an Editor in Sales.' },
      })
      const eve = await inbox('u-eve')
      expect(eve.data).toHaveLength(1)
      expect(eve.data[0]).toMatchObject({
        kind: 'people',
        title: 'Ben Okoro gave you edit access to Sales',
        link: {
          label: 'Open',
          to: { kind: 'workspace', project: 'project-101', workspace: 'sales', page: 'workflows' },
        },
      })
      // The decider is never told about their own answer.
      expect((await inbox('u-ben')).data).toEqual([])
    })

    it('tell the asker of a decline', async () => {
      const { id } = await (await ask()).json()
      await decide(id, 'decline')
      expect((await inbox('u-eve')).data[0]!.title).toBe(
        'Ben Okoro declined your request for edit access to Sales',
      )
      expect((await inbox('u-ama')).data[0]!.request).toMatchObject({
        status: 'declined',
        outcome: 'Declined. Eve was told.',
      })
    })

    it('answer a lost race with 409 and tell nobody twice', async () => {
      const { id } = await (await ask()).json()
      const spy = vi.spyOn(h.adapter, 'decideAccessRequest').mockResolvedValueOnce(false)
      expect((await decide(id, 'decline')).status).toBe(409)
      spy.mockRestore()
      expect((await inbox('u-eve')).data).toEqual([])
    })

    it('come back when asked again after the row is gone, without a second email', async () => {
      await ask()
      // The row purged (or a write that failed): the request is still open.
      await h.db.delete(h.schema.notifications)
      expect((await inbox('u-ama')).data).toEqual([])
      expect((await ask()).status).toBe(200)
      expect((await inbox('u-ama')).data.map((n) => n.event)).toEqual(['access_request.create'])
      // The second insert emails again: it is a new row the admin hasn't seen.
      expect(h.sent.accessRequests).toHaveLength(2)
      await ask()
      expect(h.sent.accessRequests).toHaveLength(2)
    })

    it('read an asker with no name as their address', async () => {
      await h.db.update(h.schema.user).set({ name: '' }).where(eq(h.schema.user.id, 'u-eve'))
      h.people.set('u-eve', { ...h.people.get('u-eve')!, name: '' })
      const { id } = await (await ask()).json()
      expect((await inbox('u-ama')).data[0]!.title).toBe(
        'eve@acme.test asked for edit access to Sales',
      )
      expect(h.sent.accessRequests[0]!.askerName).toBe('eve@acme.test')
      await decide(id, 'approve')
      expect((await inbox('u-ama')).data[0]!.request!.outcome).toBe(
        'Approved. eve@acme.test is now an Editor in Sales.',
      )
    })

    it('still answer when the Inbox write fails', async () => {
      const { id } = await (await ask()).json()
      vi.spyOn(h.adapter, 'notify').mockRejectedValueOnce(new Error('disk full'))
      expect((await decide(id, 'approve')).status).toBe(200)
    })
  })

  describe('invitations', () => {
    const invite = async () => {
      const res = await h.app.request(
        '/api/invitations?org=acme',
        h.as('u-ama', h.json({ emails: ['hal@example.test'], role: 'member', places: [] })),
      )
      expect(res.status).toBe(201)
      return ((await res.json()) as { data: { id: string }[] }).data[0]!.id
    }
    const answer = (id: string, verb: string, as = 'u-hal') =>
      h.app.request(`/api/invitations/${id}/${verb}`, h.as(as, { method: 'POST' }))

    it('tell the inviter of an accept', async () => {
      const id = await invite()
      expect((await answer(id, 'accept')).status).toBe(200)
      const [row] = (await inbox('u-ama')).data
      expect(row).toMatchObject({
        kind: 'people',
        title: 'hal@example.test accepted your invite',
        where: 'Acme · Members',
        needsAction: false,
        link: { label: 'See members', to: { kind: 'org-settings', page: 'members' } },
      })
    })

    it('tell the inviter of a decline, and take it back on Undo', async () => {
      const id = await invite()
      await answer(id, 'decline')
      await answer(id, 'decline')
      const ama = await inbox('u-ama')
      expect(ama.data.map((n) => n.title)).toEqual(['Hal Ito declined your invite to Acme'])
      await answer(id, 'undo-decline')
      expect((await inbox('u-ama')).data).toEqual([])
    })

    it('limit declining and undoing, each of which puts a row in the inviter’s Inbox', async () => {
      const id = await invite()
      const statuses: number[] = []
      for (let i = 0; i < 6; i++) {
        statuses.push((await answer(id, 'decline')).status)
        statuses.push((await answer(id, 'undo-decline')).status)
      }
      expect(statuses.slice(0, 10).every((s) => s === 200)).toBe(true)
      expect(statuses.slice(10)).toEqual([429, 429])
    })

    it('ask the inviter for a new invite, until they resend it', async () => {
      const id = await invite()
      await h.db
        .update(h.schema.invitation)
        .set({ expiresAt: '2026-01-01T00:00:00.000Z' })
        .where(eq(h.schema.invitation.id, id))
      expect((await answer(id, 'ask-again')).status).toBe(200)
      expect((await inbox('u-ama')).data[0]).toMatchObject({
        title: 'hal@example.test asked for a new invite to Acme',
        needsAction: true,
      })
      const resend = await h.app.request(
        `/api/invitations/${id}/resend?org=acme`,
        h.as('u-ama', { method: 'POST' }),
      )
      expect(resend.status).toBe(200)
      expect((await inbox('u-ama')).data).toEqual([])
    })
  })

  describe('read marks', () => {
    beforeEach(async () => {
      await ask()
    })

    it('mark one row, and refuse another person’s', async () => {
      const [row] = (await inbox('u-ama')).data
      const other = await h.app.request(
        `/api/notifications/${row!.id}/read?org=acme`,
        h.as('u-ben', { method: 'POST' }),
      )
      expect(other.status).toBe(404)
      const own = await h.app.request(
        `/api/notifications/${row!.id}/read?org=acme`,
        h.as('u-ama', { method: 'POST' }),
      )
      expect(own.status).toBe(200)
      expect((await inbox('u-ama')).counts.unread).toBe(0)
    })

    it('mark all, in this organization only', async () => {
      const res = await h.app.request(
        '/api/notifications/read-all?org=acme',
        h.as('u-ama', { method: 'POST' }),
      )
      expect(await res.json()).toEqual({ updated: 1 })
      expect((await inbox('u-ama')).counts.unread).toBe(0)
      expect((await inbox('u-ama', 'globex')).data).toEqual([])
    })
  })

  it('refuses every key, and an organization the person is not in', async () => {
    const orgKey = await h.seed.key(
      'k-org',
      'u-ama',
      { level: 'organization' },
      {
        audit: ['read'],
        members: ['read'],
      },
    )
    for (const [method, path] of [
      ['GET', '/api/notifications?org=acme'],
      ['POST', '/api/notifications/read-all?org=acme'],
      ['POST', '/api/notifications/x/read?org=acme'],
      ['GET', '/api/releases/visit'],
      ['PUT', '/api/releases/visit'],
    ] as const) {
      expect((await h.app.request(path, { ...orgKey, method })).status).toBe(403)
    }
    expect(
      (await h.app.request('/api/notifications?org=globex', h.as('u-ben'))).status,
    ).toBeGreaterThanOrEqual(403)
  })

  describe('failing runs', () => {
    const provider = (detail: Partial<WorkflowRunDetail>): WorkflowProvider =>
      ({
        getRunDetail: async () =>
          ({
            instanceId: 'inst',
            status: 'errored',
            steps: [
              { name: 'Fetch company', kind: 'do', index: 1, status: 'errored', attemptCount: 3 },
            ],
            ...detail,
          }) as WorkflowRunDetail,
      }) as unknown as WorkflowProvider

    beforeEach(async () => {
      await h.seed.workspaceGrant('ws-sales', 'u-fay', 'admin')
      await h.db
        .update(h.schema.workflows)
        .set({ createdBy: 'u-dan', name: 'Lead enrichment' })
        .where(eq(h.schema.workflows.id, 'wf-sales'))
      await h.db.insert(h.schema.workflowVersions).values({
        id: 'v-1',
        workflowId: 'wf-sales',
        version: 1,
        ir: '{}',
        createdAt: '2026-10-20T00:00:00.000Z',
      })
      await h.adapter.createConnection({
        id: 'conn-1',
        organizationId: 'org-acme',
        provider: 'cloudflare',
        name: 'CF',
        createdBy: 'u-ama',
        credentials: JSON.stringify({ accountId: 'acc', apiToken: 'tok' }),
      })
    })

    const run = (id: string) =>
      h.adapter.createRun({
        id,
        workflowId: 'wf-sales',
        versionId: 'v-1',
        versionNumber: 1,
        connectionId: 'conn-1',
        instanceId: `inst-${id}`,
        status: 'running',
      })
    const sync = (detail: Partial<WorkflowRunDetail> = {}) =>
      syncActiveRuns(h.adapter, { provider: provider(detail), emails: h.emails })

    it('tell the creator and the workspace’s admins, folding repeats, emailing once', async () => {
      // Mid-hour, so both failures land in one clock hour however long the test takes.
      vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-10-30T12:20:00.000Z') })
      await run('r-1')
      await sync()
      await run('r-2')
      await sync()
      for (const who of ['u-dan', 'u-fay']) {
        const page = await inbox(who)
        expect(page.data).toHaveLength(1)
        expect(page.data[0]).toMatchObject({
          kind: 'failure',
          title: 'Lead enrichment failed 2 times in the last hour, at step “Fetch company”',
          count: 2,
          needsAction: true,
          link: {
            label: 'See runs',
            to: { kind: 'workspace', project: 'project-101', workspace: 'sales', page: 'runs' },
          },
        })
      }
      // Ama owns the org but neither made it nor admins Sales.
      expect((await inbox('u-ama')).data).toEqual([])
      expect(h.sent.runFailures.map((e) => e.to).sort()).toEqual(['dan@acme.test', 'fay@acme.test'])
      vi.useRealTimers()
      expect(h.sent.runFailures[0]).toMatchObject({
        url: 'http://web.test/acme/project-101/sales/runs',
        workflowName: 'Lead enrichment',
        stepName: 'Fetch company',
        placeName: 'Project 101 · Sales',
      })
    })

    it('tell nobody of a run that finished well', async () => {
      await run('r-ok')
      await sync({ status: 'complete', steps: [] })
      expect((await inbox('u-dan')).data).toEqual([])
      expect(h.sent.runFailures).toEqual([])
    })
  })

  describe('periodic jobs', () => {
    it('warn a key’s creator before it expires, once per threshold', async () => {
      const now = new Date()
      await h.seed.key('k-soon', 'u-ben', { level: 'organization' }, { audit: ['read'] })
      await h.db
        .update(h.schema.apiKeys)
        .set({ expiresAt: new Date(now.getTime() + 3 * 86_400_000 + 60_000).toISOString() })
        .where(eq(h.schema.apiKeys.id, 'k-soon'))
      await runMaintenance(h.adapter, now)
      await runMaintenance(h.adapter, now)
      const ben = await inbox('u-ben')
      expect(ben.data).toHaveLength(1)
      expect(ben.data[0]).toMatchObject({
        kind: 'expiry',
        title: 'API key “k-soon” expires in 3 days',
        link: { label: 'Review key', to: { kind: 'org-settings', page: 'api-keys' } },
      })
    })

    it('purge notifications past 30 days, but not a request still waiting', async () => {
      const { id } = await (await ask()).json()
      const later = new Date(Date.now() + 31 * 86_400_000)
      await runMaintenance(h.adapter, later)
      expect((await inbox('u-ama')).data.map((n) => n.event)).toEqual(['access_request.create'])
      await decide(id, 'decline')
      await runMaintenance(h.adapter, later)
      expect((await inbox('u-ama')).data).toEqual([])
      expect((await inbox('u-eve')).data).toEqual([])
    })
  })
})

describe('What’s new visits', () => {
  it('start empty and follow the person, with the notes they saw', async () => {
    const h = createSqliteApp()
    await seedAcme(h)
    const visit = (as: string, init: RequestInit = {}) =>
      h.app.request('/api/releases/visit', h.as(as, init))
    expect(await (await visit('u-ama')).json()).toEqual({ lastVisit: null, seen: [] })
    const put = await (
      await visit('u-ama', h.json({ seen: ['rel_a', 'rel_b', 'rel_a'] }, 'PUT'))
    ).json()
    expect(put.seen).toEqual(['rel_a', 'rel_b'])
    expect(typeof put.lastVisit).toBe('string')
    expect(await (await visit('u-ama')).json()).toEqual(put)
    expect(await (await visit('u-ben')).json()).toEqual({ lastVisit: null, seen: [] })
    expect((await visit('u-ama', h.json({ seen: 'rel_a' }, 'PUT'))).status).toBe(422)
  })
})
