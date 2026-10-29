import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  createTestApp,
  mockDb,
  resetStore,
  setTestOrgRole,
  TEST_ORG_ID,
  TEST_USER_ID,
} from './helpers.js'

function url(path: string) {
  return `${path}${path.includes('?') ? '&' : '?'}organizationId=${TEST_ORG_ID}`
}

function post(app: ReturnType<typeof createTestApp>, body: unknown) {
  return app.request(url('/api/projects'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

describe('POST /api/projects', () => {
  let app: ReturnType<typeof createTestApp>

  beforeEach(() => {
    resetStore()
    app = createTestApp()
  })

  it('creates a project from a well-formed slug', async () => {
    const res = await post(app, { name: 'Sales', slug: 'sales' })
    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.slug).toBe('sales')
    expect(body.organizationId).toBe(TEST_ORG_ID)
    // Born with its Default workspace, made by the caller.
    expect(body.defaultWorkspace).toMatchObject({
      projectId: body.id,
      slug: 'default',
      name: 'Default',
      createdBy: TEST_USER_ID,
    })
  })

  it('lists projects with their workspaces, health and people', async () => {
    const res = await app.request(url('/api/projects'))
    expect(res.status).toBe(200)
    const { data } = await res.json()
    expect(data[0]).toMatchObject({
      slug: 'test-project',
      workspaces: [{ slug: 'default', colour: 'green' }],
      health: { workflows: 0, failing: 0 },
      lock: null,
      viewerRole: 'admin',
    })
    expect(data[0].members[0]).toMatchObject({ role: 'owner' })
    expect(data[0].viewerCan.createWorkspace.allowed).toBe(true)
  })

  it('refuses a slug that a dashboard page already owns', async () => {
    for (const slug of ['settings', 'account', 'items', 'projects', 'inbox']) {
      const res = await post(app, { name: 'Shadow', slug })
      expect(res.status, slug).toBe(422)
      const body = await res.json()
      expect(JSON.stringify(body)).toContain('taken by a page')
    }
  })

  it('answers a slug another project in the org holds with 409', async () => {
    const taken = Object.assign(new Error('UNIQUE constraint failed: projects.slug'), {
      code: 'SQLITE_CONSTRAINT_UNIQUE',
    })
    const create = vi.spyOn(mockDb, 'createProject').mockRejectedValueOnce(taken)
    const res = await post(app, { name: 'Dup', slug: 'dup' })
    expect(res.status).toBe(409)
    expect((await res.json()).error).toMatch(/already uses that URL/)
    create.mockRestore()

    // drizzle on pg wraps the driver's error, with the original as `cause`.
    const update = vi.spyOn(mockDb, 'updateProject').mockRejectedValueOnce(
      Object.assign(new Error('Failed query: update "projects" …'), {
        cause: Object.assign(new Error('duplicate key value violates unique constraint'), {
          code: '23505',
        }),
      }),
    )
    const patch = await app.request(url('/api/projects/test-project-1'), {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slug: 'dup' }),
    })
    expect(patch.status).toBe(409)
    update.mockRestore()
  })

  it('renames a project’s slug, refusing a reserved one', async () => {
    const ok = await app.request(url('/api/projects/test-project-1'), {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slug: 'renamed' }),
    })
    expect(ok.status).toBe(200)
    expect((await ok.json()).slug).toBe('renamed')
    const reserved = await app.request(url('/api/projects/test-project-1'), {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slug: 'settings' }),
    })
    expect(reserved.status).toBe(422)
  })

  it('lets only org owners and admins rename or delete a project', async () => {
    setTestOrgRole('member')
    const patch = await app.request(url('/api/projects/test-project-1'), {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Renamed' }),
    })
    expect(patch.status).toBe(403)
    const del = await app.request(url('/api/projects/test-project-1'), { method: 'DELETE' })
    expect(del.status).toBe(403)
    // Creating one is for every member.
    expect((await post(app, { name: 'Mine', slug: 'mine' })).status).toBe(201)
  })

  it('keeps a locked project, as the real database does', async () => {
    // The in-memory store holds the row itself: locking it in place stands in
    // for `PUT /projects/:id/lock`, which is the SQL's (locks.test.ts).
    const project = await mockDb.getProjectById('test-project-1')
    project!.lockedAt = '2026-10-20T00:00:00.000Z'
    const del = await app.request(url('/api/projects/test-project-1'), { method: 'DELETE' })
    expect(del.status).toBe(409)
    expect((await del.json()).error).toBe('Turn off the deletion lock first')
    expect(await mockDb.getProjectById('test-project-1')).not.toBeNull()
  })

  it('refuses a slug of the wrong shape', async () => {
    for (const slug of ['Sales', 'my project', '-sales', 'sales-', '']) {
      const res = await post(app, { name: 'Sales', slug })
      expect(res.status, slug).toBe(422)
    }
  })
})
