import { beforeEach, describe, expect, it } from 'vitest'
import { isPrepareError, prepareWorkflow } from '../lib/workflow-prepare.js'
import { createSqliteApp, seedAcme, type SqliteApp } from './sqlite-app.js'

// A Sales workflow that uses the Library, on a real database: what its
// bundle carries, what check and deploy say about it, and what a save
// records. Ama owns Acme; Sales and Ops are workspaces of Project 101.

const SALES = 'projectId=p-101&workspaceId=ws-sales'
const PROJECT = 'projectId=p-101'

let h: SqliteApp

async function call(path: string, init: RequestInit = {}) {
  return h.app.request(`/api${path}`, h.as('u-ama', init))
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
  return { status: res.status, body: (await res.json()) as Record<string, unknown> }
}

function manifest(slug: string, version: string, dependencies: Record<string, string> = {}) {
  return JSON.stringify({ name: slug, version, type: 'module', dependencies })
}

async function module(
  name: string,
  version: string,
  source: string,
  options: { scope?: string; dependencies?: Record<string, string> } = {},
) {
  const id = await createItem({ kind: 'module', name }, options.scope)
  const slug = name.toLowerCase().replace(/\s+/g, '-')
  await put(id, 'package.json', manifest(slug, version, options.dependencies))
  await put(id, 'index.ts', source)
  expect((await publish(id)).status).toBe(201)
  return id
}

function stepIr(code: string, extraNodes: Record<string, unknown>[] = []) {
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
      ...extraNodes,
    ],
    edges: extraNodes.map((node) => ({
      id: `e-${String(node.id)}`,
      source: 'step-1',
      target: node.id,
    })),
    entryNodeId: 'step-1',
  }
}

function customNode(itemId: string) {
  return {
    id: 'notify-1',
    type: `custom:${itemId}`,
    name: 'Notify',
    position: { x: 0, y: 100 },
    version: '1.0.0',
    provider: 'cloudflare',
    data: { threshold: 3 },
  }
}

async function save(ir: unknown) {
  const res = await call(`/workflows/wf-sales/versions?${PROJECT}`, h.json({ ir }))
  expect([200, 201]).toContain(res.status)
}

async function prepare(mode?: 'read') {
  const workflow = await h.adapter.getWorkflowById('wf-sales')
  return prepareWorkflow({
    db: h.adapter,
    workflow: workflow!,
    organizationId: 'org-acme',
    projectId: 'p-101',
    ...(mode && { mode }),
  })
}

async function check() {
  const res = await call(`/workflows/wf-sales/source/check?${PROJECT}`, h.json({}))
  expect(res.status).toBe(200)
  return (await res.json()) as { ok: boolean; diagnostics: { source: string; message: string }[] }
}

async function source() {
  const res = await call(`/workflows/wf-sales/source?${PROJECT}`)
  expect(res.status).toBe(200)
  return (await res.json()) as { files: { path: string; source: string; hash?: string }[] }
}

const libraryMessages = (body: { diagnostics: { source: string; message: string }[] }) =>
  body.diagnostics.filter((d) => d.source === 'library').map((d) => d.message)

async function node(template: string, imports = '') {
  const id = await createItem({ kind: 'node', name: 'Notify' }, PROJECT)
  await put(id, '1.0.0/template.ts', `${imports}${template}`)
  return id
}

describe('a workflow bundling the Library', () => {
  beforeEach(async () => {
    h = createSqliteApp()
    await seedAcme(h)
  })

  it('bundles the latest published module under modules/<slug>, without its package.json', async () => {
    const id = await module('Lead scoring', '1.4.1', 'export const score = () => 1\n')
    await save(stepIr(`import { score } from '#modules/lead-scoring'\nreturn score()`))

    const first = await source()
    const bundled = first.files.filter((f) => f.path.startsWith('modules/'))
    expect(bundled.map((f) => f.path)).toEqual(['modules/lead-scoring/index.ts'])
    expect(bundled[0]).toMatchObject({ source: 'export const score = () => 1\n' })
    // Library code is not the workflow's to write: no precondition hash.
    expect(bundled[0]!.hash).toBeUndefined()

    // A publish reaches the next bundle without saving the workflow.
    await put(id, 'index.ts', 'export const score = () => 2\n')
    expect((await publish(id)).body).toMatchObject({ version: '1.4.2' })
    const next = await source()
    expect(next.files.find((f) => f.path === 'modules/lead-scoring/index.ts')?.source).toBe(
      'export const score = () => 2\n',
    )

    const prepared = await prepare()
    if (isPrepareError(prepared)) throw new Error(prepared.error)
    expect(prepared.library).toEqual([{ itemId: id, slug: 'lead-scoring', version: '1.4.2' }])
    // What the deploy's package.json maps as `#modules/<slug>`.
    expect(prepared.bundle.libraryModules).toEqual(['lead-scoring'])
  })

  it('records what a save uses, so Used by names the workflow and a delete is refused', async () => {
    const id = await module('Lead scoring', '1.0.0', 'export const score = () => 1\n')
    await save(stepIr(`import { score } from '#modules/lead-scoring'\nreturn score()`))
    const usages = (await (await call(`/library/items/${id}/usages`)).json()) as {
      usedBy: { visible: { id: string; runs: string | null }[] }
    }
    expect(usages.usedBy.visible).toEqual([expect.objectContaining({ id: 'wf-sales', runs: null })])
    const refused = await call(`/library/items/${id}`, { method: 'DELETE' })
    expect(refused.status).toBe(409)
    expect(JSON.stringify(await refused.json())).toContain('In sales')

    await save(stepIr('return 1'))
    expect((await call(`/library/items/${id}`, { method: 'DELETE' })).status).toBe(204)
  })

  it('follows a module’s own imports, and bundles modules that import each other', async () => {
    // A publish refuses an import with no published module behind it, so the
    // cycle closes with B's second version.
    const b = await module('B', '1.0.0', `export const b = () => 'b'\n`)
    await module('A', '1.0.0', `import { b } from '#modules/b'\nexport const a = () => b()\n`)
    await put(b, 'index.ts', `import { a } from '#modules/a'\nexport const b = () => 'b'\n`)
    expect((await publish(b)).status).toBe(201)
    await save(stepIr(`import { a } from '#modules/a'\nreturn a()`))
    const paths = (await source()).files.map((f) => f.path).filter((p) => p.startsWith('modules/'))
    expect(paths).toEqual(['modules/a/index.ts', 'modules/b/index.ts'])
    expect((await check()).ok).toBe(true)
  })

  it('refuses an unpublished module and a slug nobody owns, naming them', async () => {
    await createItem({ kind: 'module', name: 'Draft mod' })
    await save(
      stepIr(
        `import { x } from '#modules/draft-mod'\nimport { y } from '#modules/nope'\nreturn x + y`,
      ),
    )
    const result = await check()
    expect(result.ok).toBe(false)
    expect(libraryMessages(result)).toEqual([
      'Cannot resolve "#modules/nope": no module of that name in this workspace or the project',
      'Module "draft-mod" has no published version yet; publish it to use it',
    ])
    const deploy = await prepare()
    expect(isPrepareError(deploy) && deploy.status).toBe(400)
    expect(isPrepareError(deploy) && deploy.error).toContain('#modules/nope')
  })

  it('generates a placed custom node from its latest version, without the ctx import', async () => {
    await module('Fmt', '1.0.0', `export const fmt = (n: number) => String(n)\n`, {
      scope: PROJECT,
    })
    const id = await node(
      `export default async function (ctx: Ctx): Promise<Output> {\n  return { text: fmt(ctx.config.threshold) }\n}\n`,
      `import type { Ctx, Output } from './ctx'\nimport { fmt } from '#modules/fmt'\n\n`,
    )
    expect((await publish(id)).status).toBe(201)
    await save(stepIr('return 1', [customNode(id)]))

    const files = (await source()).files
    const generated = files.find((f) => f.path.startsWith('nodes/') && f.source.includes('fmt('))
    expect(generated?.source).toContain(`import { fmt } from '#modules/fmt'`)
    expect(generated?.source).not.toContain('./ctx')
    expect(files.some((f) => f.path === 'modules/fmt/index.ts')).toBe(true)
    expect((await check()).ok).toBe(true)
    const usages = (await (await call(`/library/items/${id}/usages`)).json()) as {
      usedBy: { visible: { id: string }[] }
    }
    expect(usages.usedBy.visible.map((c) => c.id)).toEqual(['wf-sales'])
  })

  it('refuses publishing a node template that imports a relative file', async () => {
    const id = await node(
      `export default async function (ctx) {\n  return helper()\n}\n`,
      `import { helper } from './helpers'\n`,
    )
    const refused = await publish(id)
    expect(refused.status).toBe(422)
    expect(JSON.stringify(refused.body)).toContain('a node template can import npm packages')
  })

  it('names a custom node of another workspace as unknown, and records no use of it', async () => {
    const id = await createItem(
      { kind: 'node', name: 'Ops node' },
      'projectId=p-101&workspaceId=ws-ops',
    )
    expect((await publish(id)).status).toBe(201)
    await save(stepIr('return 1', [customNode(id)]))
    const result = await check()
    expect(libraryMessages(result)).toEqual([
      `Unknown custom node "${id}": it is not in this workspace or the project`,
    ])
    expect(JSON.stringify(result)).not.toContain('Ops node')
    expect((await call(`/library/items/${id}`, { method: 'DELETE' })).status).toBe(204)
  })

  it('refuses one slug meaning two modules in a bundle, naming both sides', async () => {
    await module('Fmt', '1.0.0', 'export const fmt = 1\n', { scope: PROJECT })
    await module('Fmt', '2.0.0', 'export const fmt = 2\n')
    const id = await node(
      `export default async function (ctx) {\n  return { v: fmt }\n}\n`,
      `import { fmt } from '#modules/fmt'\n`,
    )
    expect((await publish(id)).status).toBe(201)
    await save(stepIr(`import { fmt } from '#modules/fmt'\nreturn fmt`, [customNode(id)]))
    expect(libraryMessages(await check())).toEqual([
      '"#modules/fmt" means the project’s module for Notify, but this workspace’s module for this workflow; rename one of them',
    ])
  })

  it('refuses library modules asking for one package at two ranges, naming both', async () => {
    await module('Aa', '1.0.0', 'export const a = 1\n', { dependencies: { zod: '^3.23.0' } })
    await module('Bb', '1.0.0', 'export const b = 1\n', { dependencies: { zod: '^4.1.0' } })
    await save(
      stepIr(`import { a } from '#modules/aa'\nimport { b } from '#modules/bb'\nreturn a + b`),
    )
    expect(libraryMessages(await check())).toEqual([
      'Dependency conflict: zod: aa 1.0.0 wants ^3.23.0, bb 1.0.0 wants ^4.1.0',
    ])
    const deploy = await prepare()
    expect(isPrepareError(deploy) && deploy.error).toBe(
      'Dependency conflict: zod: aa 1.0.0 wants ^3.23.0, bb 1.0.0 wants ^4.1.0',
    )
  })

  it('says at check when library dependencies push the deploy set past the install limit', async () => {
    const deps = (prefix: string) =>
      Object.fromEntries(Array.from({ length: 8 }, (_, k) => [`${prefix}-${k}`, '^1.0.0']))
    await module('Aa', '1.0.0', 'export const a = 1\n', { dependencies: deps('pa') })
    await module('Bb', '1.0.0', 'export const b = 1\n', { dependencies: deps('pb') })
    await save(
      stepIr(`import { a } from '#modules/aa'\nimport { b } from '#modules/bb'\nreturn a + b`),
    )
    expect(libraryMessages(await check())).toEqual([
      'Dependencies with library code: Maximum 15 dependencies',
    ])
    const deploy = await prepare()
    expect(isPrepareError(deploy) && deploy.error).toBe(
      'Dependencies with library code: Maximum 15 dependencies',
    )
  })

  it('merges library dependencies that agree into the deploy set', async () => {
    await module('Aa', '1.0.0', 'export const a = 1\n', { dependencies: { zod: '^4.1.0' } })
    await save(stepIr(`import { a } from '#modules/aa'\nreturn a`))
    const prepared = await prepare()
    if (isPrepareError(prepared)) throw new Error(prepared.error)
    expect(prepared.dependencies).toEqual({ zod: '^4.1.0' })
  })

  it('refuses a new workflow file under modules/, and an old one once a library module is bundled', async () => {
    const reserved = await call(
      `/workflows/wf-sales/files/modules/x.ts?${PROJECT}`,
      h.json({ source: 'export const x = 1' }, 'PUT'),
    )
    expect(reserved.status).toBe(422)
    expect(JSON.stringify(await reserved.json())).toContain('reserved for library modules')

    // A file stored before the folder was reserved keeps deploying...
    await h.db.insert(h.schema.workflowFiles).values({
      id: 'f-old',
      workflowId: 'wf-sales',
      path: 'modules/x.ts',
      source: 'export const x = 1\n',
      hash: 'h-old',
      size: 19,
      createdAt: '2026-10-20T00:00:00.000Z',
      updatedAt: '2026-10-20T00:00:00.000Z',
    })
    await save(stepIr(`import { x } from '#app/modules/x'\nreturn x`))
    expect((await check()).ok).toBe(true)
    // Its own modules/x.ts is not a library module: the deploy maps no #modules/ entry for it.
    const legacy = await prepare()
    if (isPrepareError(legacy)) throw new Error(legacy.error)
    expect(legacy.bundle.libraryModules).toBeUndefined()

    // ...until the workflow bundles a library module.
    await module('Lead scoring', '1.0.0', 'export const score = () => 1\n')
    await save(
      stepIr(
        `import { x } from '#app/modules/x'\nimport { score } from '#modules/lead-scoring'\nreturn x + score()`,
      ),
    )
    expect(libraryMessages(await check())).toEqual([
      'modules/ is reserved for library modules; move "modules/x.ts" elsewhere',
    ])
  })

  it('records the uses of a reverted version, so the delete guard judges the current code', async () => {
    const id = await module('Lead scoring', '1.0.0', 'export const score = () => 1\n')
    await save(stepIr(`import { score } from '#modules/lead-scoring'\nreturn score()`))
    const v1 = (await h.adapter.getWorkflowById('wf-sales'))!.currentVersionId!
    // v1 went out on an account, so the next save starts v2 instead of saving over it.
    await h.db.insert(h.schema.deployments).values({
      id: 'd-v1',
      workflowId: 'wf-sales',
      versionId: v1,
      versionNumber: 1,
      connectionId: null,
      serviceName: 'svc',
      status: 'success',
      createdAt: '2026-10-21T00:00:00.000Z',
    })
    await save(stepIr('return 1'))
    const reverted = await call(`/workflows/wf-sales/versions/${v1}/revert?${PROJECT}`, {
      method: 'POST',
    })
    expect(reverted.status).toBe(201)
    expect((await call(`/library/items/${id}`, { method: 'DELETE' })).status).toBe(409)
  })

  it('reports a #modules/ subpath that the bundled module does not have', async () => {
    await module('Fmt', '1.0.0', 'export const fmt = 1\n')
    await save(
      stepIr(
        `import { x } from '#modules/fmt/nope'\nimport { fmt } from '#modules/fmt'\nreturn x + fmt`,
      ),
    )
    const result = await check()
    expect(result.diagnostics).toEqual([
      expect.objectContaining({
        source: 'import',
        message: expect.stringContaining('#modules/fmt/nope'),
      }),
    ])
  })

  it('validates the bindings library code uses against the workflow’s own declarations', async () => {
    await module(
      'Cache',
      '1.0.0',
      "import { kv } from '#awaitstep/cloudflare'\nexport const read = (env: Env) => kv(env, 'CACHE').get('a')\n",
    )
    const ir = {
      ...stepIr(`import { read } from '#modules/cache'\nreturn read(env)`),
      runtime: { resources: [{ name: 'CACHE', kind: 'd1' }] },
    }
    await save(ir)
    const result = await check()
    expect(JSON.stringify(result.diagnostics)).toContain('Binding \\"CACHE\\" is declared as d1')
  })

  it('counts an import in the workflow’s legacy trigger code as a use', async () => {
    const id = await module('Lead scoring', '1.0.0', 'export const score = () => 1\n')
    await h.db
      .update(h.schema.workflows)
      .set({ triggerCode: "import { score } from '#modules/lead-scoring'\nexport default {}" })
    await save(stepIr('return 1'))
    expect((await call(`/library/items/${id}`, { method: 'DELETE' })).status).toBe(409)
  })

  it('leaves a workflow that uses no library code exactly as it was', async () => {
    await save(stepIr('return 1'))
    const prepared = await prepare()
    if (isPrepareError(prepared)) throw new Error(prepared.error)
    expect(prepared.library).toEqual([])
    expect(prepared.libraryPaths).toEqual([])
    expect(prepared.diagnostics).toEqual([])
    expect(prepared.bundle.files.some((f) => f.path.startsWith('modules/'))).toBe(false)
  })
})
