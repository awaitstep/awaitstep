import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// PGlite migrates a fresh database per test; under a parallel `pnpm test` that
// runs past vitest's 5s default.
vi.setConfig({ testTimeout: 30_000, hookTimeout: 30_000 })
import { eq } from 'drizzle-orm'
import type { NotificationInsert } from '../types.js'
import {
  type Harness,
  T0,
  d1Harness,
  pgHarness,
  seed,
  sqliteHarness,
} from './fixtures/workspaces-db.js'

// The Inbox (B8) on every driver, over the shared seed — Acme (Ama owner,
// Ben admin) with Project 101 › Sales, Ops — plus three plain members:
// Dan admins Sales, Eve admins Ops, Fay has no grant (sees neither).

const NOW = '2026-10-30T12:00:00.000Z'
const LATER = '2026-10-30T12:10:00.000Z'

function entry(over: Partial<NotificationInsert> = {}): NotificationInsert {
  return {
    idPrefix: 'ntf_a',
    organizationId: 'org-acme',
    kind: 'failure',
    event: 'run.failed',
    needsAction: true,
    groupKey: 'run.failed:wf-enrich:2026-10-30T12',
    projectId: 'p-101',
    workspaceId: 'ws-sales',
    meta: { workflow: 'Lead enrichment', step: 'Fetch company' },
    recipients: { users: ['u-ama'] },
    onRepeat: 'keep',
    now: NOW,
    ...over,
  }
}

async function addMembers(h: Harness) {
  const s = h.schema
  const at = { createdAt: T0, updatedAt: T0 }
  await h.db.insert(s.user).values([
    { id: 'u-dan', name: 'Dan Ito', email: 'dan@acme.test', emailVerified: true, ...at },
    { id: 'u-eve', name: 'Eve Lund', email: 'eve@acme.test', emailVerified: true, ...at },
    { id: 'u-fay', name: 'Fay Moss', email: 'fay@acme.test', emailVerified: true, ...at },
  ])
  await h.db.insert(s.member).values([
    { id: 'm-dan', userId: 'u-dan', organizationId: 'org-acme', role: 'member', createdAt: T0 },
    { id: 'm-eve', userId: 'u-eve', organizationId: 'org-acme', role: 'member', createdAt: T0 },
    { id: 'm-fay', userId: 'u-fay', organizationId: 'org-acme', role: 'member', createdAt: T0 },
  ])
  await h.db.insert(s.workspaceMembers).values([
    { workspaceId: 'ws-sales', userId: 'u-dan', role: 'admin', createdBy: 'u-ama', createdAt: T0 },
    { workspaceId: 'ws-ops', userId: 'u-eve', role: 'admin', createdBy: 'u-ama', createdAt: T0 },
  ])
}

function apiKey(over: Record<string, unknown>) {
  return {
    organizationId: 'org-acme',
    level: 'organization',
    createdBy: 'u-ama',
    keyPrefix: 'ask_',
    scopes: '[]',
    createdAt: T0,
    ...over,
    keyHash: `hash-${over['id']}`,
    name: over['name'] ?? `Key ${over['id']}`,
  }
}

describe.each([
  ['sqlite', sqliteHarness],
  ['pg', pgHarness],
  ['d1', d1Harness],
])('notifications on %s', (_name, makeHarness) => {
  let h: Harness & { dispose?: () => Promise<void> }

  beforeEach(async () => {
    h = await makeHarness()
    await seed(h)
    await addMembers(h)
  })

  afterEach(async () => {
    await h.dispose?.()
  })

  const recipients = async (over: Partial<NotificationInsert>) =>
    (await h.adapter.notify(entry(over))).map((r) => r.userId).sort()

  describe('who receives', () => {
    it('reaches listed people in the organization only, never the actor', async () => {
      const written = await h.adapter.notify(
        entry({ recipients: { users: ['u-ama', 'u-ben', 'u-cleo'] }, excludeUserId: 'u-ben' }),
      )
      expect(written).toEqual([
        { userId: 'u-ama', email: 'ama@acme.test', name: 'Ama Mensah', orgSlug: 'acme', count: 1 },
      ])
    })

    it('reaches a workflow’s creator and its workspace’s admins, once each', async () => {
      expect(
        await recipients({ recipients: { workflowWatchers: { workflowId: 'wf-enrich' } } }),
      ).toEqual(['u-ama', 'u-dan'])
    })

    it('leaves out a creator who can no longer see the workspace', async () => {
      await h.db
        .update(h.schema.workflows)
        .set({ createdBy: 'u-fay' })
        .where(eq(h.schema.workflows.id, 'wf-enrich'))
      expect(
        await recipients({ recipients: { workflowWatchers: { workflowId: 'wf-enrich' } } }),
      ).toEqual(['u-dan'])
    })

    it('reaches the admins of the project’s other workspaces', async () => {
      expect(
        await recipients({
          // Filed at the project: they can't open the deployer's workspace.
          workspaceId: null,
          recipients: { otherWorkspaceAdmins: { projectId: 'p-101', workspaceId: 'ws-sales' } },
        }),
      ).toEqual(['u-eve'])
    })

    it('reaches nobody who cannot see the place', async () => {
      expect(await recipients({ recipients: { users: ['u-fay', 'u-eve', 'u-dan'] } })).toEqual([
        'u-dan',
      ])
      expect(
        await recipients({
          groupKey: 'project-wide',
          workspaceId: null,
          recipients: { users: ['u-fay', 'u-eve'] },
        }),
      ).toEqual(['u-eve'])
      expect(
        await recipients({
          groupKey: 'org-wide',
          projectId: null,
          workspaceId: null,
          recipients: { users: ['u-fay'] },
        }),
      ).toEqual(['u-fay'])
    })
  })

  describe('repeats', () => {
    it('keeps the first row when told to', async () => {
      await h.adapter.notify(entry())
      expect(await h.adapter.notify(entry({ idPrefix: 'ntf_b', now: LATER }))).toEqual([])
      expect(await h.count('notifications')).toBe(1)
    })

    it('folds a repeat into the row: counted, moved up, unread again', async () => {
      await h.adapter.notify(entry({ onRepeat: 'fold' }))
      const [{ rows }] = [await h.adapter.listNotifications('org-acme', 'u-ama', 100)]
      await h.adapter.markNotificationRead('org-acme', 'u-ama', rows[0]!.id, NOW)
      const again = await h.adapter.notify(
        entry({
          idPrefix: 'ntf_b',
          onRepeat: 'fold',
          now: LATER,
          meta: { workflow: 'Lead enrichment', step: 'Save' },
        }),
      )
      expect(again).toEqual([
        { userId: 'u-ama', email: 'ama@acme.test', name: 'Ama Mensah', orgSlug: 'acme', count: 2 },
      ])
      const list = await h.adapter.listNotifications('org-acme', 'u-ama', 100)
      expect(list.rows).toHaveLength(1)
      expect(list.rows[0]).toMatchObject({
        id: 'ntf_a_u-ama',
        count: 2,
        read: false,
        at: LATER,
        meta: { step: 'Save' },
      })
    })
  })

  describe('the Inbox', () => {
    it('lists the person’s rows newest first, with places named as they are now', async () => {
      await h.adapter.notify(entry())
      await h.adapter.notify(
        entry({
          idPrefix: 'ntf_b',
          groupKey: 'gone',
          projectId: 'p-gone',
          workspaceId: 'ws-gone',
          now: LATER,
        }),
      )
      await h.adapter.notify(
        entry({
          idPrefix: 'ntf_c',
          groupKey: 'org',
          event: 'invitation.accept',
          kind: 'people',
          needsAction: false,
          projectId: null,
          workspaceId: null,
          now: '2026-10-30T11:00:00.000Z',
        }),
      )
      const list = await h.adapter.listNotifications('org-acme', 'u-ama', 100)
      expect(list.rows.map((r) => r.id)).toEqual(['ntf_b_u-ama', 'ntf_a_u-ama', 'ntf_c_u-ama'])
      expect(list.rows[1]).toMatchObject({
        event: 'run.failed',
        count: 1,
        read: false,
        needsAction: true,
        meta: { workflow: 'Lead enrichment', step: 'Fetch company' },
        place: {
          level: 'workspace',
          orgName: 'Acme',
          projectSlug: 'project-101',
          projectName: 'Project 101',
          workspaceSlug: 'sales',
          workspaceName: 'Sales',
        },
        request: null,
      })
      expect(list.rows[0]!.place).toMatchObject({
        level: 'workspace',
        projectName: null,
        workspaceName: null,
      })
      expect(list.rows[2]!.place).toMatchObject({ level: 'organization', orgName: 'Acme' })
      expect(list.counts).toEqual({ all: 3, unread: 3, action: 2 })
    })

    it('cuts the list at the limit but counts every row', async () => {
      for (const i of [1, 2, 3]) {
        await h.adapter.notify(entry({ idPrefix: `ntf_${i}`, groupKey: `g${i}` }))
      }
      const list = await h.adapter.listNotifications('org-acme', 'u-ama', 2)
      expect(list.rows).toHaveLength(2)
      expect(list.counts.all).toBe(3)
    })

    it('answers an empty Inbox with zero counts', async () => {
      expect(await h.adapter.listNotifications('org-acme', 'u-ama', 100)).toEqual({
        rows: [],
        counts: { all: 0, unread: 0, action: 0 },
      })
    })

    it('never shows another person’s or another organization’s rows', async () => {
      await h.adapter.notify(entry({ recipients: { users: ['u-ben'] } }))
      await h.adapter.notify(
        entry({
          organizationId: 'org-globex',
          projectId: null,
          workspaceId: null,
          groupKey: 'globex',
        }),
      )
      expect((await h.adapter.listNotifications('org-acme', 'u-ama', 100)).rows).toEqual([])
      expect((await h.adapter.listNotifications('org-globex', 'u-ama', 100)).rows).toHaveLength(1)
    })

    it('hides rows about a workspace the person can no longer see', async () => {
      await h.adapter.notify(entry({ recipients: { users: ['u-dan'] } }))
      await h.db
        .delete(h.schema.workspaceMembers)
        .where(eq(h.schema.workspaceMembers.userId, 'u-dan'))
      const list = await h.adapter.listNotifications('org-acme', 'u-dan', 100)
      expect(list).toEqual({ rows: [], counts: { all: 0, unread: 0, action: 0 } })
    })

    it('reads a request row’s status live: answered means read and no longer waiting', async () => {
      // A name left empty (a magic-link account) reads as the address.
      await h.db.update(h.schema.user).set({ name: '' }).where(eq(h.schema.user.id, 'u-fay'))
      await h.db.insert(h.schema.accessRequests).values({
        id: 'req-1',
        workspaceId: 'ws-sales',
        userId: 'u-fay',
        toUserId: 'u-ama',
        status: 'pending',
        createdAt: NOW,
      })
      await h.adapter.notify(
        entry({
          kind: 'request',
          event: 'access_request.create',
          groupKey: 'access_request:req-1',
          accessRequestId: 'req-1',
          meta: { person: 'Fay Moss' },
        }),
      )
      const open = await h.adapter.listNotifications('org-acme', 'u-ama', 100)
      expect(open.rows[0]).toMatchObject({
        read: false,
        needsAction: true,
        request: { id: 'req-1', status: 'pending', asker: 'fay@acme.test', alreadyEditing: false },
      })
      expect(open.counts).toEqual({ all: 1, unread: 1, action: 1 })
      await h.db
        .update(h.schema.accessRequests)
        .set({ status: 'approved', alreadyEditing: true })
        .where(eq(h.schema.accessRequests.id, 'req-1'))
      const answered = await h.adapter.listNotifications('org-acme', 'u-ama', 100)
      expect(answered.rows[0]).toMatchObject({
        read: true,
        needsAction: false,
        request: { status: 'approved', alreadyEditing: true },
      })
      expect(answered.counts).toEqual({ all: 1, unread: 0, action: 0 })
    })
  })

  describe('read marks', () => {
    it('marks the person’s own row only', async () => {
      await h.adapter.notify(entry({ recipients: { users: ['u-ama', 'u-ben'] } }))
      expect(await h.adapter.markNotificationRead('org-acme', 'u-ama', 'ntf_a_u-ben', NOW)).toBe(
        false,
      )
      expect(await h.adapter.markNotificationRead('org-globex', 'u-ama', 'ntf_a_u-ama', NOW)).toBe(
        false,
      )
      expect(await h.adapter.markNotificationRead('org-acme', 'u-ama', 'ntf_a_u-ama', NOW)).toBe(
        true,
      )
      // Again: still theirs, still read.
      expect(await h.adapter.markNotificationRead('org-acme', 'u-ama', 'ntf_a_u-ama', LATER)).toBe(
        true,
      )
      expect((await h.adapter.listNotifications('org-acme', 'u-ama', 100)).counts.unread).toBe(0)
      expect((await h.adapter.listNotifications('org-acme', 'u-ben', 100)).counts.unread).toBe(1)
    })

    it('marks all of the person’s unread rows in the organization', async () => {
      await h.adapter.notify(entry())
      await h.adapter.notify(entry({ idPrefix: 'ntf_b', groupKey: 'g2' }))
      await h.adapter.notify(
        entry({ idPrefix: 'ntf_c', groupKey: 'g3', recipients: { users: ['u-ben'] } }),
      )
      expect(await h.adapter.markAllNotificationsRead('org-acme', 'u-ama', NOW)).toBe(2)
      expect(await h.adapter.markAllNotificationsRead('org-acme', 'u-ama', NOW)).toBe(0)
      expect((await h.adapter.listNotifications('org-acme', 'u-ben', 100)).counts.unread).toBe(1)
    })
  })

  it('clears a group in the organization', async () => {
    await h.adapter.notify(entry({ groupKey: 'invitation.ask_again:inv-1' }))
    await h.adapter.notify(entry({ idPrefix: 'ntf_b', groupKey: 'keep' }))
    await h.adapter.clearNotifications('org-globex', 'invitation.ask_again:inv-1')
    expect(await h.count('notifications')).toBe(2)
    await h.adapter.clearNotifications('org-acme', 'invitation.ask_again:inv-1')
    expect(await h.count('notifications')).toBe(1)
  })

  describe('expiring keys', () => {
    const check = {
      idPrefix: 'ntf_exp',
      event: 'api_key.expiring',
      kind: 'expiry' as const,
      needsAction: true,
      now: NOW,
      warnBefore: '2026-11-06T12:00:00.000Z',
      lastWarnBefore: '2026-10-31T12:00:00.000Z',
    }

    beforeEach(async () => {
      await h.db.insert(h.schema.apiKeys).values([
        apiKey({
          id: 'k-org',
          organizationId: 'org-acme',
          name: 'Read-only dashboard',
          expiresAt: '2026-11-02T12:00:00.000Z',
        }),
        apiKey({
          id: 'k-ws',
          level: 'workspace',
          createdBy: 'u-dan',
          expiresAt: '2026-10-30T20:00:00.000Z',
        }),
        apiKey({ id: 'k-far', organizationId: 'org-acme', expiresAt: '2026-12-01T00:00:00.000Z' }),
        apiKey({ id: 'k-past', organizationId: 'org-acme', expiresAt: '2026-10-29T00:00:00.000Z' }),
        apiKey({
          id: 'k-revoked',
          organizationId: 'org-acme',
          expiresAt: '2026-11-01T00:00:00.000Z',
          revokedAt: T0,
        }),
        apiKey({ id: 'k-never', organizationId: 'org-acme' }),
        apiKey({
          id: 'k-left',
          organizationId: 'org-acme',
          createdBy: 'u-cleo',
          expiresAt: '2026-11-01T00:00:00.000Z',
        }),
      ])
      await h.db
        .insert(h.schema.apiKeyWorkspaces)
        .values([{ keyId: 'k-ws', workspaceId: 'ws-sales', revokedAt: null }])
    })

    it('warns each live key’s creator once per threshold', async () => {
      expect(await h.adapter.notifyExpiringKeys(check)).toBe(2)
      expect(await h.adapter.notifyExpiringKeys(check)).toBe(0)
      const ama = await h.adapter.listNotifications('org-acme', 'u-ama', 100)
      expect(ama.rows).toHaveLength(1)
      expect(ama.rows[0]).toMatchObject({
        event: 'api_key.expiring',
        needsAction: true,
        meta: { name: 'Read-only dashboard', expiresAt: '2026-11-02T12:00:00.000Z' },
        place: { level: 'organization' },
      })
      const dan = await h.adapter.listNotifications('org-acme', 'u-dan', 100)
      expect(dan.rows[0]).toMatchObject({
        meta: { expiresAt: '2026-10-30T20:00:00.000Z' },
        place: { level: 'workspace', workspaceSlug: 'sales' },
      })
    })

    it('warns again inside the last day', async () => {
      await h.adapter.notifyExpiringKeys(check)
      const dayBefore = {
        ...check,
        now: '2026-11-01T13:00:00.000Z',
        warnBefore: '2026-11-08T13:00:00.000Z',
        lastWarnBefore: '2026-11-02T13:00:00.000Z',
      }
      expect(await h.adapter.notifyExpiringKeys(dayBefore)).toBe(1)
      expect((await h.adapter.listNotifications('org-acme', 'u-ama', 100)).rows).toHaveLength(2)
    })
  })

  it('purges rows last touched before the cut', async () => {
    await h.adapter.notify(entry({ now: '2026-09-01T00:00:00.000Z' }))
    await h.adapter.notify(entry({ idPrefix: 'ntf_b', groupKey: 'new' }))
    expect(await h.adapter.purgeNotifications('2026-09-30T12:00:00.000Z')).toBe(1)
    expect(await h.count('notifications')).toBe(1)
  })

  it('keeps an old row while it still waits: a pending request, an ask about a pending invite', async () => {
    const OLD = '2026-09-01T00:00:00.000Z'
    await h.db.insert(h.schema.accessRequests).values([
      {
        id: 'req-open',
        workspaceId: 'ws-sales',
        userId: 'u-fay',
        toUserId: 'u-ama',
        status: 'pending',
        createdAt: OLD,
      },
      {
        id: 'req-done',
        workspaceId: 'ws-sales',
        userId: 'u-eve',
        toUserId: 'u-ama',
        status: 'approved',
        createdAt: OLD,
      },
    ])
    await h.db.insert(h.schema.invitation).values([
      {
        id: 'inv-open',
        email: 'x@x.test',
        inviterId: 'u-ama',
        organizationId: 'org-acme',
        status: 'pending',
        // Expired inside the retention: the ask still waits on the inviter.
        expiresAt: '2026-10-01T00:00:00.000Z',
        createdAt: OLD,
      },
      {
        id: 'inv-stale',
        email: 'z@x.test',
        inviterId: 'u-ama',
        organizationId: 'org-acme',
        status: 'pending',
        // Expired longer ago than the retention: its ask goes like any row.
        expiresAt: OLD,
        createdAt: OLD,
      },
      {
        id: 'inv-done',
        email: 'y@x.test',
        inviterId: 'u-ama',
        organizationId: 'org-acme',
        status: 'canceled',
        expiresAt: OLD,
        createdAt: OLD,
      },
    ])
    const old = (over: Partial<NotificationInsert>) =>
      h.adapter.notify(entry({ now: OLD, workspaceId: null, projectId: null, ...over }))
    await old({ idPrefix: 'n1', groupKey: 'access_request:req-open', accessRequestId: 'req-open' })
    await old({ idPrefix: 'n2', groupKey: 'access_request:req-done', accessRequestId: 'req-done' })
    const ask = { event: 'invitation.ask_again', kind: 'people' as const }
    await old({ ...ask, idPrefix: 'n3', groupKey: 'invitation.ask_again:inv-open' })
    await old({ ...ask, idPrefix: 'n4', groupKey: 'invitation.ask_again:inv-done' })
    await old({ ...ask, idPrefix: 'n5', groupKey: 'invitation.ask_again:inv-stale' })
    expect(await h.adapter.purgeNotifications('2026-09-30T12:00:00.000Z')).toBe(3)
    const left = (await h.adapter.listNotifications('org-acme', 'u-ama', 100)).rows.map((r) => r.id)
    expect(left.sort()).toEqual(['n1_u-ama', 'n3_u-ama'])
  })

  it('remembers each person’s last What’s new visit', async () => {
    expect(await h.adapter.getReleaseVisit('u-ama')).toBeNull()
    expect(await h.adapter.setReleaseVisit('u-ama', NOW, ['rel_a'])).toEqual({
      seenAt: NOW,
      seenIds: ['rel_a'],
    })
    await h.adapter.setReleaseVisit('u-ama', LATER, ['rel_b', 'rel_a'])
    expect(await h.adapter.getReleaseVisit('u-ama')).toEqual({
      seenAt: LATER,
      seenIds: ['rel_b', 'rel_a'],
    })
    expect(await h.adapter.getReleaseVisit('u-ben')).toBeNull()
  })
})
