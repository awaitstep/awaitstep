import { beforeEach, describe, expect, it } from 'vitest'
import { createSqliteApp, seedAcme, type SqliteApp } from './sqlite-app.js'

// The Library's routes on a real database, over the Acme seed: Ama owns the
// org, Eve is a Viewer in Sales only, Gus an Editor in Ops only, Dan a
// project member, Cleo is in Globex.

const SALES = 'projectId=p-101&workspaceId=ws-sales'

let h: SqliteApp

async function call(user: string, path: string, init: RequestInit = {}) {
  return h.app.request(`/api${path}`, h.as(user, init))
}

async function create(user: string, body: Record<string, unknown>, scope = SALES) {
  const res = await call(user, `/library/items?${scope}`, h.json(body))
  return { res, body: (await res.json()) as Record<string, unknown> }
}

async function put(user: string, id: string, path: string, source: string) {
  return call(user, `/library/items/${id}/files/${path}`, h.json({ source }, 'PUT'))
}

async function publish(user: string, id: string) {
  const res = await call(user, `/library/items/${id}/versions`, { method: 'POST' })
  return { res, body: (await res.json()) as Record<string, unknown> }
}

async function paths(id: string) {
  const res = await call('u-ama', `/library/items/${id}/project`)
  const body = (await res.json()) as { files: { path: string; readOnly: boolean }[] }
  return body.files.map((f) => `${f.path}${f.readOnly ? ' (read-only)' : ''}`)
}

function manifest(version: string, extra: Record<string, unknown> = {}) {
  return JSON.stringify({ name: 'lead-scoring', version, type: 'module', ...extra })
}

describe('library routes', () => {
  beforeEach(async () => {
    h = createSqliteApp()
    await seedAcme(h)
  })

  it('scaffolds a module and shows it as a draft on the Library page', async () => {
    const { res, body } = await create('u-ama', { kind: 'module', name: 'Lead scoring' })
    expect(res.status).toBe(201)
    expect(body).toMatchObject({
      kind: 'module',
      slug: 'lead-scoring',
      importPath: '#modules/lead-scoring',
      nodeType: null,
      owner: { kind: 'workspace', id: 'ws-sales', name: 'Sales' },
      latestVersion: null,
      viewerCan: { edit: { allowed: true } },
    })
    expect(await paths(body.id as string)).toEqual(['index.ts', 'package.json'])

    const summary = await (await call('u-ama', `/library/summary?${SALES}`)).json()
    expect(summary.own).toMatchObject([{ slug: 'lead-scoring', latestVersion: null, usedBy: 0 }])
    expect(summary.counts).toEqual({ module: 1, node: 0, marketplace: 0 })
    expect(summary.viewerCan.create).toEqual({ allowed: true })
    const eve = await (await call('u-eve', `/library/summary?${SALES}`)).json()
    expect(eve.viewerCan.create).toEqual({
      allowed: false,
      reason: 'Changing library items needs an Editor',
    })
    const refused = await create('u-eve', { kind: 'module', name: 'X' })
    expect(refused.res.status).toBe(403)
    expect(refused.body.error).toBe('Changing library items needs an Editor')

    expect((await create('u-ama', { kind: 'module', name: 'Lead scoring' })).res.status).toBe(409)
  })

  it('publishes a module at its version, the next patch when it repeats, and refuses a lower one', async () => {
    const { body } = await create('u-ama', { kind: 'module', name: 'Lead scoring' })
    const id = body.id as string
    expect((await publish('u-ama', id)).body).toMatchObject({ version: '1.0.0', bumpedFrom: null })

    const again = await publish('u-ama', id)
    expect(again.res.status).toBe(201)
    expect(again.body).toMatchObject({ version: '1.0.1', bumpedFrom: '1.0.0' })
    const file = await (await call('u-ama', `/library/items/${id}/files/package.json`)).json()
    expect(JSON.parse(file.source).version).toBe('1.0.1')

    expect((await put('u-ama', id, 'package.json', manifest('0.9.0'))).status).toBe(200)
    const lower = await publish('u-ama', id)
    expect(lower.res.status).toBe(400)
    expect(lower.body.error).toMatch(/lower than the latest published version 1\.0\.1/)
  })

  it('keeps the three newest versions after a fourth publish', async () => {
    const { body } = await create('u-ama', { kind: 'module', name: 'Fmt' })
    const id = body.id as string
    for (let i = 0; i < 4; i++) expect((await publish('u-ama', id)).res.status).toBe(201)
    const { versions } = await (await call('u-ama', `/library/items/${id}/versions`)).json()
    expect(versions.map((v: { version: string }) => v.version)).toEqual(['1.0.3', '1.0.2', '1.0.1'])
    expect(versions[0].publishedBy).toEqual({ id: 'u-ama', name: 'Ama Mensah' })
    const old = await call('u-ama', `/library/items/${id}/versions/1.0.0`)
    expect(old.status).toBe(404)
  })

  it('makes a published node folder read-only and starts the next one from it', async () => {
    const { body } = await create('u-ama', { kind: 'node', name: 'Post to Slack' })
    const id = body.id as string
    expect(body.nodeType).toBe(`custom:${id}`)
    expect(await paths(id)).toEqual(['1.0.0/node.json', '1.0.0/template.ts'])

    expect((await publish('u-ama', id)).body).toMatchObject({ version: '1.0.0' })
    expect(await paths(id)).toEqual([
      '1.0.0/node.json (read-only)',
      '1.0.0/template.ts (read-only)',
    ])
    const write = await put('u-ama', id, '1.0.0/template.ts', 'export default async () => 1')
    expect(write.status).toBe(409)
    expect((await write.json()).error).toMatch(/published/)
    const read = await (await call('u-ama', `/library/items/${id}/files/1.0.0/template.ts`)).json()
    expect(read).toMatchObject({ readOnly: true, path: '1.0.0/template.ts' })

    const restore = await call('u-ama', `/library/items/${id}/versions/1.0.0/restore`, {
      method: 'POST',
    })
    expect(await restore.json()).toEqual({ restoredFrom: '1.0.0', version: '1.0.1' })
    expect(await paths(id)).toContain('1.0.1/node.json')
    const nodeJson = await (
      await call('u-ama', `/library/items/${id}/files/1.0.1/node.json`)
    ).json()
    expect(JSON.parse(nodeJson.source).version).toBe('1.0.1')
    expect((await put('u-ama', id, '1.0.2/template.ts', 'x')).status).toBe(422)
    expect((await publish('u-ama', id)).body).toMatchObject({ version: '1.0.1' })
  })

  it('refuses a node.json that misnames its folder or breaks the schema, with each problem', async () => {
    const { body } = await create('u-ama', { kind: 'node', name: 'Post' })
    const id = body.id as string
    const file = await (await call('u-ama', `/library/items/${id}/files/1.0.0/node.json`)).json()
    const broken = { ...JSON.parse(file.source), version: '2.0.0', runtime: 'workers' }
    expect((await put('u-ama', id, '1.0.0/node.json', JSON.stringify(broken))).status).toBe(200)

    const check = await (
      await call('u-ama', `/library/items/${id}/check`, { method: 'POST' })
    ).json()
    expect(check.version).toBe('1.0.0')
    expect(check.problems.length).toBeGreaterThan(0)
    expect(check.problems[0].path).toMatch(/^1\.0\.0\/node\.json/)

    const refused = await publish('u-ama', id)
    expect(refused.res.status).toBe(422)
    expect(refused.body.details).toEqual(check.problems)

    const fixed = { ...JSON.parse(file.source), version: '2.0.0' }
    await put('u-ama', id, '1.0.0/node.json', JSON.stringify(fixed))
    const mismatch = await publish('u-ama', id)
    expect(mismatch.body.details).toEqual([
      {
        path: '1.0.0/node.json.version',
        message: 'version "2.0.0" must match its folder 1.0.0',
      },
    ])
  })

  it('records what a node imports and refuses to delete the module it uses, naming it', async () => {
    const mod = (await create('u-ama', { kind: 'module', name: 'Lead scoring' })).body
    const node = (await create('u-ama', { kind: 'node', name: 'Score lead' })).body
    const template =
      "import { score } from '#modules/lead-scoring'\nexport default async () => score()\n"
    expect((await put('u-ama', node.id as string, '1.0.0/template.ts', template)).status).toBe(200)

    const unpublished = await (
      await call('u-ama', `/library/items/${node.id}/check`, { method: 'POST' })
    ).json()
    expect(unpublished.problems).toEqual([
      {
        path: '#modules/lead-scoring',
        message: 'Module "lead-scoring" has no published version yet',
      },
    ])

    const usages = await (await call('u-ama', `/library/items/${mod.id}/usages`)).json()
    expect(usages.usedBy).toEqual({
      visible: [
        {
          kind: 'item',
          id: node.id,
          itemKind: 'node',
          name: 'Score lead',
          slug: 'score-lead',
          owner: { kind: 'workspace', id: 'ws-sales', name: 'Sales' },
        },
      ],
      hiddenCount: 0,
    })
    const uses = await (await call('u-ama', `/library/items/${node.id}/usages`)).json()
    expect(uses.uses).toMatchObject([{ id: mod.id, slug: 'lead-scoring' }])

    const del = await call('u-ama', `/library/items/${mod.id}`, { method: 'DELETE' })
    expect(del.status).toBe(409)
    expect((await del.json()).error).toBe('Can’t delete: used by Score lead')
    const rename = await call(
      'u-ama',
      `/library/items/${mod.id}`,
      h.json({ slug: 'scoring' }, 'PATCH'),
    )
    expect(rename.status).toBe(409)

    await publish('u-ama', mod.id as string)
    expect((await publish('u-ama', node.id as string)).res.status).toBe(201)
    // Publishing moved the import into the version: the module is still used.
    expect((await call('u-ama', `/library/items/${mod.id}`, { method: 'DELETE' })).status).toBe(409)
  })

  it('lets a Viewer read but not write, and never shows a workspace’s item to another workspace', async () => {
    const { body } = await create('u-ama', { kind: 'module', name: 'Fmt' })
    const id = body.id as string
    expect((await call('u-eve', `/library/items/${id}`)).status).toBe(200)
    const viewer = await put('u-eve', id, 'index.ts', 'export {}')
    expect(viewer.status).toBe(403)
    expect((await viewer.json()).error).toBe('Changing library items needs an Editor')
    // Only the check route itself is a read: a write whose path merely ends in /check is gated.
    const lookalike = await call('u-eve', `/library/items/${id}/files/lib/check`, {
      method: 'DELETE',
    })
    expect(lookalike.status).toBe(403)
    const check = await call('u-eve', `/library/items/${id}/check`, { method: 'POST' })
    expect(check.status).toBe(200)

    expect((await call('u-gus', `/library/items/${id}`)).status).toBe(404)
    expect((await call('u-cleo', `/library/items/${id}`)).status).toBe(404)
    // There is no sharing to turn on: the field is refused, even beside a real change.
    const share = await call(
      'u-ama',
      `/library/items/${id}`,
      h.json({ shared: true, name: 'Renamed' }, 'PATCH'),
    )
    expect(share.status).toBe(422)
    expect((await (await call('u-ama', `/library/items/${id}`)).json()).name).toBe('Fmt')
    expect((await call('u-gus', `/library/items/${id}`)).status).toBe(404)
    const ops = await (
      await call('u-gus', `/library/summary?projectId=p-101&workspaceId=ws-ops`)
    ).json()
    expect(ops.own).toEqual([])
    expect(ops.fromProject).toEqual([])
  })

  it('lets every workspace use the project’s own library, and only project members change it', async () => {
    const { res, body } = await create('u-dan', { kind: 'module', name: 'Fmt' }, 'projectId=p-101')
    expect(res.status).toBe(201)
    expect(body.owner).toEqual({ kind: 'project', id: 'p-101', name: 'Project 101' })
    const id = body.id as string
    const gus = await (await call('u-gus', `/library/items/${id}`)).json()
    expect(gus.viewerCan.edit).toEqual({
      allowed: false,
      reason: 'From the project’s library. Only project members change it',
    })
    const project = await (await call('u-gus', `/library/summary?projectId=p-101`)).json()
    expect(project.own).toMatchObject([{ id }])
    expect(project.viewerCan.create).toEqual({
      allowed: false,
      reason: 'Only the project’s members can add to its library',
    })
    expect((await put('u-gus', id, 'index.ts', 'export {}')).status).toBe(403)
    const ops = await (
      await call('u-gus', `/library/summary?projectId=p-101&workspaceId=ws-ops`)
    ).json()
    expect(ops.fromProject).toMatchObject([{ id, owner: { kind: 'project' } }])
    expect((await call('u-cleo', `/library/items/${id}`)).status).toBe(404)
    const refused = await create('u-gus', { kind: 'module', name: 'X' }, 'projectId=p-101')
    expect(refused.res.status).toBe(403)
  })

  it('reaches items through a key with the library cells, and refuses one without', async () => {
    const { body } = await create('u-ama', { kind: 'module', name: 'Fmt' })
    const full = await h.seed.key(
      'k-lib',
      'u-ama',
      { level: 'workspace', projectId: 'p-101', workspaceId: 'ws-sales' },
      { library: ['read', 'write', 'delete'] },
    )
    const bare = await h.seed.key(
      'k-bare',
      'u-ama',
      { level: 'workspace', projectId: 'p-101', workspaceId: 'ws-sales' },
      { workflows: ['read'] },
    )
    const other = await h.seed.key(
      'k-ops',
      'u-ama',
      { level: 'workspace', projectId: 'p-101', workspaceId: 'ws-ops' },
      { library: ['read'] },
    )
    const first = await h.app.request(`/api/library/items/${body.id}`, full)
    expect(first.status, await first.clone().text()).toBe(200)
    const write = await h.app.request(`/api/library/items/${body.id}/files/index.ts`, {
      ...full,
      method: 'PUT',
      body: JSON.stringify({ source: 'export const a = 1' }),
    })
    expect(write.status).toBe(200)
    const refused = await h.app.request(`/api/library/items/${body.id}`, bare)
    expect(refused.status).toBe(403)
    expect((await refused.json()).error).toBe('API key lacks permission: library:read')
    expect((await h.app.request(`/api/library/items/${body.id}`, other)).status).toBe(404)
  })

  it('keeps file writes to the item’s path rules and the If-Match contract', async () => {
    const { body } = await create('u-ama', { kind: 'module', name: 'Fmt' })
    const id = body.id as string
    expect((await put('u-ama', id, 'lib/package.json', '{}')).status).toBe(422)
    expect((await put('u-ama', id, 'package.json', '{"type":"commonjs"}')).status).toBe(422)
    const created = await put('u-ama', id, 'lib/a.ts', 'export const a = 1')
    expect(created.status).toBe(201)
    const tag = created.headers.get('ETag')!
    const stale = await call('u-ama', `/library/items/${id}/files/lib/a.ts`, {
      ...h.json({ source: 'x' }, 'PUT'),
      headers: { 'If-Match': '"nope"' },
    })
    expect(stale.status).toBe(409)
    const ok = await call('u-ama', `/library/items/${id}/files/lib/a.ts`, {
      ...h.json({ source: 'y' }, 'PUT'),
      headers: { 'If-Match': tag },
    })
    expect(ok.status).toBe(200)
    expect(
      (await call('u-ama', `/library/items/${id}/files/lib/a.ts`, { method: 'DELETE' })).status,
    ).toBe(204)
    expect((await call('u-ama', `/library/items/${id}`, { method: 'DELETE' })).status).toBe(204)
    expect((await call('u-ama', `/library/items/${id}`)).status).toBe(404)
  })

  it('resolves a workspace’s imports from its own library, then the project’s, never another workspace’s', async () => {
    const ops = 'projectId=p-101&workspaceId=ws-ops'
    await create('u-ama', { kind: 'module', name: 'Fmt' }, ops)
    const node = (await create('u-ama', { kind: 'node', name: 'Sales node' })).body
    const template = "import { hello } from '#modules/fmt'\nexport default async () => hello('x')\n"
    await put('u-ama', node.id as string, '1.0.0/template.ts', template)
    const before = await (
      await call('u-ama', `/library/items/${node.id}/check`, { method: 'POST' })
    ).json()
    expect(before.problems).toContainEqual({
      path: '#modules/fmt',
      message: 'No module "fmt" here or in the project’s library',
    })
    const project = (await create('u-dan', { kind: 'module', name: 'Fmt' }, 'projectId=p-101')).body
    await publish('u-dan', project.id as string)
    const after = await (
      await call('u-ama', `/library/items/${node.id}/check`, { method: 'POST' })
    ).json()
    expect(after.problems).toEqual([])
    const usages = await (await call('u-ama', `/library/items/${project.id}/usages`)).json()
    expect(usages.usedBy.visible.map((c: { id: string }) => c.id)).toEqual([node.id])
  })

  it('counts a consumer saved before its module existed', async () => {
    const node = (await create('u-ama', { kind: 'node', name: 'Early' })).body
    await put(
      'u-ama',
      node.id as string,
      '1.0.0/template.ts',
      "import { hello } from '#modules/fmt'\nexport default async () => hello('x')\n",
    )
    const mod = (await create('u-ama', { kind: 'module', name: 'Fmt' })).body
    const del = await call('u-ama', `/library/items/${mod.id}`, { method: 'DELETE' })
    expect(del.status).toBe(409)
    expect((await del.json()).error).toBe('Can’t delete: used by Early')
  })

  it('never lets a module import itself, so the project’s namesake stays free', async () => {
    const other = (await create('u-dan', { kind: 'module', name: 'Fmt' }, 'projectId=p-101')).body
    const mod = (await create('u-ama', { kind: 'module', name: 'Fmt' })).body
    await put(
      'u-ama',
      mod.id as string,
      'index.ts',
      "// import { hello } from '#modules/fmt'\nexport function hello() {}\n",
    )
    const check = await (
      await call('u-ama', `/library/items/${mod.id}/check`, { method: 'POST' })
    ).json()
    expect(check.problems).toEqual([])
    expect((await publish('u-ama', mod.id as string)).res.status).toBe(201)
    const usages = await (await call('u-ama', `/library/items/${other.id}/usages`)).json()
    expect(usages.usedBy).toEqual({ visible: [], hiddenCount: 0 })
    expect((await call('u-dan', `/library/items/${other.id}`, { method: 'DELETE' })).status).toBe(
      204,
    )
  })

  it('restores a module into the whole working copy at the next patch', async () => {
    const { body } = await create('u-ama', { kind: 'module', name: 'Fmt' })
    const id = body.id as string
    await publish('u-ama', id)
    await put('u-ama', id, 'lib/extra.ts', 'export const x = 1')
    await publish('u-ama', id)
    const restore = await call('u-ama', `/library/items/${id}/versions/1.0.0/restore`, {
      method: 'POST',
    })
    expect(await restore.json()).toEqual({ restoredFrom: '1.0.0', version: '1.0.2' })
    expect(await paths(id)).toEqual(['index.ts', 'package.json'])
    const manifest = await (await call('u-ama', `/library/items/${id}/files/package.json`)).json()
    expect(JSON.parse(manifest.source).version).toBe('1.0.2')
  })

  it('reports the pruned version and refuses deleting a published node file', async () => {
    const mod = (await create('u-ama', { kind: 'module', name: 'Fmt' })).body
    for (let i = 0; i < 3; i++) await publish('u-ama', mod.id as string)
    expect((await publish('u-ama', mod.id as string)).body).toMatchObject({
      version: '1.0.3',
      pruned: ['1.0.0'],
    })
    const node = (await create('u-ama', { kind: 'node', name: 'Post' })).body
    await publish('u-ama', node.id as string)
    const del = await call('u-ama', `/library/items/${node.id}/files/1.0.0/template.ts`, {
      method: 'DELETE',
    })
    expect(del.status).toBe(409)
  })

  it('keeps a workspace key to its own workspace’s items; the project’s reach it in the summary', async () => {
    const { body } = await create('u-dan', { kind: 'module', name: 'Fmt' }, 'projectId=p-101')
    const salesKey = await h.seed.key(
      'k-sales',
      'u-ama',
      { level: 'workspace', projectId: 'p-101', workspaceId: 'ws-sales' },
      { library: ['read'] },
    )
    expect((await h.app.request(`/api/library/items/${body.id}`, salesKey)).status).toBe(404)
    const summary = await (await h.app.request('/api/library/summary', salesKey)).json()
    expect(summary.fromProject.map((r: { id: string }) => r.id)).toEqual([body.id])
  })

  it('makes a slug from a long name without a trailing hyphen', async () => {
    const name = `${'a'.repeat(63)} tail`
    const { res, body } = await create('u-ama', { kind: 'module', name })
    expect(res.status).toBe(201)
    expect(body.slug).toBe('a'.repeat(63))
  })
})
