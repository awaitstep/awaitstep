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

describe('the library modules a workflow’s code imports, for the editor', () => {
  beforeEach(async () => {
    h = createSqliteApp()
    await seedAcme(h)
  })

  interface EditorModules {
    modules: { itemId: string; slug: string; owner: string; version: string }[]
    files: { path: string; source: string; role: string }[]
    diagnostics: { source: string; message: string; path?: string }[]
  }

  const modulesOf = async (workflowId: string, slugs: string, user = 'u-ama') =>
    call(`/workflows/${workflowId}/source/modules?${PROJECT}&slugs=${slugs}`, {}, user)

  async function moduleIn(name: string, scope: string, files: Record<string, string>) {
    const id = await createItem({ kind: 'module', name }, scope)
    const slug = name.toLowerCase().replace(/\s+/g, '-')
    await put(id, 'package.json', JSON.stringify({ name: slug, version: '1.0.0', type: 'module' }))
    for (const [path, source] of Object.entries(files)) await put(id, path, source)
    return id
  }

  it('serves the published files under modules/<slug>/, without its package.json', async () => {
    const id = await publishedModule('Solo', '1.2.0', 'export const a = 1\n')
    const res = await modulesOf('wf-sales', 'solo')
    expect(res.status).toBe(200)
    expect(await json<EditorModules>(res)).toEqual({
      modules: [{ itemId: id, slug: 'solo', owner: 'workspace', version: '1.2.0' }],
      files: [{ path: 'modules/solo/index.ts', source: 'export const a = 1\n', role: 'module' }],
      diagnostics: [],
    })
  })

  it('serves the published version, not the working copy edited since', async () => {
    const id = await publishedModule('Solo', '1.2.0', 'export const a = 1\n')
    await put(id, 'index.ts', 'export const a = 2\n')
    const body = await json<EditorModules>(await modulesOf('wf-sales', 'solo'))
    expect(body.files.map((f) => f.source)).toEqual(['export const a = 1\n'])
  })

  it('brings the modules they import in turn, and the project’s modules', async () => {
    const base = await moduleIn('Base', PROJECT, { 'index.ts': 'export const b = 1\n' })
    await publish(base)
    const top = await moduleIn('Top', SALES, {
      'index.ts': "export { b } from '#modules/base'\n",
    })
    await publish(top)
    const body = await json<EditorModules>(await modulesOf('wf-sales', 'top'))
    expect(body.diagnostics).toEqual([])
    expect(body.modules.map((m) => [m.slug, m.owner])).toEqual([
      ['base', 'project'],
      ['top', 'workspace'],
    ])
    expect(body.files.map((f) => f.path).sort()).toEqual([
      'modules/base/index.ts',
      'modules/top/index.ts',
    ])
  })

  it('judges one slug meaning two modules across every slug named, and ships neither', async () => {
    // The workflow's own `fmt` is the workspace's; the project's `report` imports the project's `fmt`.
    await publish(await moduleIn('Fmt', SALES, { 'index.ts': 'export const f = 1\n' }))
    await publish(await moduleIn('Fmt', PROJECT, { 'index.ts': 'export const f = 2\n' }))
    await publish(
      await moduleIn('Report', PROJECT, { 'index.ts': "export { f } from '#modules/fmt'\n" }),
    )
    const body = await json<EditorModules>(await modulesOf('wf-sales', 'fmt,report'))
    expect(body.diagnostics.map((d) => d.message)).toEqual([
      '"#modules/fmt" means the project’s module for Report, but this workspace’s module for this workflow; rename one of them',
    ])
    expect(body.files.map((f) => f.path)).toEqual(['modules/report/index.ts'])
  })

  it('says so, as a deploy would, for a slug no module answers or another workspace owns', async () => {
    await publish(await moduleIn('Ops only', OPS, { 'index.ts': 'export const o = 1\n' }))
    const body = await json<EditorModules>(await modulesOf('wf-sales', 'nothing-here,ops-only'))
    expect(body.files).toEqual([])
    expect(body.diagnostics.map((d) => d.message)).toEqual([
      'Cannot resolve "#modules/nothing-here": no module of that name in this workspace or the project',
      'Cannot resolve "#modules/ops-only": no module of that name in this workspace or the project',
    ])
  })

  it('says a module was never published, and sends none of its code', async () => {
    await moduleIn('Draft', SALES, { 'index.ts': 'export const secretDraft = 1\n' })
    const body = await json<EditorModules>(await modulesOf('wf-sales', 'draft'))
    expect(body.modules).toEqual([])
    expect(body.files).toEqual([])
    expect(body.diagnostics.map((d) => d.message)).toEqual([
      'Module "draft" has no published version yet; publish it to use it',
    ])
  })

  it('refuses no slugs, too many, and what cannot be a module name', async () => {
    expect((await modulesOf('wf-sales', '')).status).toBe(400)
    const many = Array.from({ length: 101 }, (_, i) => `m${i}`).join(',')
    expect((await modulesOf('wf-sales', many)).status).toBe(400)
    for (const slugs of ['Solo', 'ok,-x', encodeURIComponent('../x')]) {
      const res = await modulesOf('wf-sales', slugs)
      expect(res.status).toBe(400)
      // The refusal names the rule, not the input it was sent.
      expect(await res.text()).not.toContain('..')
    }
  })

  it('is not found for someone who cannot see the workflow; a viewer may read it', async () => {
    await publishedModule('Solo', '1.0.0', 'export const a = 1\n')
    expect((await modulesOf('wf-sales', 'solo', 'u-gus')).status).toBe(404)
    expect((await modulesOf('wf-sales', 'solo', 'u-eve')).status).toBe(200)
  })

  it('needs library:read as well as workflows:read from a key, and stays in the key’s workspace', async () => {
    await publishedModule('Solo', '1.0.0', 'export const a = 1\n')
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
    const url = (wf: string) => `/api/workflows/${wf}/source/modules?slugs=solo`
    expect((await h.app.request(url('wf-sales'), bare)).status).toBe(403)
    expect((await h.app.request(url('wf-sales'), both)).status).toBe(200)
    expect((await h.app.request(url('wf-sales'), ops)).status).toBe(404)
  })

  it('gives a workspace key its workspace’s modules only, never the project’s code', async () => {
    await publish(await moduleIn('Crm', PROJECT, { 'index.ts': 'export const projectOnly = 1\n' }))
    await publish(
      await moduleIn('Top', SALES, { 'index.ts': "export { projectOnly } from '#modules/crm'\n" }),
    )
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
    const read = async (auth: RequestInit) =>
      json<EditorModules>(
        await h.app.request('/api/workflows/wf-sales/source/modules?slugs=crm,top', auth),
      )
    const narrow = await read(sales)
    expect(narrow.files.map((f) => f.path)).toEqual(['modules/top/index.ts'])
    expect(JSON.stringify(narrow)).not.toContain('projectOnly = 1')
    expect(narrow.diagnostics.map((d) => d.message)).toEqual([
      'Cannot resolve "#modules/crm": no module of that name in this workspace or the project',
      'top 1.0.0 imports "#modules/crm", which no module it can reach provides',
    ])
    const wide = await read(project)
    expect(wide.files.map((f) => f.path).sort()).toEqual([
      'modules/crm/index.ts',
      'modules/top/index.ts',
    ])
  })
})
