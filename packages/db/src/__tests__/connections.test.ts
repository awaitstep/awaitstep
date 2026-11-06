import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// PGlite migrates a fresh database per test; under a parallel `pnpm test` that
// runs past vitest's 5s default.
vi.setConfig({ testTimeout: 30_000, hookTimeout: 30_000 })
import { eq } from 'drizzle-orm'
import type { ConnectionWrite, ExpiringConnectionsCheck } from '../types.js'
import {
  type Harness,
  T0,
  d1Harness,
  pgHarness,
  seed,
  sqliteHarness,
} from './fixtures/workspaces-db.js'

// Connections (B9) on every driver, over the shared seed — Acme (Ama owner,
// Ben admin) with Project 101 (Sales, Ops) and Project 202 — plus Dan, a
// member who admins Sales (sees Project 101 only), and Fay, a member with no
// grant (sees no project).

const NOW = '2026-10-30T12:00:00.000Z'
const CREDS = JSON.stringify({ accountId: 'a'.repeat(32), apiToken: 'tok' })

function write(over: Partial<ConnectionWrite & { id: string; createdBy: string }> = {}) {
  return {
    id: 'c-1',
    organizationId: 'org-acme',
    createdBy: 'u-ben',
    provider: 'cloudflare',
    name: 'Acme production',
    credentials: CREDS,
    ...over,
  }
}

async function addMembers(h: Harness) {
  const s = h.schema
  const at = { createdAt: T0, updatedAt: T0 }
  await h.db.insert(s.user).values([
    { id: 'u-dan', name: 'Dan Ito', email: 'dan@acme.test', emailVerified: true, ...at },
    { id: 'u-fay', name: 'Fay Moss', email: 'fay@acme.test', emailVerified: true, ...at },
  ])
  await h.db.insert(s.member).values([
    { id: 'm-dan', userId: 'u-dan', organizationId: 'org-acme', role: 'member', createdAt: T0 },
    { id: 'm-fay', userId: 'u-fay', organizationId: 'org-acme', role: 'member', createdAt: T0 },
  ])
  await h.db.insert(s.workspaceMembers).values([
    {
      workspaceId: 'ws-sales',
      userId: 'u-dan',
      role: 'admin',
      createdBy: 'u-ama',
      createdAt: T0,
    },
  ])
}

/**
 * The project has the account as one of its own (23a), as the migration
 * added every serving account: a deploy's check then turns on serving alone.
 */
async function addToProjects(h: Harness, projectIds = ['p-101', 'p-202'], connectionId = 'c-1') {
  await h.db
    .insert(h.schema.projectConnections)
    .values(projectIds.map((projectId) => ({ projectId, connectionId, createdAt: T0 })))
}

function expiring(over: Partial<ExpiringConnectionsCheck> = {}): ExpiringConnectionsCheck {
  return {
    idPrefix: 'ntf_tok_a',
    event: 'connection.token_expiring',
    kind: 'expiry',
    needsAction: true,
    now: NOW,
    warnBefore: '2026-11-06T12:00:00.000Z',
    lastWarnBefore: '2026-10-31T12:00:00.000Z',
    ...over,
  }
}

describe.each([
  ['sqlite', sqliteHarness],
  ['pg', pgHarness],
  ['d1', d1Harness],
])('connections on %s', (_name, makeHarness) => {
  let h: Harness & { dispose?: () => Promise<void> }

  beforeEach(async () => {
    h = await makeHarness()
    await seed(h)
    await addMembers(h)
  })

  afterEach(async () => {
    await h.dispose?.()
  })

  describe('which projects a connection serves', () => {
    it('serves every project by default', async () => {
      const created = await h.adapter.createConnection(write())
      expect(created?.allProjects).toBe(true)
      expect(created?.tokenStatus).toBe('unchecked')
      await addToProjects(h)
      for (const project of ['p-101', 'p-202']) {
        const found = await h.adapter.getConnectionForProject('c-1', 'org-acme', project)
        expect(found?.covered).toBe(true)
        expect(found?.connection.credentials).toBe(CREDS)
      }
    })

    it('serves only the listed projects when narrowed', async () => {
      await h.adapter.createConnection(write({ allProjects: false, projectIds: ['p-101'] }))
      await addToProjects(h)
      expect((await h.adapter.getConnectionForProject('c-1', 'org-acme', 'p-101'))?.covered).toBe(
        true,
      )
      expect((await h.adapter.getConnectionForProject('c-1', 'org-acme', 'p-202'))?.covered).toBe(
        false,
      )
    })

    it('serves nothing when narrowed to no project', async () => {
      await h.adapter.createConnection(write({ allProjects: false, projectIds: [] }))
      expect((await h.adapter.getConnectionForProject('c-1', 'org-acme', 'p-101'))?.covered).toBe(
        false,
      )
    })

    it('writes nothing when a project is another organization’s', async () => {
      expect(
        await h.adapter.createConnection(
          write({ allProjects: false, projectIds: ['p-101', 'p-g'] }),
        ),
      ).toBeNull()
      expect(await h.count('connections')).toBe(0)
      expect(await h.count('connection_projects')).toBe(0)
    })

    it('is no project’s account until the project adds it, however widely it serves', async () => {
      await h.adapter.createConnection(write())
      expect((await h.adapter.getConnectionForProject('c-1', 'org-acme', 'p-101'))?.covered).toBe(
        false,
      )
      await addToProjects(h, ['p-101'])
      expect((await h.adapter.getConnectionForProject('c-1', 'org-acme', 'p-101'))?.covered).toBe(
        true,
      )
      expect((await h.adapter.getConnectionForProject('c-1', 'org-acme', 'p-202'))?.covered).toBe(
        false,
      )
    })

    it('reads nothing for another organization', async () => {
      await h.adapter.createConnection(write())
      expect(await h.adapter.getConnectionForProject('c-1', 'org-globex', 'p-g')).toBeNull()
    })

    it('replaces the list as one unit, and refuses a foreign project without changing it', async () => {
      await h.adapter.createConnection(write({ allProjects: false, projectIds: ['p-101'] }))
      await addToProjects(h)
      expect(
        await h.adapter.updateConnection('c-1', {
          organizationId: 'org-acme',
          projectIds: ['p-202', 'p-g'],
        }),
      ).toBeNull()
      expect((await h.adapter.getConnectionForProject('c-1', 'org-acme', 'p-101'))?.covered).toBe(
        true,
      )
      // Nothing of the refused list was written: p-202 isn't served and the list is as it was.
      expect((await h.adapter.getConnectionForProject('c-1', 'org-acme', 'p-202'))?.covered).toBe(
        false,
      )
      expect(await h.count('connection_projects')).toBe(1)

      const updated = await h.adapter.updateConnection('c-1', {
        organizationId: 'org-acme',
        projectIds: ['p-202'],
      })
      expect(updated).toMatchObject({
        id: 'c-1',
        allProjects: false,
        projects: [{ id: 'p-202', name: 'Project 202', slug: 'project-202' }],
      })
      expect((await h.adapter.getConnectionForProject('c-1', 'org-acme', 'p-101'))?.covered).toBe(
        false,
      )
      expect((await h.adapter.getConnectionForProject('c-1', 'org-acme', 'p-202'))?.covered).toBe(
        true,
      )

      await h.adapter.updateConnection('c-1', { organizationId: 'org-acme', allProjects: true })
      expect(await h.count('connection_projects')).toBe(0)
      expect((await h.adapter.getConnectionForProject('c-1', 'org-acme', 'p-101'))?.covered).toBe(
        true,
      )
    })

    it('updates nothing in another organization', async () => {
      await h.adapter.createConnection(write())
      expect(
        await h.adapter.updateConnection('c-1', { organizationId: 'org-globex', name: 'Taken' }),
      ).toBeNull()
      expect((await h.adapter.getProviderConnectionById('c-1'))?.name).toBe('Acme production')
    })

    it('links no project to another organization’s connection', async () => {
      await h.adapter.createConnection(write({ allProjects: false, projectIds: ['p-101'] }))
      expect(
        await h.adapter.updateConnection('c-1', {
          organizationId: 'org-globex',
          projectIds: ['p-g'],
        }),
      ).toBeNull()
      expect(await h.count('connection_projects')).toBe(1)
      expect((await h.adapter.listConnections('org-acme')).data[0]).toMatchObject({
        projects: [{ id: 'p-101' }],
        hiddenProjects: 0,
      })
    })

    it('answers a write with the row as the list shows it, for the reader', async () => {
      const created = await h.adapter.createConnection(
        write({
          allProjects: false,
          projectIds: ['p-101', 'p-202'],
          visibleTo: { userId: 'u-dan' },
        }),
      )
      expect(created).toMatchObject({
        id: 'c-1',
        createdByName: 'Ben Okoro',
        projects: [{ id: 'p-101' }],
        hiddenProjects: 1,
        deployments: { count: 0, lastAt: null },
        credentials: CREDS,
      })
      const renamed = await h.adapter.updateConnection('c-1', {
        organizationId: 'org-acme',
        name: 'Prod',
        visibleTo: 'all',
      })
      expect(renamed).toMatchObject({ name: 'Prod', hiddenProjects: 0, projects: [{}, {}] })
    })

    it('drops a deleted project from the list', async () => {
      await h.adapter.createConnection(write({ allProjects: false, projectIds: ['p-202'] }))
      await h.db.delete(h.schema.projects).where(eq(h.schema.projects.id, 'p-202'))
      expect(await h.count('connection_projects')).toBe(0)
    })
  })

  describe('what a trigger may use', () => {
    it('answers only a connection the workflow was deployed with, successfully', async () => {
      await h.adapter.createConnection(write())
      await h.adapter.createConnection(write({ id: 'c-2' }))
      await h.db
        .update(h.schema.deployments)
        .set({ connectionId: 'c-1' })
        .where(eq(h.schema.deployments.workflowId, 'wf-enrich'))
      await h.db
        .update(h.schema.deployments)
        .set({ connectionId: 'c-2' })
        .where(eq(h.schema.deployments.id, 'd-3'))
      expect(
        (await h.adapter.getConnectionDeployedWith('c-1', 'org-acme', 'wf-enrich'))?.credentials,
      ).toBe(CREDS)
      // Deployed elsewhere, never with c-2.
      expect(await h.adapter.getConnectionDeployedWith('c-2', 'org-acme', 'wf-enrich')).toBeNull()
      // wf-sync's only deployment with c-2 failed.
      expect(await h.adapter.getConnectionDeployedWith('c-2', 'org-acme', 'wf-sync')).toBeNull()
      expect(await h.adapter.getConnectionDeployedWith('c-1', 'org-globex', 'wf-enrich')).toBeNull()
    })

    it('names the version of the newest successful deploy on that account', async () => {
      await h.adapter.createConnection(write())
      await h.adapter.createConnection(write({ id: 'c-2' }))
      // d-1 (v1) and d-2 (v2) on c-1; then v1 again on c-2, and a newer failed v1 on c-1.
      await h.db
        .update(h.schema.deployments)
        .set({ connectionId: 'c-1' })
        .where(eq(h.schema.deployments.workflowId, 'wf-enrich'))
      await h.db.insert(h.schema.deployments).values([
        {
          id: 'd-4',
          workflowId: 'wf-enrich',
          versionId: 'v-enrich-1',
          connectionId: 'c-2',
          serviceName: 'svc',
          status: 'success',
          createdAt: '2026-10-23T00:00:00.000Z',
        },
        {
          id: 'd-5',
          workflowId: 'wf-enrich',
          versionId: 'v-enrich-1',
          connectionId: 'c-1',
          serviceName: 'svc',
          status: 'failed',
          createdAt: '2026-10-24T00:00:00.000Z',
        },
      ])
      const on = async (id: string) =>
        (await h.adapter.getConnectionDeployedWith(id, 'org-acme', 'wf-enrich'))?.deployedVersionId
      expect(await on('c-1')).toBe('v-enrich-2')
      expect(await on('c-2')).toBe('v-enrich-1')
    })
  })

  describe('the list', () => {
    it('names who added it, its projects and its successful deployments', async () => {
      await h.adapter.createConnection(
        write({ allProjects: false, projectIds: ['p-101', 'p-202'] }),
      )
      await h.db
        .update(h.schema.deployments)
        .set({ connectionId: 'c-1' })
        .where(eq(h.schema.deployments.workflowId, 'wf-enrich'))
      await h.db
        .update(h.schema.deployments)
        .set({ connectionId: 'c-1' })
        .where(eq(h.schema.deployments.id, 'd-3'))

      const { data } = await h.adapter.listConnections('org-acme', { visibleTo: 'all' })
      expect(data).toHaveLength(1)
      expect(data[0]).toMatchObject({
        id: 'c-1',
        createdByName: 'Ben Okoro',
        allProjects: false,
        projects: [
          { id: 'p-101', name: 'Project 101', slug: 'project-101' },
          { id: 'p-202', name: 'Project 202', slug: 'project-202' },
        ],
        hiddenProjects: 0,
        // d-3 failed: only d-1 and d-2 count.
        deployments: { count: 2, lastAt: '2026-10-22T00:00:00.000Z' },
        credentials: CREDS,
      })
    })

    it('names only the projects the reader can see and counts the rest', async () => {
      await h.adapter.createConnection(
        write({ allProjects: false, projectIds: ['p-101', 'p-202'] }),
      )
      const as = async (
        visibleTo: { userId: string } | { projectId: string } | { projectIds: string[] },
      ) => (await h.adapter.listConnections('org-acme', { visibleTo })).data[0]!
      expect(await as({ userId: 'u-ama' })).toMatchObject({
        projects: [{ id: 'p-101' }, { id: 'p-202' }],
        hiddenProjects: 0,
      })
      expect(await as({ userId: 'u-dan' })).toMatchObject({
        projects: [{ id: 'p-101' }],
        hiddenProjects: 1,
      })
      expect(await as({ userId: 'u-fay' })).toMatchObject({ projects: [], hiddenProjects: 2 })
      expect(await as({ projectId: 'p-202' })).toMatchObject({
        projects: [{ id: 'p-202' }],
        hiddenProjects: 1,
      })
      // A scoped key sees only the projects in its set — never widened beyond it.
      expect(await as({ projectIds: ['p-202'] })).toMatchObject({
        projects: [{ id: 'p-202' }],
        hiddenProjects: 1,
      })
      expect(await as({ projectIds: ['p-101', 'p-202'] })).toMatchObject({
        projects: [{ id: 'p-101' }, { id: 'p-202' }],
        hiddenProjects: 0,
      })
      expect(await as({ projectIds: [] })).toMatchObject({ projects: [], hiddenProjects: 2 })
    })

    it('lists no deployments and no projects for a fresh all-projects connection', async () => {
      await h.adapter.createConnection(write())
      const [row] = (await h.adapter.listConnections('org-acme')).data
      expect(row).toMatchObject({
        allProjects: true,
        projects: [],
        hiddenProjects: 0,
        deployments: { count: 0, lastAt: null },
      })
    })

    it('keeps to the connections serving a project when asked', async () => {
      await h.adapter.createConnection(write({ id: 'c-all' }))
      await h.adapter.createConnection(
        write({ id: 'c-101', allProjects: false, projectIds: ['p-101'] }),
      )
      await h.adapter.createConnection(
        write({ id: 'c-202', allProjects: false, projectIds: ['p-202'] }),
      )
      const ids = async (projectId: string) =>
        (await h.adapter.listConnections('org-acme', { project: { id: projectId } })).data
          .map((c) => c.id)
          .sort()
      expect(await ids('p-101')).toEqual(['c-101', 'c-all'])
      expect(await ids('p-202')).toEqual(['c-202', 'c-all'])
      const bySlug = async (slug: string) =>
        (await h.adapter.listConnections('org-acme', { project: { slug } })).data
          .map((c) => c.id)
          .sort()
      expect(await bySlug('project-202')).toEqual(['c-202', 'c-all'])
      // Globex's project, and a slug nobody uses: nothing, not the all-projects ones.
      expect(await bySlug('app')).toEqual([])
      expect(await ids('p-g')).toEqual([])
      // A project the reader can't see matches nothing either: the filter never tells it exists.
      const asFay = async (project: { slug: string } | { id: string }) =>
        (await h.adapter.listConnections('org-acme', { project, visibleTo: { userId: 'u-fay' } }))
          .data
      expect(await asFay({ slug: 'project-202' })).toEqual([])
      expect(await asFay({ id: 'p-202' })).toEqual([])
      expect(
        (
          await h.adapter.listConnections('org-acme', {
            project: { id: 'p-101' },
            visibleTo: { userId: 'u-dan' },
          })
        ).data
          .map((c) => c.id)
          .sort(),
      ).toEqual(['c-101', 'c-all'])
    })

    it('lists only the organization’s connections', async () => {
      await h.adapter.createConnection(write())
      await h.adapter.createConnection(
        write({ id: 'c-g', organizationId: 'org-globex', createdBy: 'u-cleo' }),
      )
      expect((await h.adapter.listConnections('org-globex')).data.map((c) => c.id)).toEqual(['c-g'])
    })
  })

  describe('token checks', () => {
    it('stores the check given on create', async () => {
      const created = await h.adapter.createConnection(
        write({
          token: { status: 'active', expiresAt: '2026-11-05T12:00:00.000Z', checkedAt: NOW },
        }),
      )
      expect(created).toMatchObject({
        tokenStatus: 'active',
        tokenExpiresAt: '2026-11-05T12:00:00.000Z',
        tokenCheckedAt: NOW,
      })
    })

    it('hands out never-checked rows first, then the oldest checks, up to the limit', async () => {
      const at = (checkedAt: string | null) => ({
        token: { status: 'active' as const, expiresAt: null, checkedAt },
      })
      await h.adapter.createConnection(write({ id: 'c-old', ...at('2026-10-28T00:00:00.000Z') }))
      await h.adapter.createConnection(write({ id: 'c-new', ...at('2026-10-30T11:00:00.000Z') }))
      await h.adapter.createConnection(write({ id: 'c-never' }))
      await h.adapter.createConnection(write({ id: 'c-older', ...at('2026-10-27T00:00:00.000Z') }))
      const due = await h.adapter.connectionsDueForTokenCheck(
        'cloudflare',
        '2026-10-29T12:00:00.000Z',
        2,
      )
      expect(due.map((c) => c.id)).toEqual(['c-never', 'c-older'])
      expect(due[0]!.credentials).toBe(CREDS)
    })

    it('records a check on a row whose check time has finer precision than it reads back', async () => {
      await h.adapter.createConnection(write())
      // pg keeps microseconds when something other than the app writes the time.
      await h.db
        .update(h.schema.connections)
        .set({ tokenCheckedAt: '2026-10-28T00:00:00.123456' })
        .where(eq(h.schema.connections.id, 'c-1'))
      const [due] = await h.adapter.connectionsDueForTokenCheck('cloudflare', NOW, 1)
      expect(
        await h.adapter.recordConnectionTokenCheck('c-1', due!.tokenCheckedAt, {
          status: 'active',
          expiresAt: null,
          checkedAt: NOW,
        }),
      ).not.toBeNull()
    })

    it('takes turns across organizations, so one with many can’t hold back the rest', async () => {
      for (let i = 0; i < 4; i++) await h.adapter.createConnection(write({ id: `c-acme-${i}` }))
      await h.adapter.createConnection(
        write({ id: 'c-globex', organizationId: 'org-globex', createdBy: 'u-cleo' }),
      )
      const due = await h.adapter.connectionsDueForTokenCheck('cloudflare', NOW, 2)
      expect(due.map((c) => c.organizationId).sort()).toEqual(['org-acme', 'org-globex'])
    })

    it('records a check unless the token was checked again since it was read', async () => {
      await h.adapter.createConnection(write())
      const check = { status: 'invalid' as const, expiresAt: null, checkedAt: NOW }
      expect(await h.adapter.recordConnectionTokenCheck('c-1', null, check)).toEqual({
        organizationId: 'org-acme',
      })
      // Read before that write: stale, so it is skipped.
      expect(
        await h.adapter.recordConnectionTokenCheck('c-1', null, {
          status: 'active',
          expiresAt: null,
          checkedAt: '2026-10-30T12:05:00.000Z',
        }),
      ).toBeNull()
      expect((await h.adapter.getProviderConnectionById('c-1'))?.tokenStatus).toBe('invalid')
      // Read after it: written.
      expect(
        await h.adapter.recordConnectionTokenCheck('c-1', NOW, {
          status: 'active',
          expiresAt: null,
          checkedAt: '2026-10-31T12:00:00.000Z',
        }),
      ).not.toBeNull()
    })
  })

  describe('expiry warnings', () => {
    async function inbox(userId: string) {
      const rows = await h.db
        .select()
        .from(h.schema.notifications)
        .where(eq(h.schema.notifications.userId, userId))
      return rows.map((r: { groupKey: string; meta: string }) => ({
        groupKey: r.groupKey,
        meta: JSON.parse(r.meta) as unknown,
      }))
    }

    const token = (expiresAt: string | null, status: 'active' | 'invalid' = 'active') => ({
      token: { status, expiresAt, checkedAt: NOW },
    })

    it('warns the creator and the owners and admins once each, inside the window', async () => {
      // Created by Dan (a member): he, Ama (owner) and Ben (admin) are told; Fay isn't.
      await h.adapter.createConnection(
        write({ createdBy: 'u-dan', ...token('2026-11-05T12:00:00.000Z') }),
      )
      expect(await h.adapter.notifyExpiringConnections(expiring())).toBe(3)
      expect(await h.adapter.notifyExpiringConnections(expiring())).toBe(0)
      expect(await inbox('u-fay')).toEqual([])
      expect(await inbox('u-dan')).toEqual([
        {
          groupKey: 'connection.token_expiring:c-1:2026-11-05T12:00:00.000Z:7d',
          meta: { connection: 'Acme production', expiresAt: '2026-11-05T12:00:00.000Z' },
        },
      ])
    })

    it('warns a second time inside the last day, and afresh for a new expiry', async () => {
      await h.adapter.createConnection(write(token('2026-10-31T06:00:00.000Z')))
      expect(await h.adapter.notifyExpiringConnections(expiring())).toBe(2)
      await h.adapter.updateConnection('c-1', {
        organizationId: 'org-acme',
        ...token('2026-11-04T06:00:00.000Z'),
      })
      expect(await h.adapter.notifyExpiringConnections(expiring())).toBe(2)
      expect((await inbox('u-ben')).map((r) => r.groupKey).sort()).toEqual([
        'connection.token_expiring:c-1:2026-10-31T06:00:00.000Z:1d',
        'connection.token_expiring:c-1:2026-11-04T06:00:00.000Z:7d',
      ])
    })

    it('leaves out tokens without expiry, far off, already expired or dead', async () => {
      await h.adapter.createConnection(write({ id: 'c-none', ...token(null) }))
      await h.adapter.createConnection(write({ id: 'c-far', ...token('2026-12-01T00:00:00.000Z') }))
      await h.adapter.createConnection(
        write({ id: 'c-gone', ...token('2026-10-29T00:00:00.000Z') }),
      )
      await h.adapter.createConnection(
        write({ id: 'c-dead', ...token('2026-11-02T00:00:00.000Z', 'invalid') }),
      )
      expect(await h.adapter.notifyExpiringConnections(expiring())).toBe(0)
    })

    it('takes back one connection’s warnings by prefix, and no one else’s', async () => {
      await h.adapter.createConnection(write({ id: 'c_1', ...token('2026-11-05T12:00:00.000Z') }))
      // `_` is a LIKE wildcard: c_1's prefix must not reach c11's rows.
      await h.adapter.createConnection(write({ id: 'c11', ...token('2026-11-05T12:00:00.000Z') }))
      expect(await h.adapter.notifyExpiringConnections(expiring())).toBe(4)
      await h.adapter.clearNotificationsByPrefix('org-acme', [
        'connection.token_expiring:c_1:',
        'connection.token_invalid:c_1:',
      ])
      const left = (await inbox('u-ben')).map((r) => r.groupKey)
      expect(left).toEqual(['connection.token_expiring:c11:2026-11-05T12:00:00.000Z:7d'])
      // Another organization's rows are never reached.
      await h.adapter.clearNotificationsByPrefix('org-globex', ['connection.token_expiring:c11:'])
      expect(await inbox('u-ben')).toHaveLength(1)
    })

    it('tells the keepers of a dead token through notify', async () => {
      await h.adapter.createConnection(write({ createdBy: 'u-dan' }))
      const written = await h.adapter.notify({
        idPrefix: 'ntf_inv',
        organizationId: 'org-acme',
        kind: 'expiry',
        event: 'connection.token_invalid',
        needsAction: true,
        groupKey: `connection.token_invalid:c-1:${NOW}`,
        projectId: null,
        workspaceId: null,
        meta: { connection: 'Acme production' },
        recipients: { connectionKeepers: { connectionId: 'c-1' } },
        onRepeat: 'keep',
        now: NOW,
      })
      expect(written.map((r) => r.userId).sort()).toEqual(['u-ama', 'u-ben', 'u-dan'])
    })
  })

  describe('a project’s own account (security review 2026-11-01)', () => {
    // Fay connected it and has since lost the project; Dan is now its project admin.
    async function ownedByP101(expiresAt: string | null) {
      await h.db
        .insert(h.schema.projectMembers)
        .values({ projectId: 'p-101', userId: 'u-dan', role: 'admin', createdAt: T0 })
      await h.adapter.createProjectConnection({
        id: 'c-own',
        projectId: 'p-101',
        organizationId: 'org-acme',
        createdBy: 'u-fay',
        provider: 'cloudflare',
        name: 'Checkout staging',
        credentials: CREDS,
        token: { status: 'active', expiresAt, checkedAt: NOW },
        makeDefault: true,
      })
    }

    it('warns its project admins and the org’s, not a creator who can’t see the project', async () => {
      await ownedByP101('2026-11-05T12:00:00.000Z')
      expect(await h.adapter.notifyExpiringConnections(expiring())).toBe(3)
      expect(await h.count('notifications', "user_id = 'u-fay'")).toBe(0)
      expect(await h.count('notifications', "user_id = 'u-dan'")).toBe(1)
    })

    it('tells the same people of a dead token', async () => {
      await ownedByP101(null)
      const written = await h.adapter.notify({
        idPrefix: 'ntf_inv',
        organizationId: 'org-acme',
        kind: 'expiry',
        event: 'connection.token_invalid',
        needsAction: true,
        groupKey: `connection.token_invalid:c-own:${NOW}`,
        projectId: null,
        workspaceId: null,
        meta: { connection: 'Checkout staging' },
        recipients: { connectionKeepers: { connectionId: 'c-own' } },
        onRepeat: 'keep',
        now: NOW,
      })
      expect(written.map((r) => r.userId).sort()).toEqual(['u-ama', 'u-ben', 'u-dan'])
    })
  })

  describe('project setup', () => {
    async function setup(projectId = 'p-101', organizationId = 'org-acme') {
      return h.adapter.getProjectSetup(organizationId, projectId, NOW)
    }

    it('says connected only with a serving account whose token works and hasn’t expired', async () => {
      expect((await setup())?.cloudflareConnected).toBe(false)
      await h.adapter.createConnection(write({ allProjects: false, projectIds: ['p-202'] }))
      await addToProjects(h)
      expect((await setup())?.cloudflareConnected).toBe(false)
      await h.adapter.updateConnection('c-1', {
        organizationId: 'org-acme',
        projectIds: ['p-101'],
        token: { status: 'active', expiresAt: '2026-10-29T00:00:00.000Z', checkedAt: NOW },
      })
      expect((await setup())?.cloudflareConnected).toBe(false)
      await h.adapter.updateConnection('c-1', {
        organizationId: 'org-acme',
        token: { status: 'invalid', expiresAt: null, checkedAt: NOW },
      })
      expect((await setup())?.cloudflareConnected).toBe(false)
      await h.adapter.updateConnection('c-1', {
        organizationId: 'org-acme',
        token: { status: 'active', expiresAt: null, checkedAt: NOW },
      })
      expect((await setup())?.cloudflareConnected).toBe(true)
    })

    it('says connected only once the project has added the account', async () => {
      await h.adapter.createConnection(
        write({ token: { status: 'active', expiresAt: null, checkedAt: NOW } }),
      )
      expect((await setup())?.cloudflareConnected).toBe(false)
      await addToProjects(h, ['p-101'])
      expect((await setup())?.cloudflareConnected).toBe(true)
    })

    it('counts inherited and own variables and live project keys', async () => {
      const v = (
        id: string,
        name: string,
        place: { projectId?: string; workspaceId?: string },
      ) => ({
        id,
        organizationId: 'org-acme',
        projectId: place.projectId ?? null,
        workspaceId: place.workspaceId ?? null,
        createdBy: 'u-ama',
        name,
        value: 'x',
        createdAt: T0,
        updatedAt: T0,
      })
      await h.db
        .insert(h.schema.envVars)
        .values([
          v('v-1', 'REGION', {}),
          v('v-2', 'TOKEN', {}),
          v('v-3', 'TOKEN', { projectId: 'p-101' }),
          v('v-4', 'OWN', { projectId: 'p-101' }),
          v('v-5', 'WS', { projectId: 'p-101', workspaceId: 'ws-sales' }),
        ])
      const key = (id: string, over: Record<string, unknown> = {}) => ({
        id,
        organizationId: 'org-acme',
        level: 'project',
        createdBy: 'u-ama',
        name: id,
        keyHash: `hash-${id}`,
        keyPrefix: 'ask_',
        scopes: '[]',
        createdAt: T0,
        ...over,
      })
      await h.db
        .insert(h.schema.apiKeys)
        .values([
          key('k-live'),
          key('k-revoked', { revokedAt: T0 }),
          key('k-expired', { expiresAt: '2026-10-29T00:00:00.000Z' }),
          key('k-ws', { level: 'workspace' }),
        ])
      await h.db.insert(h.schema.apiKeyProjects).values([
        { keyId: 'k-live', projectId: 'p-101', revokedAt: null },
        { keyId: 'k-revoked', projectId: 'p-101', revokedAt: null },
        { keyId: 'k-expired', projectId: 'p-101', revokedAt: null },
      ])
      await h.db
        .insert(h.schema.apiKeyWorkspaces)
        .values([{ keyId: 'k-ws', workspaceId: 'ws-sales', revokedAt: null }])
      expect(await setup()).toEqual({
        cloudflareConnected: false,
        orgVariables: 1,
        projectVariables: 2,
        projectKeys: 1,
      })
    })

    it('answers nothing for another organization’s project', async () => {
      expect(await setup('p-g')).toBeNull()
    })
  })

  describe('node usage', () => {
    it('counts workflows using each installed node in their current version only', async () => {
      const ir = (types: string[]) =>
        JSON.stringify({ nodes: types.map((type, i) => ({ id: `n${i}`, type })) })
      await h.db.insert(h.schema.workflowVersions).values([
        {
          id: 'v-enrich-3',
          workflowId: 'wf-enrich',
          version: 3,
          ir: ir(['slack', 'slack']),
          createdAt: T0,
        },
        {
          id: 'v-sync-2',
          workflowId: 'wf-sync',
          version: 2,
          ir: ir(['slack', 'stripe']),
          createdAt: T0,
        },
        { id: 'v-202-1', workflowId: 'wf-202', version: 1, ir: ir(['stripe']), createdAt: T0 },
        { id: 'v-202-2', workflowId: 'wf-202', version: 2, ir: ir(['slack']), createdAt: T0 },
        { id: 'v-g-1', workflowId: 'wf-g', version: 1, ir: ir(['slack']), createdAt: T0 },
      ])
      const current = async (workflowId: string, versionId: string) =>
        h.db
          .update(h.schema.workflows)
          .set({ currentVersionId: versionId })
          .where(eq(h.schema.workflows.id, workflowId))
      await current('wf-enrich', 'v-enrich-3')
      await current('wf-sync', 'v-sync-2')
      // wf-202's draft v2 uses slack; its current v1 doesn't.
      await current('wf-202', 'v-202-1')
      await current('wf-g', 'v-g-1')
      for (const [nodeId, organizationId] of [
        ['slack', 'org-acme'],
        ['stripe', 'org-acme'],
        ['resend', 'org-acme'],
        ['slack', 'org-globex'],
      ] as const) {
        await h.adapter.installNode({
          id: `i-${nodeId}-${organizationId}`,
          organizationId,
          nodeId,
          version: '1.0.0',
          bundle: JSON.stringify({
            definition: { id: nodeId, name: `${nodeId} node`, category: 'Messaging' },
          }),
          installedBy: 'u-ama',
        })
      }
      const usage = await h.adapter.listNodeUsage('org-acme')
      expect(usage.sort((a, b) => a.nodeId.localeCompare(b.nodeId))).toEqual([
        {
          nodeId: 'resend',
          version: '1.0.0',
          name: 'resend node',
          category: 'Messaging',
          description: null,
          usage: 0,
        },
        {
          nodeId: 'slack',
          version: '1.0.0',
          name: 'slack node',
          category: 'Messaging',
          description: null,
          usage: 2,
        },
        {
          nodeId: 'stripe',
          version: '1.0.0',
          name: 'stripe node',
          category: 'Messaging',
          description: null,
          usage: 2,
        },
      ])
    })
  })
})
