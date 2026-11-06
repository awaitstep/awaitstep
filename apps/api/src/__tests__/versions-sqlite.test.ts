import { describe, it, expect, beforeEach } from 'vitest'
import { eq } from 'drizzle-orm'
import { createSqliteApp, seedAcme, type SqliteApp } from './sqlite-app.js'

// The save precondition on a real database: the guards ride in the UPDATE
// and INSERT themselves, so this is where "nothing written on a 409" and "two
// saves with one base" are checked for what the statements do, not what the
// mock pretends. Ama owns Acme; wf-sales is in Project 101's Sales workspace.

const ir = (code: string) => ({
  metadata: { name: 'In sales', version: 1, createdAt: '2026-01-01', updatedAt: '2026-01-01' },
  nodes: [
    {
      id: 'step-1',
      type: 'step',
      name: 'Hello',
      position: { x: 0, y: 0 },
      version: '1.0.0',
      provider: 'cloudflare',
      data: { code },
    },
  ],
  edges: [],
  entryNodeId: 'step-1',
})

describe('version saves on sqlite', () => {
  let h: SqliteApp
  beforeEach(async () => {
    h = createSqliteApp()
    await seedAcme(h)
  })

  const save = (body: unknown) =>
    h.app.request('/api/workflows/wf-sales/versions?projectId=p-101', h.as('u-ama', h.json(body)))
  const storedIr = async (id: string) =>
    (
      await h.db
        .select({ ir: h.schema.workflowVersions.ir })
        .from(h.schema.workflowVersions)
        .where(eq(h.schema.workflowVersions.id, id))
    )[0]!.ir

  it('refuses a stale base and leaves the row byte-identical; takes the current one in place', async () => {
    const first = await save({ ir: ir('return 1;') })
    expect(first.status).toBe(201)
    const created = await first.json()
    expect(created.graphHash).toMatch(/^[0-9a-f]{16}$/)
    const before = await storedIr(created.id)

    const stale = await save({ ir: ir('return 2;'), baseGraphHash: 'deadbeefdeadbeef' })
    expect(stale.status).toBe(409)
    expect(await stale.json()).toEqual({
      error: 'This workflow changed since it was loaded',
      currentVersionId: created.id,
      currentGraphHash: created.graphHash,
    })
    expect(await storedIr(created.id)).toBe(before)

    const current = await save({ ir: ir('return 2;'), baseGraphHash: created.graphHash })
    expect(current.status).toBe(200)
    const saved = await current.json()
    expect(saved.id).toBe(created.id)
    expect(saved.graphHash).not.toBe(created.graphHash)
    expect(await storedIr(created.id)).toContain('return 2;')
  })

  it('lets exactly one of two concurrent saves on the same base through', async () => {
    const created = await (await save({ ir: ir('return 1;') })).json()
    const [a, b] = await Promise.all([
      save({ ir: ir('return 2;'), baseGraphHash: created.graphHash }),
      save({ ir: ir('return 3;'), baseGraphHash: created.graphHash }),
    ])
    expect([a.status, b.status].sort()).toEqual([200, 409])
    const stored = await storedIr(created.id)
    const winner = a.status === 200 ? 'return 2;' : 'return 3;'
    expect(stored).toContain(winner)
    const rows = await h.db.select().from(h.schema.workflowVersions)
    expect(rows).toHaveLength(1)
  })

  it('writes the next number once the latest is deployed, and the index settles a race on it', async () => {
    const created = await (await save({ ir: ir('return 1;') })).json()
    await h.db.insert(h.schema.deployments).values({
      id: 'd-1',
      workflowId: 'wf-sales',
      versionId: created.id,
      serviceName: 'svc',
      status: 'success',
      createdAt: '2026-10-21T00:00:00.000Z',
    })
    const [a, b] = await Promise.all([
      save({ ir: ir('return 2;'), baseGraphHash: created.graphHash }),
      save({ ir: ir('return 3;'), baseGraphHash: created.graphHash }),
    ])
    expect([a.status, b.status].sort()).toEqual([201, 409])
    const rows = await h.db.select().from(h.schema.workflowVersions)
    expect(rows.map((r) => r.version).sort()).toEqual([1, 2])
    expect(await storedIr(created.id)).toContain('return 1;')
  })

  it('commits the live files into the current version and reports the version on the listing', async () => {
    const created = await (await save({ ir: ir('return 1;') })).json()
    const put = await h.app.request(
      '/api/workflows/wf-sales/files/lib/x.ts?projectId=p-101',
      h.as('u-ama', {
        ...h.json({ source: 'export const x = 1' }, 'PUT'),
        headers: { 'If-None-Match': '*' },
      }),
    )
    expect(put.status).toBe(201)
    const committed = await h.app.request(
      '/api/workflows/wf-sales/versions/commit?projectId=p-101',
      h.as('u-ama', { method: 'POST' }),
    )
    expect(committed.status).toBe(200)
    const body = await committed.json()
    expect(body.id).toBe(created.id)
    expect(body.graphHash).toBe(created.graphHash)
    expect(JSON.parse(await storedIr(created.id)).runtime.files).toEqual([
      { path: 'lib/x.ts', source: 'export const x = 1' },
    ])
    const listing = await (
      await h.app.request('/api/workflows/wf-sales/project?projectId=p-101', h.as('u-ama'))
    ).json()
    expect(listing.version).toEqual({ id: created.id, graphHash: created.graphHash })
  })

  it('a Viewer cannot commit, and a workflow outside the caller’s reach is not found', async () => {
    await save({ ir: ir('return 1;') })
    const viewer = await h.app.request(
      '/api/workflows/wf-sales/versions/commit?projectId=p-101',
      h.as('u-eve', { method: 'POST' }),
    )
    expect(viewer.status).toBe(403)
    const outsider = await h.app.request(
      '/api/workflows/wf-sales/versions/commit?projectId=p-101',
      h.as('u-gus', { method: 'POST' }),
    )
    expect(outsider.status).toBe(404)
  })
})
