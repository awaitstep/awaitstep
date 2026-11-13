import { beforeEach, describe, expect, it } from 'vitest'
import { createSqliteApp, seedAcme, type SqliteApp } from './sqlite-app.js'

// Copying and moving a workspace's item to the project's library, on a real
// database. Ama owns Acme; Eve views Sales; Gus edits Ops but is no project member.

const SALES = 'projectId=p-101&workspaceId=ws-sales'
const OPS = 'projectId=p-101&workspaceId=ws-ops'
const PROJECT = 'projectId=p-101'

let h: SqliteApp

async function call(path: string, init: RequestInit = {}, user = 'u-ama') {
  return h.app.request(`/api${path}`, h.as(user, init))
}

async function body<T = Record<string, unknown>>(res: Response): Promise<T> {
  return (await res.json()) as T
}

async function createItem(data: Record<string, unknown>, scope = SALES, user = 'u-ama') {
  const res = await call(`/library/items?${scope}`, h.json(data), user)
  expect(res.status).toBe(201)
  return (await body<{ id: string }>(res)).id
}

async function put(id: string, path: string, source: string) {
  const res = await call(`/library/items/${id}/files/${path}`, h.json({ source }, 'PUT'))
  expect([200, 201]).toContain(res.status)
}

async function publish(id: string) {
  expect((await call(`/library/items/${id}/versions`, { method: 'POST' })).status).toBe(201)
}

async function publishedModule(slug: string, source: string, scope = SALES) {
  const id = await createItem({ kind: 'module', name: slug }, scope)
  await put(id, 'package.json', JSON.stringify({ name: slug, version: '1.0.0', type: 'module' }))
  await put(id, 'index.ts', source)
  await publish(id)
  return id
}

function move(id: string, user = 'u-ama', init: RequestInit = {}) {
  return call(`/library/items/${id}/move`, { ...h.json({ to: 'project' }), ...init }, user)
}

describe('moving a library item to the project', () => {
  beforeEach(async () => {
    h = createSqliteApp()
    await seedAcme(h)
  })

  it('keeps the item and its versions, and every workspace’s palette offers it', async () => {
    const id = await createItem({ kind: 'node', name: 'Say hello' })
    await publish(id)
    const before = await body<{ itemId: string }[]>(
      await call(`/workflows/wf-ops/custom-nodes?${PROJECT}`),
    )
    expect(before.map((n) => n.itemId)).not.toContain(id)

    const res = await move(id)
    expect(res.status).toBe(200)
    expect(await body(res)).toMatchObject({
      id,
      owner: { kind: 'project', id: 'p-101', name: 'Project 101' },
      latestVersion: '1.0.0',
      nodeType: `custom:${id}`,
    })
    const after = await body<{ itemId: string }[]>(
      await call(`/workflows/wf-ops/custom-nodes?${PROJECT}`),
    )
    expect(after.map((n) => n.itemId)).toContain(id)
    const project = await body<{ own: { id: string }[] }>(await call(`/library/summary?${PROJECT}`))
    expect(project.own.map((row) => row.id)).toContain(id)
    const sales = await body<{ own: { id: string }[] }>(await call(`/library/summary?${SALES}`))
    expect(sales.own.map((row) => row.id)).not.toContain(id)
  })

  it('refuses a slug the project already has', async () => {
    await createItem({ kind: 'module', name: 'fmt' }, PROJECT)
    const id = await createItem({ kind: 'module', name: 'fmt' })
    const res = await move(id)
    expect(res.status).toBe(409)
    expect((await body(res)).error).toBe(
      'The project’s library already has a module with the slug "fmt"',
    )
  })

  it('names the workspace modules it imports, which the project could not reach', async () => {
    await publishedModule('dates', 'export const today = () => 1\n')
    const report = await publishedModule(
      'report',
      "import { today } from '#modules/dates'\nexport const run = () => today()\n",
    )
    const res = await move(report)
    expect(res.status).toBe(409)
    expect(await body(res)).toEqual({
      error: 'It imports "dates" from this workspace only: move it to the project first',
      slugs: ['dates'],
    })
  })

  it('refuses an item the project already owns', async () => {
    const id = await createItem({ kind: 'module', name: 'fmt' }, PROJECT)
    const res = await move(id)
    expect(res.status).toBe(409)
    expect((await body(res)).error).toBe('It’s already in the project’s library')
  })

  it('needs an Editor of the workspace who is also a project member', async () => {
    const sales = await createItem({ kind: 'module', name: 'fmt' })
    expect((await move(sales, 'u-eve')).status).toBe(403)

    const ops = await createItem({ kind: 'module', name: 'ops-fmt' }, OPS, 'u-gus')
    const res = await move(ops, 'u-gus')
    expect(res.status).toBe(403)
    expect((await body(res)).error).toBe('Only the project’s members can add to its library')
    const summary = await body<{ viewerCan: { toProject: unknown } }>(
      await call(`/library/summary?${OPS}`, {}, 'u-gus'),
    )
    expect(summary.viewerCan.toProject).toEqual({
      allowed: false,
      reason: 'Only the project’s members can add to its library',
    })
  })

  it('refuses a workspace key, which reaches no further than its workspace', async () => {
    const id = await createItem({ kind: 'module', name: 'fmt' })
    const key = await h.seed.key(
      'k-sales',
      'u-ama',
      { level: 'workspace', projectId: 'p-101', workspaceId: 'ws-sales' },
      { library: ['read', 'write'] },
    )
    const res = await h.app.request(`/api/library/items/${id}/move`, {
      method: 'POST',
      body: JSON.stringify({ to: 'project' }),
      ...key,
    })
    expect(res.status).toBe(403)
    expect((await body(res)).error).toBe('A workspace key can’t add to the project’s library')
  })

  it('refuses a body naming anywhere but the project', async () => {
    const id = await createItem({ kind: 'module', name: 'fmt' })
    const res = await call(`/library/items/${id}/move`, h.json({ to: 'ws-ops' }))
    expect(res.status).toBe(422)
  })
})

describe('copying a library item to the project', () => {
  beforeEach(async () => {
    h = createSqliteApp()
    await seedAcme(h)
  })

  function copy(id: string, data: Record<string, unknown>, user = 'u-ama') {
    return call(`/library/items/${id}/duplicate`, h.json({ to: 'project', ...data }), user)
  }

  it('makes a new project item and leaves the original in the workspace', async () => {
    const id = await createItem({ kind: 'module', name: 'fmt' })
    const res = await copy(id, { name: 'fmt' })
    expect(res.status).toBe(201)
    const created = await body<{ id: string }>(res)
    expect(created).toMatchObject({
      slug: 'fmt',
      owner: { kind: 'project', id: 'p-101', name: 'Project 101' },
      latestVersion: null,
      viewerCan: { edit: { allowed: true } },
    })
    expect(created.id).not.toBe(id)
    const sales = await body<{ own: { id: string }[] }>(await call(`/library/summary?${SALES}`))
    expect(sales.own.map((row) => row.id)).toEqual([id])
    expect(
      (await body<{ viewerCan: { toProject: unknown } }>(await call(`/library/summary?${SALES}`)))
        .viewerCan.toProject,
    ).toEqual({ allowed: true })
  })

  it('names the project when it already has the slug', async () => {
    await createItem({ kind: 'module', name: 'fmt' }, PROJECT)
    const id = await createItem({ kind: 'module', name: 'fmt' })
    const res = await copy(id, { name: 'fmt' })
    expect(res.status).toBe(409)
    expect((await body(res)).error).toBe(
      'A module with the slug "fmt" already exists in the project’s library',
    )
  })

  it('needs a project member', async () => {
    const id = await createItem({ kind: 'module', name: 'ops-fmt' }, OPS, 'u-gus')
    expect((await copy(id, { name: 'ops-fmt' }, 'u-gus')).status).toBe(403)
    // Duplicating beside it stays theirs.
    const beside = await call(
      `/library/items/${id}/duplicate`,
      h.json({ name: 'ops-fmt-2' }),
      'u-gus',
    )
    expect(beside.status).toBe(201)
  })
})
