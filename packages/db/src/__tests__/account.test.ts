import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// PGlite migrates a fresh database per test; under a parallel `pnpm test` that
// runs past vitest's 5s default.
vi.setConfig({ testTimeout: 30_000, hookTimeout: 30_000 })
import { eq } from 'drizzle-orm'
import {
  type Harness,
  NOW,
  T0,
  d1Harness,
  pgHarness,
  seed,
  sqliteHarness,
} from './fixtures/workspaces-db.js'

// Your account (B10) on every driver, over the shared seed: Ama owns Acme
// alone (Ben is its admin) and is a plain member of Globex (Cleo owns it);
// Acme has Project 101 (Sales, Ops) and Project 202.

const FUTURE = '2026-11-28T12:00:00.000Z'
const PAST = '2026-10-27T12:00:00.000Z'

async function addSessionsAndAccounts(h: Harness) {
  const s = h.schema
  const session = (id: string, userId: string, updatedAt: string, expiresAt = FUTURE) => ({
    id,
    userId,
    token: `token-${id}`,
    expiresAt,
    createdAt: T0,
    updatedAt,
    ipAddress: '81.2.69.160',
    userAgent: 'curl/8.7.1',
  })
  await h.db
    .insert(s.session)
    .values([
      session('s-here', 'u-ama', '2026-10-28T09:00:00.000Z'),
      session('s-phone', 'u-ama', '2026-10-28T11:00:00.000Z'),
      session('s-laptop', 'u-ama', '2026-10-28T10:00:00.000Z'),
      session('s-old', 'u-ama', '2026-10-20T10:00:00.000Z', PAST),
      session('s-ben', 'u-ben', '2026-10-28T11:30:00.000Z'),
    ])
  const account = (id: string, userId: string, providerId: string, createdAt: string) => ({
    id,
    accountId: `${providerId}-${userId}`,
    providerId,
    userId,
    createdAt,
    updatedAt: createdAt,
  })
  await h.db
    .insert(s.account)
    .values([
      account('a-gh', 'u-ama', 'github', '2026-10-21T00:00:00.000Z'),
      account('a-cred', 'u-ama', 'credential', '2026-10-21T00:00:00.000Z'),
      account('a-ben', 'u-ben', 'google', '2026-10-22T00:00:00.000Z'),
    ])
}

describe.each([
  ['sqlite', sqliteHarness],
  ['pg', pgHarness],
  ['d1', d1Harness],
])('account on %s', (_name, makeHarness) => {
  let h: Harness & { dispose?: () => Promise<void> }

  beforeEach(async () => {
    h = await makeHarness()
    await seed(h)
    await addSessionsAndAccounts(h)
  })

  afterEach(async () => {
    await h.dispose?.()
  })

  describe('getAccount', () => {
    it('reads the person, their organizations and their linked providers in one row', async () => {
      const account = await h.adapter.getAccount('u-ama')
      expect(account).toEqual({
        person: {
          id: 'u-ama',
          name: 'Ama Mensah',
          email: 'ama@acme.test',
          image: null,
          emailVerified: true,
        },
        orgs: [
          {
            id: 'org-acme',
            slug: 'acme',
            name: 'Acme',
            logo: null,
            role: 'owner',
            projectCount: 2,
            onlyOwner: true,
          },
          {
            id: 'org-globex',
            slug: 'globex',
            name: 'Globex',
            logo: null,
            role: 'member',
            projectCount: 0,
            onlyOwner: false,
          },
        ],
        providers: [{ id: 'a-gh', providerId: 'github', connectedAt: '2026-10-21T00:00:00.000Z' }],
      })
    })

    it('stops counting someone as the only owner once another owner joins', async () => {
      await h.db.update(h.schema.member).set({ role: 'owner' }).where(eq(h.schema.member.id, 'm-2'))
      const account = await h.adapter.getAccount('u-ama')
      expect(account?.orgs.find((o) => o.id === 'org-acme')?.onlyOwner).toBe(false)
    })

    it('is null for nobody, and empty lists for someone in no organization', async () => {
      expect(await h.adapter.getAccount('u-nobody')).toBeNull()
      await h.db.insert(h.schema.user).values({
        id: 'u-new',
        name: 'New',
        email: 'new@x.test',
        emailVerified: false,
        createdAt: T0,
        updatedAt: T0,
      })
      const account = await h.adapter.getAccount('u-new')
      expect(account?.orgs).toEqual([])
      expect(account?.providers).toEqual([])
      expect(account?.person.emailVerified).toBe(false)
    })
  })

  describe('soleOwnedOrgNames', () => {
    it('names the organizations the person owns alone', async () => {
      expect(await h.adapter.soleOwnedOrgNames('u-ama')).toEqual(['Acme'])
      expect(await h.adapter.soleOwnedOrgNames('u-ben')).toEqual([])
      expect(await h.adapter.soleOwnedOrgNames('u-cleo')).toEqual(['Globex'])
    })
  })

  describe('sessions', () => {
    it('lists only the person’s unexpired sessions, the current one first', async () => {
      const rows = await h.adapter.listAccountSessions('u-ama', 's-here', NOW)
      expect(rows.map((r) => [r.id, r.current])).toEqual([
        ['s-here', true],
        ['s-phone', false],
        ['s-laptop', false],
      ])
      expect(rows[0]).toMatchObject({
        userAgent: 'curl/8.7.1',
        ipAddress: '81.2.69.160',
        createdAt: T0,
        updatedAt: '2026-10-28T09:00:00.000Z',
      })
      expect(rows[0]).not.toHaveProperty('token')
    })

    it('signs out one other session, never the current one or someone else’s', async () => {
      expect(await h.adapter.revokeAccountSession('u-ama', 's-phone', 's-here')).toBe(true)
      expect(await h.adapter.revokeAccountSession('u-ama', 's-phone', 's-here')).toBe(false)
      expect(await h.adapter.revokeAccountSession('u-ama', 's-here', 's-here')).toBe(false)
      expect(await h.adapter.revokeAccountSession('u-ama', 's-ben', 's-here')).toBe(false)
      expect(await h.count('session', "id = 's-ben'")).toBe(1)
      expect(await h.count('session', "id = 's-here'")).toBe(1)
      expect(await h.count('session', "id = 's-phone'")).toBe(0)
    })

    it('signs out every other session of the person and says how many', async () => {
      expect(await h.adapter.revokeOtherAccountSessions('u-ama', 's-here')).toBe(3)
      expect(await h.count('session', "id = 's-here'")).toBe(1)
      expect(await h.count('session', "id = 's-ben'")).toBe(1)
      expect(await h.adapter.revokeOtherAccountSessions('u-ama', 's-here')).toBe(0)
    })
  })

  describe('exportAccount', () => {
    it('holds the person’s own rows: profile, providers, memberships with their grants', async () => {
      const s = h.schema
      await h.db.insert(s.projectMembers).values({
        projectId: 'p-g',
        userId: 'u-ama',
        role: 'member',
        createdAt: T0,
      })
      await h.db.insert(s.workspaceMembers).values({
        workspaceId: 'ws-g',
        userId: 'u-ama',
        role: 'editor',
        createdAt: T0,
      })
      await h.db.insert(s.workspaceMembers).values({
        workspaceId: 'ws-sales',
        userId: 'u-ben',
        role: 'viewer',
        createdAt: T0,
      })
      expect(await h.adapter.exportAccount('u-ama', 's-here', NOW)).toEqual({
        name: 'Ama Mensah',
        email: 'ama@acme.test',
        photo: false,
        providers: [{ id: 'a-gh', providerId: 'github', connectedAt: '2026-10-21T00:00:00.000Z' }],
        sessions: [
          expect.objectContaining({ id: 's-here', current: true, ipAddress: '81.2.69.160' }),
          expect.objectContaining({
            id: 's-phone',
            current: false,
            updatedAt: '2026-10-28T11:00:00.000Z',
          }),
          expect.objectContaining({ id: 's-laptop', current: false }),
        ],
        memberships: [
          { organization: 'Acme', role: 'owner', projects: [], workspaces: [] },
          {
            organization: 'Globex',
            role: 'member',
            projects: [{ name: 'Globex app', role: 'member' }],
            workspaces: [{ project: 'Globex app', name: 'Default', role: 'editor' }],
          },
        ],
      })
    })

    it('says whether there is a photo without carrying it', async () => {
      await h.db
        .update(h.schema.user)
        .set({ image: 'data:image/png;base64,AAAA' })
        .where(eq(h.schema.user.id, 'u-ama'))
      const exported = await h.adapter.exportAccount('u-ama', 's-here', NOW)
      expect(exported?.photo).toBe(true)
      expect(JSON.stringify(exported)).not.toContain('base64')
    })
  })
})
