import { beforeEach, describe, expect, it } from 'vitest'
import { createSqliteApp, seedAcme, type SqliteApp } from './sqlite-app.js'

// What a workflow reads of the Library outside a deploy: the custom nodes
// its palette offers, their templates, the modules its source labels, the
// project conventions, and the Overview's "redeploy to pick it up" lines.
// Ama owns Acme; Eve views Sales; Gus edits Ops only.

const SALES = 'projectId=p-101&workspaceId=ws-sales'
const OPS = 'projectId=p-101&workspaceId=ws-ops'
const PROJECT = 'projectId=p-101'

let h: SqliteApp

async function call(path: string, init: RequestInit = {}, user = 'u-ama') {
  return h.app.request(`/api${path}`, h.as(user, init))
}

async function createItem(body: Record<string, unknown>, scope = SALES): Promise<string> {
  const res = await call(`/library/items?${scope}`, h.json(body))
  expect(res.status).toBe(201)
  return ((await res.json()) as { id: string }).id
}

async function put(id: string, path: string, source: string) {
  const res = await call(`/library/items/${id}/files/${path}`, h.json({ source }, 'PUT'))
  expect([200, 201]).toContain(res.status)
}

async function publish(id: string) {
  const res = await call(`/library/items/${id}/versions`, { method: 'POST' })
  expect(res.status).toBe(201)
}

async function publishedNode(name: string, scope = SALES, icon?: string) {
  const id = await createItem({ kind: 'node', name }, scope)
  if (icon) await put(id, 'icon.svg', icon)
  await publish(id)
  return id
}

async function publishedModule(name: string, version: string, source: string) {
  const id = await createItem({ kind: 'module', name })
  const slug = name.toLowerCase().replace(/\s+/g, '-')
  await put(id, 'package.json', JSON.stringify({ name: slug, version, type: 'module' }))
  await put(id, 'index.ts', source)
  await publish(id)
  return id
}

function stepIr(code: string) {
  return {
    metadata: {
      name: 'test',
      version: 1,
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
    },
    nodes: [
      {
        id: 'step-1',
        type: 'step',
        name: 'Score',
        position: { x: 0, y: 0 },
        version: '1.0.0',
        provider: 'cloudflare',
        data: { code },
      },
    ],
    edges: [],
    entryNodeId: 'step-1',
  }
}

async function json<T>(res: Response): Promise<T> {
  return (await res.json()) as T
}

interface PaletteEntry {
  itemId: string
  owner: string
  version: string
  definition: { id: string; name: string; icon?: string }
}

describe('custom nodes for a workflow', () => {
  beforeEach(async () => {
    h = createSqliteApp()
    await seedAcme(h)
  })

  it('lists the workspace’s and the project’s published nodes as registry definitions', async () => {
    const digest = await publishedNode(
      'Sales digest',
      SALES,
      '<svg xmlns="http://www.w3.org/2000/svg"/>',
    )
    const crm = await publishedNode('Acme CRM', PROJECT)
    const res = await call(`/workflows/wf-sales/custom-nodes?${PROJECT}`)
    expect(res.status).toBe(200)
    const body = await json<PaletteEntry[]>(res)
    expect(body.map((e) => [e.definition.name, e.owner, e.version])).toEqual([
      ['Acme CRM', 'project', '1.0.0'],
      ['Sales digest', 'workspace', '1.0.0'],
    ])
    const byId = new Map(body.map((e) => [e.itemId, e]))
    expect(byId.get(digest)!.definition.id).toBe(`custom:${digest}`)
    expect(byId.get(digest)!.definition.icon).toBe(
      `data:image/svg+xml;base64,${btoa('<svg xmlns="http://www.w3.org/2000/svg"/>')}`,
    )
    expect(byId.get(crm)!.definition.icon).toBeUndefined()
    // Only what the palette renders: no files, slugs or publishers.
    expect(Object.keys(body[0]!).sort()).toEqual(['definition', 'itemId', 'owner', 'version'])
  })

  it('offers nothing unpublished, and nothing of another workspace', async () => {
    await createItem({ kind: 'node', name: 'Draft node' })
    const ops = await publishedNode('Ops node', OPS)
    const sales = await call(`/workflows/wf-sales/custom-nodes?${PROJECT}`)
    expect(await json(sales)).toEqual([])
    const fromOps = await json<PaletteEntry[]>(
      await call(`/workflows/wf-ops/custom-nodes?${PROJECT}`),
    )
    expect(fromOps.map((e) => e.itemId)).toEqual([ops])
  })

  it('serves the templates of the types asked for, and a viewer may read both', async () => {
    const digest = await publishedNode('Sales digest')
    const other = await publishedNode('Other node')
    const res = await call(
      `/workflows/wf-sales/custom-nodes/templates?${PROJECT}&types=${encodeURIComponent(`custom:${digest},step,custom:nope`)}`,
      {},
      'u-eve',
    )
    expect(res.status).toBe(200)
    const body = await json<Record<string, { cloudflare: string }>>(res)
    expect(Object.keys(body)).toEqual([`custom:${digest}`])
    expect(body[`custom:${digest}`]!.cloudflare).toContain('export default')
    expect(Object.keys(body)).not.toContain(`custom:${other}`)
    // Nothing named, nothing sent.
    const none = await call(`/workflows/wf-sales/custom-nodes/templates?${PROJECT}`)
    expect(await json(none)).toEqual({})
    expect((await call(`/workflows/wf-sales/custom-nodes?${PROJECT}`, {}, 'u-eve')).status).toBe(
      200,
    )
  })

  it('refuses more types than one read takes', async () => {
    const types = Array.from({ length: 101 }, (_, i) => `custom:n${i}`).join(',')
    const res = await call(`/workflows/wf-sales/custom-nodes/templates?${PROJECT}&types=${types}`)
    expect(res.status).toBe(400)
  })

  it('needs library:read as well as workflows:read from a key, and stays in the key’s workspace', async () => {
    const digest = await publishedNode('Sales digest')
    const place = { level: 'workspace' as const, projectId: 'p-101', workspaceId: 'ws-sales' }
    const bare = await h.seed.key('k-bare', 'u-ama', place, { workflows: ['read'] })
    const both = await h.seed.key('k-both', 'u-ama', place, {
      workflows: ['read'],
      library: ['read'],
    })
    const ops = await h.seed.key(
      'k-ops',
      'u-ama',
      { level: 'workspace', projectId: 'p-101', workspaceId: 'ws-ops' },
      { workflows: ['read'], library: ['read'] },
    )
    const types = `types=custom:${digest}`
    for (const path of ['custom-nodes', `custom-nodes/templates?${types}`]) {
      const url = (wf: string) => `/api/workflows/${wf}/${path}`
      expect((await h.app.request(url('wf-sales'), bare)).status).toBe(403)
      expect((await h.app.request(url('wf-sales'), both)).status).toBe(200)
      expect((await h.app.request(url('wf-sales'), ops)).status).toBe(404)
    }
  })

  it('gives a workspace key its workspace’s nodes only, never the project’s', async () => {
    const digest = await publishedNode('Sales digest')
    const crm = await publishedNode('Acme CRM', PROJECT)
    const sales = await h.seed.key(
      'k-sales',
      'u-ama',
      { level: 'workspace', projectId: 'p-101', workspaceId: 'ws-sales' },
      { workflows: ['read'], library: ['read'] },
    )
    const project = await h.seed.key(
      'k-project',
      'u-ama',
      { level: 'project', projectId: 'p-101' },
      { workflows: ['read'], library: ['read'] },
    )
    const listed = async (auth: RequestInit) =>
      (
        await json<PaletteEntry[]>(
          await h.app.request('/api/workflows/wf-sales/custom-nodes', auth),
        )
      )
        .map((e) => e.itemId)
        .sort()
    expect(await listed(sales)).toEqual([digest])
    expect(await listed(project)).toEqual([crm, digest].sort())
    const templates = await h.app.request(
      `/api/workflows/wf-sales/custom-nodes/templates?types=custom:${crm},custom:${digest}`,
      sales,
    )
    expect(Object.keys(await json(templates))).toEqual([`custom:${digest}`])
  })

  it('leaves out a version whose node.json no longer parses', async () => {
    const digest = await publishedNode('Sales digest')
    await h.db.update(h.schema.libraryVersions).set({
      files: JSON.stringify([
        { path: 'node.json', source: '{ broken' },
        { path: 'template.ts', source: 'export default async () => 1' },
      ]),
    })
    const body = await json<PaletteEntry[]>(
      await call(`/workflows/wf-sales/custom-nodes?${PROJECT}`),
    )
    expect(body.map((e) => e.itemId)).not.toContain(digest)
  })

  it('is not found for someone who cannot see the workflow', async () => {
    await publishedNode('Sales digest')
    expect((await call(`/workflows/wf-sales/custom-nodes?${PROJECT}`, {}, 'u-gus')).status).toBe(
      404,
    )
    expect(
      (
        await call(
          `/workflows/wf-sales/custom-nodes/templates?${PROJECT}&types=custom:x`,
          {},
          'u-gus',
        )
      ).status,
    ).toBe(404)
  })
})

describe('library modules in the workflow source', () => {
  beforeEach(async () => {
    h = createSqliteApp()
    await seedAcme(h)
  })

  it('labels the modules the bundle carries, at the version it carries', async () => {
    const id = await publishedModule('Lead scoring', '1.4.2', 'export const score = () => 2\n')
    const save = await call(
      `/workflows/wf-sales/versions?${PROJECT}`,
      h.json({ ir: stepIr(`import { score } from '#modules/lead-scoring'\nreturn score()`) }),
    )
    expect([200, 201]).toContain(save.status)
    const body = await json<{ library: unknown[] }>(
      await call(`/workflows/wf-sales/source?${PROJECT}`),
    )
    expect(body.library).toEqual([
      {
        itemId: id,
        slug: 'lead-scoring',
        owner: 'workspace',
        version: '1.4.2',
      },
    ])
  })

  it('carries an empty list for a workflow that uses no library code', async () => {
    const save = await call(
      `/workflows/wf-sales/versions?${PROJECT}`,
      h.json({ ir: stepIr('return 1') }),
    )
    expect([200, 201]).toContain(save.status)
    const body = await json<{ library: unknown[] }>(
      await call(`/workflows/wf-sales/source?${PROJECT}`),
    )
    expect(body.library).toEqual([])
  })

  it('names the library conventions in the project response', async () => {
    const body = await json<{ library: unknown }>(
      await call(`/workflows/wf-sales/project?${PROJECT}`),
    )
    expect(body.library).toEqual({ importPrefix: '#modules/', bundleDir: 'modules/' })
  })
})

describe('library updates on the workflow summary', () => {
  beforeEach(async () => {
    h = createSqliteApp()
    await seedAcme(h)
  })

  it('says which account runs an older version than the latest published', async () => {
    const id = await publishedModule('Lead scoring', '1.4.1', 'export const score = () => 1\n')
    const saved = await call(
      `/workflows/wf-sales/versions?${PROJECT}`,
      h.json({ ir: stepIr('return 1') }),
    )
    expect([200, 201]).toContain(saved.status)
    await h.db.insert(h.schema.connections).values({
      id: 'c-prod',
      organizationId: 'org-acme',
      provider: 'cloudflare',
      name: 'Acme production',
      credentials: '{}',
      createdBy: 'u-ama',
      createdAt: '2026-10-20T00:00:00.000Z',
      updatedAt: '2026-10-20T00:00:00.000Z',
    })
    await h.adapter.createDeployment({
      id: 'd-prod',
      workflowId: 'wf-sales',
      versionId: (await h.adapter.getWorkflowById('wf-sales'))!.currentVersionId!,
      versionNumber: 1,
      connectionId: 'c-prod',
      serviceName: 'svc',
      status: 'success',
      libraryVersions: [{ itemId: id, slug: 'lead-scoring', version: '1.4.1' }],
    })
    const summary = async (user = 'u-ama') =>
      json<{ libraryUpdates: unknown[] }>(
        await call(`/workflows/wf-sales/summary?${PROJECT}`, {}, user),
      )
    expect((await summary()).libraryUpdates).toEqual([])

    await put(
      id,
      'package.json',
      JSON.stringify({ name: 'lead-scoring', version: '1.4.2', type: 'module' }),
    )
    await publish(id)
    const expected = [
      {
        itemId: id,
        name: 'lead-scoring',
        kind: 'module',
        latest: '1.4.2',
        runs: '1.4.1',
        accountId: 'c-prod',
        accountName: 'Acme production',
      },
    ]
    expect((await summary()).libraryUpdates).toEqual(expected)
    expect((await summary('u-eve')).libraryUpdates).toEqual(expected)
  })
})

describe('a node’s icon on the Scripts & nodes page', () => {
  beforeEach(async () => {
    h = createSqliteApp()
    await seedAcme(h)
  })

  const SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1"/>'

  it('names the icon’s hash in the summary and serves it as an image that runs nothing', async () => {
    const id = await createItem({ kind: 'node', name: 'Sales digest' })
    await put(id, 'icon.svg', SVG)
    const summary = await json<{ own: { id: string; iconHash: string | null }[] }>(
      await call(`/library/summary?${SALES}`),
    )
    const hash = summary.own.find((r) => r.id === id)!.iconHash
    expect(hash).toEqual(expect.any(String))

    const res = await call(`/library/items/${id}/icon?v=${hash}`)
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('image/svg+xml')
    expect(res.headers.get('content-security-policy')).toContain('sandbox')
    expect(res.headers.get('x-content-type-options')).toBe('nosniff')
    expect(await res.text()).toBe(SVG)

    const again = await call(`/library/items/${id}/icon`, {
      headers: { 'If-None-Match': res.headers.get('etag')! },
    })
    expect(again.status).toBe(304)
  })

  it('has no icon for a node without one, nor for a module, nor for someone outside the workspace', async () => {
    const plain = await createItem({ kind: 'node', name: 'Plain node' })
    const mod = await publishedModule('Lead scoring', '1.0.0', 'export const s = 1\n')
    const summary = await json<{ own: { id: string; iconHash: string | null }[] }>(
      await call(`/library/summary?${SALES}`),
    )
    expect(summary.own.find((r) => r.id === plain)!.iconHash).toBeNull()
    expect((await call(`/library/items/${plain}/icon`)).status).toBe(404)
    expect((await call(`/library/items/${mod}/icon`)).status).toBe(404)
    const withIcon = await createItem({ kind: 'node', name: 'Iconned' })
    await put(withIcon, 'icon.svg', SVG)
    expect((await call(`/library/items/${withIcon}/icon`, {}, 'u-gus')).status).toBe(404)
  })
})
