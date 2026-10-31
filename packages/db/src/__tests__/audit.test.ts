import { describe, it, expect, beforeEach, vi } from 'vitest'

// PGlite migrates a fresh database per test; under a parallel `pnpm test` that
// runs past vitest's 5s default.
vi.setConfig({ testTimeout: 30_000, hookTimeout: 30_000 })
import type { AuditEventInsert, AuditListFilter } from '../types.js'
import Database from 'better-sqlite3'
import { eq } from 'drizzle-orm'
import { drizzle as drizzleSqlite } from 'drizzle-orm/better-sqlite3'
import { migrate as migrateSqlite } from 'drizzle-orm/better-sqlite3/migrator'
import { DrizzleDatabaseAdapter } from '../adapters/index.js'
import * as sqliteSchema from '../schema/sqlite/index.js'
import {
  type Harness,
  SQLITE_FOLDER,
  pgHarness,
  seed,
  sqliteHarness,
} from './fixtures/workspaces-db.js'

// The organization audit log (B7), on both dialects, over the shared seed:
// Acme (Ama owner, Ben admin) with Project 101 › Sales, Ops; Globex.

const SINCE = '2026-10-01T00:00:00.000Z'
const HIDDEN = ['connection.verify.attempt']

function row(
  over: Partial<AuditEventInsert> & { id: string; createdAt: string },
): AuditEventInsert {
  return {
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
    target: 'Old onboarding',
    detail: '',
    meta: '{}',
    ip: '81.2.69.x',
    ...over,
  }
}

function filter(over: Partial<AuditListFilter> = {}): AuditListFilter {
  return { organizationId: 'org-acme', since: SINCE, hiddenEvents: HIDDEN, ...over }
}

describe.each([
  ['sqlite', sqliteHarness],
  ['pg', pgHarness],
])('audit log on %s', (_name, makeHarness) => {
  let h: Harness

  beforeEach(async () => {
    h = await makeHarness()
    await seed(h)
  })

  it('lists newest first, with the scope named from what exists now', async () => {
    await h.adapter.insertAuditEvents([
      row({ id: 'a1', createdAt: '2026-10-28T01:00:00.000Z' }),
      row({
        id: 'a2',
        createdAt: '2026-10-28T02:00:00.000Z',
        level: 'project',
        projectId: 'p-101',
      }),
      row({
        id: 'a3',
        createdAt: '2026-10-28T03:00:00.000Z',
        level: 'workspace',
        projectId: 'p-101',
        workspaceId: 'ws-sales',
        kind: 'access',
        event: 'workflow.share',
      }),
      row({
        id: 'a4',
        createdAt: '2026-10-28T04:00:00.000Z',
        level: 'workspace',
        projectId: 'p-gone',
        workspaceId: 'ws-gone',
      }),
    ])
    const page = await h.adapter.listAuditEvents(filter())
    expect(page.total).toBe(4)
    expect(page.nextCursor).toBeNull()
    expect(page.data.map((e) => [e.id, e.scope])).toEqual([
      ['a4', { level: 'workspace', name: 'Deleted project · Deleted workspace', colour: null }],
      ['a3', { level: 'workspace', name: 'Project 101 · Sales', colour: 'blue' }],
      ['a2', { level: 'project', name: 'Project 101', colour: null }],
      ['a1', { level: 'organization', name: 'Acme', colour: null }],
    ])
    expect(page.data[1]).toMatchObject({
      at: '2026-10-28T03:00:00.000Z',
      kind: 'access',
      event: 'workflow.share',
      actor: 'Ama Mensah',
      actorType: 'user',
      actorId: 'u-ama',
      actorEmail: 'ama@acme.test',
      action: 'deleted the workflow',
      target: 'Old onboarding',
      ip: '81.2.69.x',
    })
  })

  it('keeps each organization’s events to itself and leaves out hidden markers and old rows', async () => {
    await h.adapter.insertAuditEvents([
      row({ id: 'acme', createdAt: '2026-10-28T01:00:00.000Z' }),
      row({ id: 'globex', organizationId: 'org-globex', createdAt: '2026-10-28T01:00:00.000Z' }),
      row({ id: 'ok', event: 'connection.verify.attempt', createdAt: '2026-10-28T01:00:00.000Z' }),
      row({ id: 'old', createdAt: '2026-09-01T00:00:00.000Z' }),
    ])
    const page = await h.adapter.listAuditEvents(filter())
    expect(page.data.map((e) => e.id)).toEqual(['acme'])
    expect(page.total).toBe(1)
  })

  it('filters by level and searches actor, action and target ignoring case', async () => {
    await h.adapter.insertAuditEvents([
      row({ id: 'org', createdAt: '2026-10-28T01:00:00.000Z', target: 'Terraform' }),
      row({
        id: 'ws',
        createdAt: '2026-10-28T02:00:00.000Z',
        level: 'workspace',
        projectId: 'p-101',
        workspaceId: 'ws-sales',
        target: 'Sales',
      }),
      row({ id: 'ben', createdAt: '2026-10-28T03:00:00.000Z', actorName: 'Ben Okoro' }),
    ])
    const ws = await h.adapter.listAuditEvents(filter({ level: 'workspace' }))
    expect(ws.data.map((e) => e.id)).toEqual(['ws'])
    const sales = await h.adapter.listAuditEvents(filter({ search: 'SALES' }))
    expect(sales.data.map((e) => e.id)).toEqual(['ws'])
    const ben = await h.adapter.listAuditEvents(filter({ search: 'okoro' }))
    expect(ben.data.map((e) => e.id)).toEqual(['ben'])
    const action = await h.adapter.listAuditEvents(filter({ search: 'deleted the' }))
    expect(action.total).toBe(3)
  })

  it('takes LIKE wildcards in a search literally', async () => {
    await h.adapter.insertAuditEvents([
      row({ id: 'pct', createdAt: '2026-10-28T01:00:00.000Z', target: '100% done' }),
      row({ id: 'plain', createdAt: '2026-10-28T02:00:00.000Z', target: 'a_b' }),
      row({ id: 'other', createdAt: '2026-10-28T03:00:00.000Z', target: 'axb!c' }),
    ])
    expect(
      (await h.adapter.listAuditEvents(filter({ search: '%' }))).data.map((e) => e.id),
    ).toEqual(['pct'])
    expect(
      (await h.adapter.listAuditEvents(filter({ search: '_' }))).data.map((e) => e.id),
    ).toEqual(['plain'])
    expect(
      (await h.adapter.listAuditEvents(filter({ search: '!' }))).data.map((e) => e.id),
    ).toEqual(['other'])
  })

  it('pages across equal timestamps with the total on every page, even past the end', async () => {
    const same = '2026-10-28T05:00:00.000Z'
    await h.adapter.insertAuditEvents(
      ['e1', 'e2', 'e3', 'e4', 'e5'].map((id) => row({ id, createdAt: same })),
    )
    const seen: string[] = []
    let cursor: string | null = null
    do {
      const page = await h.adapter.listAuditEvents(filter(), { cursor, limit: 2 })
      expect(page.total).toBe(5)
      seen.push(...page.data.map((e) => e.id))
      cursor = page.nextCursor
    } while (cursor)
    expect(seen).toEqual(['e5', 'e4', 'e3', 'e2', 'e1'])
    const past = await h.adapter.listAuditEvents(filter(), { cursor: `e0_${same}`, limit: 2 })
    expect(past).toEqual({ data: [], nextCursor: null, total: 5 })
    const none = await h.adapter.listAuditEvents(filter({ search: 'nothing like this' }))
    expect(none).toEqual({ data: [], nextCursor: null, total: 0 })
  })

  it('writes a sign-in once for every organization the person is in', async () => {
    await h.adapter.insertPersonAuditEvents({
      idPrefix: 'sig_sess1',
      userId: 'u-ama',
      event: 'signin',
      action: 'signed in to',
      detail: '81.2.69.x',
      ip: '81.2.69.x',
      createdAt: '2026-10-28T06:00:00.000Z',
    })
    const acme = await h.adapter.listAuditEvents(filter())
    const globex = await h.adapter.listAuditEvents(filter({ organizationId: 'org-globex' }))
    expect(acme.data).toEqual([
      expect.objectContaining({
        id: 'sig_sess1_org-acme',
        actorId: 'u-ama',
        actorEmail: 'ama@acme.test',
        kind: 'auth',
        event: 'signin',
        target: 'Acme',
        actor: 'Ama Mensah',
        scope: { level: 'organization', name: 'Acme', colour: null },
      }),
    ])
    expect(globex.data.map((e) => [e.id, e.target])).toEqual([['sig_sess1_org-globex', 'Globex']])
    expect(await h.count('audit_events')).toBe(2)
  })

  it('writes a person event with its own target, kind and facts in each of their organizations', async () => {
    await h.adapter.insertPersonAuditEvents({
      idPrefix: 'conn_1',
      userId: 'u-ama',
      event: 'account.method_connect',
      action: 'connected GitHub to',
      target: 'their account',
      detail: 'Dashboard',
      ip: null,
      createdAt: '2026-10-28T07:00:00.000Z',
    })
    for (const organizationId of ['org-acme', 'org-globex']) {
      const page = await h.adapter.listAuditEvents(filter({ organizationId }))
      expect(page.data.map((e) => [e.event, e.kind, e.target])).toEqual([
        ['account.method_connect', 'auth', 'their account'],
      ])
    }
  })

  it('keeps at most 200 characters of a sign-in’s chosen name', async () => {
    await h.db
      .update(h.schema.user)
      .set({ name: 'x'.repeat(5000) })
      .where(eq(h.schema.user.id, 'u-ben'))
    await h.adapter.insertPersonAuditEvents({
      idPrefix: 'sig_long',
      userId: 'u-ben',
      event: 'signin',
      action: 'signed in to',
      detail: '',
      ip: null,
      createdAt: '2026-10-28T06:00:00.000Z',
    })
    const [event] = (await h.adapter.listAuditEvents(filter())).data
    expect(event!.actor).toHaveLength(200)
  })

  it('reserves an attempt and counts the actor’s other ones in the window, in one statement', async () => {
    const ATTEMPT = 'connection.verify.attempt'
    const attempt = (
      id: string,
      createdAt: string,
      actorType: 'user' | 'key' = 'user',
      actorId = 'u-ben',
    ) => row({ id, createdAt, actorId, actorType, kind: 'auth', event: ATTEMPT })
    const reserve = (
      id: string,
      createdAt: string,
      ofType?: 'user' | 'key',
      since = '2026-10-28T08:30:00.000Z',
    ) => h.adapter.reserveAuditAttempt(attempt(id, createdAt, ofType ?? 'user'), since, ofType)

    // Outside the window: never counts.
    expect(await reserve('a-old', '2026-10-28T08:00:00.000Z')).toEqual({
      failures: 0,
      lastFailureAt: null,
    })
    expect((await reserve('a1', '2026-10-28T09:00:00.000Z')).failures).toBe(0)
    // Another person's attempts never count.
    await h.adapter.reserveAuditAttempt(
      attempt('x', '2026-10-28T09:45:00.000Z', 'user', 'u-ama'),
      SINCE,
    )
    expect(await reserve('a2', '2026-10-28T09:50:00.000Z')).toEqual({
      failures: 1,
      lastFailureAt: '2026-10-28T09:00:00.000Z',
    })
    // A key's attempts count against the person, except for the person's own session.
    await h.adapter.reserveAuditAttempt(attempt('k1', '2026-10-28T09:52:00.000Z', 'key'), SINCE)
    expect((await reserve('a3', '2026-10-28T09:53:00.000Z', 'user')).failures).toBe(2)
    expect((await reserve('a4', '2026-10-28T09:54:00.000Z')).failures).toBe(4)
    // Same instant: each sees every other one, whatever their ids.
    expect((await reserve('a6', '2026-10-28T09:55:00.000Z')).failures).toBe(5)
    expect((await reserve('a5', '2026-10-28T09:55:00.000Z')).failures).toBe(6)

    await h.adapter.deleteAuditEvent('a6')
    expect((await reserve('a7', '2026-10-28T09:56:00.000Z')).failures).toBe(6)
  })

  it('purges rows older than the cut and keeps the rest', async () => {
    await h.adapter.insertAuditEvents([
      row({ id: 'old', createdAt: '2026-07-01T00:00:00.000Z' }),
      row({ id: 'new', createdAt: '2026-10-28T00:00:00.000Z' }),
    ])
    expect(await h.adapter.purgeAuditEvents('2026-08-01T00:00:00.000Z')).toBe(1)
    expect(await h.count('audit_events')).toBe(1)
  })

  it('purges a large backlog batch by batch', async () => {
    await h.adapter.insertAuditEvents(
      Array.from({ length: 2005 }, (_, i) =>
        row({ id: `old-${i}`, createdAt: '2026-07-01T00:00:00.000Z' }),
      ),
    )
    expect(await h.adapter.purgeAuditEvents('2026-08-01T00:00:00.000Z')).toBe(2005)
    expect(await h.count('audit_events')).toBe(0)
  })

  it('outlives the project it names, and even its organization', async () => {
    await h.adapter.insertAuditEvents([
      row({
        id: 'p',
        createdAt: '2026-10-28T01:00:00.000Z',
        level: 'project',
        projectId: 'p-202',
      }),
      row({ id: 'g', organizationId: 'org-globex', createdAt: '2026-10-28T01:00:00.000Z' }),
    ])
    await h.adapter.deleteProject('p-202', 'org-acme')
    const page = await h.adapter.listAuditEvents(filter())
    expect(page.data[0]!.scope.name).toBe('Deleted project')
    await h.db.delete(h.schema.organization).where(eq(h.schema.organization.id, 'org-globex'))
    // Left for the 90-day purge: deleting the organization erases no evidence.
    expect(await h.count('audit_events', "organization_id = 'org-globex'")).toBe(1)
  })

  it('names a project moved to another organization as gone, not by its name there', async () => {
    await h.adapter.insertAuditEvents([
      row({
        id: 'w',
        createdAt: '2026-10-28T01:00:00.000Z',
        level: 'workspace',
        projectId: 'p-202',
        workspaceId: 'ws-202',
      }),
    ])
    await h.db
      .update(h.schema.projects)
      .set({ organizationId: 'org-globex' })
      .where(eq(h.schema.projects.id, 'p-202'))
    const page = await h.adapter.listAuditEvents(filter())
    expect(page.data[0]!.scope.name).toBe('Deleted project · Deleted workspace')
  })

  it('reads where a project move left the project with both organizations’ names', async () => {
    expect(await h.adapter.getProjectMoveOutcome('p-202', 'org-acme', 'org-globex')).toEqual({
      organizationId: 'org-acme',
      lockedAt: null,
      updatedAt: expect.any(String),
      fromName: 'Acme',
      toName: 'Globex',
    })
    // The stamp a move answers is the one the outcome reads back; a second,
    // concurrent move of the same project answers another.
    await h.db.update(h.schema.member).set({ role: 'admin' }).where(eq(h.schema.member.id, 'm-3'))
    const movedAt = await h.adapter.moveProjectToOrganization(
      'p-202',
      'org-acme',
      'org-globex',
      'u-ama',
    )
    await new Promise((resolve) => setTimeout(resolve, 5))
    const again = await h.adapter.moveProjectToOrganization(
      'p-202',
      'org-acme',
      'org-globex',
      'u-ama',
    )
    const after = await h.adapter.getProjectMoveOutcome('p-202', 'org-acme', 'org-globex')
    expect(after).toMatchObject({ organizationId: 'org-globex', updatedAt: movedAt })
    expect(again).not.toBe(movedAt)
    expect(await h.adapter.getProjectMoveOutcome('p-nope', 'org-acme', 'org-globex')).toBeNull()
  })
})

describe('audit writes and D1', () => {
  it('keeps every statement under D1’s 100 bound parameters, however many rows', async () => {
    const sqlite = new Database(':memory:')
    sqlite.pragma('foreign_keys = ON')
    const params: number[] = []
    const db = drizzleSqlite(sqlite, {
      schema: sqliteSchema,
      logger: { logQuery: (_query, bound) => params.push(bound.length) },
    })
    migrateSqlite(db, { migrationsFolder: SQLITE_FOLDER })
    const adapter = new DrizzleDatabaseAdapter(db, sqliteSchema, { dialect: 'sqlite' })
    await db
      .insert(sqliteSchema.organization)
      .values({ id: 'org-acme', name: 'Acme', slug: 'acme', createdAt: '2026-10-20T00:00:00.000Z' })
    params.length = 0
    await adapter.insertAuditEvents(
      Array.from({ length: 20 }, (_, i) =>
        row({ id: `inv-${i}`, createdAt: '2026-10-28T01:00:00.000Z', event: 'invitation.create' }),
      ),
    )
    expect(Math.max(...params)).toBeLessThanOrEqual(100)
    expect(params.length).toBe(4)
    expect(
      (sqlite.prepare('SELECT count(*) AS n FROM audit_events').get() as { n: number }).n,
    ).toBe(20)
  })
})
