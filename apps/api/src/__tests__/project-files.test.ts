import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createTestApp, resetStore, TEST_USER_ID, TEST_PROJECT_ID, mockDb } from './helpers.js'

const validIR = {
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
      name: 'Hello',
      position: { x: 0, y: 0 },
      version: '1.0.0',
      provider: 'cloudflare',
      data: { code: 'return 1;' },
    },
  ],
  edges: [],
  entryNodeId: 'step-1',
}

function url(path: string) {
  return `${path}${path.includes('?') ? '&' : '?'}projectId=${TEST_PROJECT_ID}`
}

const json = { 'Content-Type': 'application/json' }

async function putFile(
  app: ReturnType<typeof createTestApp>,
  path: string,
  source: string,
  headers: Record<string, string> = {},
) {
  return app.request(url(`/api/workflows/wf-1/files/${path}`), {
    method: 'PUT',
    headers: { ...json, ...headers },
    body: JSON.stringify({ source }),
  })
}

async function saveVersion(app: ReturnType<typeof createTestApp>, ir: unknown = validIR) {
  return app.request(url('/api/workflows/wf-1/versions'), {
    method: 'POST',
    headers: json,
    body: JSON.stringify({ ir }),
  })
}

describe('project file routes', () => {
  let app: ReturnType<typeof createTestApp>

  beforeEach(async () => {
    resetStore()
    app = createTestApp()
    await mockDb.createWorkflow({
      id: 'wf-1',
      projectId: TEST_PROJECT_ID,
      createdBy: TEST_USER_ID,
      name: 'Test',
    })
  })

  it('describes an empty project with its conventions and limits', async () => {
    const res = await app.request(url('/api/workflows/wf-1/project'))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toMatchObject({
      importPrefix: '#app/',
      generated: ['worker.*', 'nodes/**', 'wrangler.*'],
      rootConfigFiles: ['package.json', 'tsconfig.json', 'jsconfig.json'],
      files: [],
      limits: { maxFiles: 100, maxFileBytes: 512_000, maxTotalBytes: 2_000_000 },
    })
    expect(body.extensions).toContain('ts')
  })

  it('creates files in any folder and reads them back with the hash as ETag', async () => {
    const created = await putFile(app, 'config/env.ts', 'export const region = "eu"')
    expect(created.status).toBe(201)
    const createdBody = await created.json()
    expect(createdBody).toMatchObject({ path: 'config/env.ts', size: 26 })
    expect(created.headers.get('ETag')).toBe(`"${createdBody.hash}"`)

    const read = await app.request(url('/api/workflows/wf-1/files/config/env.ts'))
    expect(read.status).toBe(200)
    expect(read.headers.get('ETag')).toBe(`"${createdBody.hash}"`)
    expect(await read.json()).toMatchObject({ source: 'export const region = "eu"' })

    await putFile(app, 'README.md', '# hi')
    const listed = await app.request(url('/api/workflows/wf-1/project'))
    const { files } = await listed.json()
    expect(files.map((f: { path: string }) => f.path)).toEqual(['README.md', 'config/env.ts'])
  })

  it('replaces in place and honours If-Match for writes', async () => {
    const first = await (await putFile(app, 'config/a.ts', 'v1')).json()

    const stale = await putFile(app, 'config/a.ts', 'v2', { 'If-Match': '"not-the-hash"' })
    expect(stale.status).toBe(409)
    expect(await stale.json()).toMatchObject({ currentHash: first.hash })

    const matched = await putFile(app, 'config/a.ts', 'v2', { 'If-Match': `"${first.hash}"` })
    expect(matched.status).toBe(200)

    const mustExist = await putFile(app, 'config/new.ts', 'x', { 'If-Match': '*' })
    expect(mustExist.status).toBe(409)
    expect(await mustExist.json()).toMatchObject({ error: 'File does not exist' })
  })

  it('rejects generated paths, nested toolchain config, lockfiles and oversized files', async () => {
    expect((await putFile(app, 'worker.ts', '')).status).toBe(422)
    expect((await putFile(app, 'worker.js', '')).status).toBe(422)
    expect((await putFile(app, 'nodes/x.ts', '')).status).toBe(422)
    expect((await putFile(app, 'config/package.json', '{}')).status).toBe(422)
    expect((await putFile(app, 'package-lock.json', '{}')).status).toBe(422)
    expect((await putFile(app, 'image.png', '')).status).toBe(422)
    const tooBig = await putFile(app, 'big.ts', 'é'.repeat(300_000))
    expect(tooBig.status).toBe(422)
    expect((await tooBig.json()).error).toMatch(/512000 bytes/)
  })

  it('refuses a file that would overwrite another after compile or on a case-insensitive disk', async () => {
    expect((await putFile(app, 'config/env.ts', '')).status).toBe(201)
    const js = await putFile(app, 'config/env.js', '')
    expect(js.status).toBe(422)
    expect((await js.json()).error).toMatch(/would overwrite "config\/env.ts"/)
    expect((await putFile(app, 'Config/Env.ts', '')).status).toBe(422)
    expect((await putFile(app, 'config/env.ts', 'replace ok')).status).toBe(200)
  })

  it('accepts a root package.json and validates its contract', async () => {
    const bad = await putFile(app, 'package.json', '{"dependencies":{"x":"file:/etc"}}')
    expect(bad.status).toBe(422)
    const badBody = await bad.json()
    expect(badBody.error).toBe('Invalid package.json')
    expect(badBody.details[0].path).toBe('package.json.dependencies.x')

    const good = await putFile(
      app,
      'package.json',
      '{"name":"my-worker","type":"module","dependencies":{"zod":"^4.0.0"}}',
    )
    expect(good.status).toBe(201)
  })

  it('deletes with and without a precondition', async () => {
    const saved = await (await putFile(app, 'config/a.ts', 'v1')).json()

    const wrong = await app.request(url('/api/workflows/wf-1/files/config/a.ts'), {
      method: 'DELETE',
      headers: { 'If-Match': '"stale"' },
    })
    expect(wrong.status).toBe(409)

    const ok = await app.request(url('/api/workflows/wf-1/files/config/a.ts'), {
      method: 'DELETE',
      headers: { 'If-Match': `"${saved.hash}"` },
    })
    expect(ok.status).toBe(204)

    const gone = await app.request(url('/api/workflows/wf-1/files/config/a.ts'), {
      method: 'DELETE',
    })
    expect(gone.status).toBe(404)
    expect((await app.request(url('/api/workflows/wf-1/files/config/a.ts'))).status).toBe(404)
  })

  it('snapshots project files into saved versions and ships them in the generated bundle', async () => {
    await putFile(app, 'config/retry.ts', 'export const retry = (n: number) => n')
    await putFile(app, 'data/x.json', '[1]')
    await putFile(app, 'package.json', '{"dependencies":{"zod":"^4.0.0"}}')

    const saved = await saveVersion(app)
    expect(saved.status).toBe(201)
    const version = await saved.json()
    expect(JSON.parse(version.ir).runtime.files.map((f: { path: string }) => f.path)).toEqual([
      'config/retry.ts',
      'data/x.json',
      'package.json',
    ])

    const source = await app.request(url('/api/workflows/wf-1/source'))
    expect(source.status).toBe(200)
    const bundle = await source.json()
    const roles = bundle.files.map((f: { role: string; path: string }) => `${f.role}:${f.path}`)
    expect(roles).toContain('module:config/retry.ts')
    expect(roles).toContain('asset:data/x.json')
    expect(roles).toContain('meta:package.json')
  })

  it('treats a project handlers.ts as the trigger code everywhere it is read', async () => {
    await app.request(url('/api/workflows/wf-1'), {
      method: 'PATCH',
      headers: json,
      body: JSON.stringify({
        triggerCode: '@fetch function legacy(request, env) { return new Response("old") }',
      }),
    })
    const handlers = '@fetch function handler(request, env) { return new Response("file") }'
    expect((await putFile(app, 'handlers.ts', handlers)).status).toBe(201)

    // The canvas hydrates from /full: the file's contents, not the column.
    const full = await (await app.request(url('/api/workflows/wf-1/full'))).json()
    expect(full.workflow.triggerCode).toBe(handlers)

    // A saved version snapshots the file and drops the inline copy, so a
    // stale duplicate can never come back through the IR.
    const saved = await (
      await saveVersion(app, { ...validIR, runtime: { triggerCode: 'stale' } })
    ).json()
    const runtime = JSON.parse(saved.ir).runtime
    expect(runtime.files).toEqual([{ path: 'handlers.ts', source: handlers }])
    expect(runtime.triggerCode).toBeUndefined()

    // Codegen compiles it into the entry; the bundle carries it as a
    // handlers input, never as a module.
    const bundle = await (await app.request(url('/api/workflows/wf-1/source'))).json()
    const entry = bundle.files.find((f: { path: string }) => f.path === bundle.entry)
    expect(entry.source).toContain('new Response("file")')
    expect(entry.source).not.toContain('new Response("old")')
    expect(
      bundle.files.map((f: { role: string; path: string }) => `${f.role}:${f.path}`),
    ).toContain('handlers:handlers.ts')
    // Project files carry the hash the file routes use as ETag; generated
    // files do not.
    const handlersFile = bundle.files.find((f: { path: string }) => f.path === 'handlers.ts')
    const stored = await (await app.request(url('/api/workflows/wf-1/files/handlers.ts'))).json()
    expect(handlersFile.hash).toBe(stored.hash)
    expect(entry.hash).toBeUndefined()
  })

  it('creates only when asked to with If-None-Match', async () => {
    const created = await putFile(app, 'config/a.ts', 'v1', { 'If-None-Match': '*' })
    expect(created.status).toBe(201)
    const createdBody = await created.json()

    const taken = await putFile(app, 'config/a.ts', 'v2', { 'If-None-Match': '*' })
    expect(taken.status).toBe(409)
    expect(await taken.json()).toEqual({
      error: 'File already exists',
      currentHash: createdBody.hash,
    })
    expect(
      (await (await app.request(url('/api/workflows/wf-1/files/config/a.ts'))).json()).source,
    ).toBe('v1')

    const both = await putFile(app, 'config/a.ts', 'v2', { 'If-None-Match': '*', 'If-Match': '*' })
    expect(both.status).toBe(400)
  })

  it('deleting handlers.ts or package.json also retires the legacy setting', async () => {
    await app.request(url('/api/workflows/wf-1'), {
      method: 'PATCH',
      headers: json,
      body: JSON.stringify({ triggerCode: 'legacy', dependencies: { zod: '^4.0.0' } }),
    })
    await putFile(app, 'handlers.ts', '@fetch function handler() {}')
    await putFile(app, 'package.json', '{"dependencies":{"zod":"^4.0.0"}}')

    for (const path of ['handlers.ts', 'package.json']) {
      const res = await app.request(url(`/api/workflows/wf-1/files/${path}`), { method: 'DELETE' })
      expect(res.status).toBe(204)
    }
    const full = await (await app.request(url('/api/workflows/wf-1/full'))).json()
    expect(full.workflow.triggerCode).toBeNull()
    expect(full.workflow.dependencies).toBeNull()

    // A missing file leaves the settings alone.
    const missing = await app.request(url('/api/workflows/wf-1/files/handlers.ts'), {
      method: 'DELETE',
    })
    expect(missing.status).toBe(404)
  })

  it('seeds handlers.ts and package.json from an IR that carries inline settings', async () => {
    const imported = {
      ...validIR,
      runtime: { triggerCode: '@fetch function handler() {}', dependencies: { zod: '^4.0.0' } },
    }
    const saved = await (await saveVersion(app, imported)).json()
    const listed = await (await app.request(url('/api/workflows/wf-1/project'))).json()
    expect(listed.files.map((f: { path: string }) => f.path)).toEqual([
      'handlers.ts',
      'package.json',
    ])
    const pkg = await (await app.request(url('/api/workflows/wf-1/files/package.json'))).json()
    expect(JSON.parse(pkg.source)).toEqual({ dependencies: { zod: '^4.0.0' } })
    const runtime = JSON.parse(saved.ir).runtime
    expect(runtime.triggerCode).toBeUndefined()
    expect(runtime.dependencies).toBeUndefined()
    expect(runtime.files.map((f: { path: string }) => f.path)).toEqual([
      'handlers.ts',
      'package.json',
    ])

    // Once the files exist the table is the truth: inline settings in a later
    // IR neither re-seed nor overwrite them.
    await putFile(app, 'handlers.ts', '@fetch function edited() {}', { 'If-Match': '*' })
    await saveVersion(app, { ...imported, runtime: { triggerCode: 'stale again' } })
    const stored = await (await app.request(url('/api/workflows/wf-1/files/handlers.ts'))).json()
    expect(stored.source).toBe('@fetch function edited() {}')
  })

  it('handler modules replace the annotation file: the two never coexist, and /full reports consumers', async () => {
    expect(
      (await putFile(app, 'handlers/queue/orders.ts', 'export default async () => {}')).status,
    ).toBe(201)
    // Helpers may live beside the entries; only a path that merely looks
    // like an entry is refused, since it would silently never run.
    expect((await putFile(app, 'handlers/util.ts', 'export const x = 1')).status).toBe(201)
    expect((await putFile(app, 'handlers/Fetch.ts', 'export default 1')).status).toBe(422)
    const annotation = await putFile(app, 'handlers.ts', '@fetch function handler() {}')
    expect(annotation.status).toBe(422)
    expect((await annotation.json()).error).toMatch(/already uses handler modules/)

    await app.request(url('/api/workflows/wf-1'), {
      method: 'PATCH',
      headers: json,
      body: JSON.stringify({ triggerCode: '@fetch function legacy() {}' }),
    })
    const full = await (await app.request(url('/api/workflows/wf-1/full'))).json()
    expect(full.handlers).toEqual({ modules: true, consumedQueues: ['orders'] })
    // The legacy setting is not consulted once modules exist.
    expect(full.workflow.triggerCode).toBeNull()

    // The generated entry delegates to the module and keeps the default fetch.
    await saveVersion(app)
    const bundle = await (await app.request(url('/api/workflows/wf-1/source'))).json()
    const entry = bundle.files.find((f: { path: string }) => f.path === bundle.entry)
    expect(entry.source).toContain('import $$queue_orders from "./handlers/queue/orders.js";')
    expect(entry.source).toContain('case "orders":')
    expect(entry.source).not.toContain('legacy')
  })

  it('converts the annotation file to handler modules in one request, folding its facts into stored deployment configs', async () => {
    const annotated = `import { z } from "zod"

@fetch function handler(request, env, ctx) {
  return Response.json({ ok: true });
}

@queue function orders(batch, env, ctx) {
  @config { max_retries: 2 }
  batch.ackAll();
}

@scheduled function hourly(controller, env, ctx) {
  @crons ["0 * * * *"]
}
`
    const stored = await (await putFile(app, 'handlers.ts', annotated)).json()
    await mockDb.upsertDeploymentConfig({
      id: 'dc-1',
      workflowId: 'wf-1',
      connectionId: 'conn-1',
      provider: 'cloudflare',
      config: JSON.stringify({ queueConsumers: [{ queue: 'orders', maxRetries: 9 }] }),
    })

    // The dry run shows the plan without touching anything.
    const preview = await (
      await app.request(url('/api/workflows/wf-1/project/convert-handlers'))
    ).json()
    expect(preview).toEqual({
      source: 'file',
      paths: ['handlers/fetch.ts', 'handlers/queue/orders.ts', 'handlers/scheduled.ts'],
      declarations: {
        crons: ['0 * * * *'],
        queueConfigs: [{ queue: 'orders', maxRetries: 2 }],
        queueNames: [{ name: 'orders', queue: 'orders' }],
      },
    })
    expect((await app.request(url('/api/workflows/wf-1/files/handlers.ts'))).status).toBe(200)

    const stale = await app.request(url('/api/workflows/wf-1/project/convert-handlers'), {
      method: 'POST',
      headers: { 'If-Match': '"not-the-hash"' },
    })
    expect(stale.status).toBe(409)

    const res = await app.request(url('/api/workflows/wf-1/project/convert-handlers'), {
      method: 'POST',
      headers: { 'If-Match': `"${stored.hash}"` },
    })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.files.map((f: { path: string }) => f.path)).toEqual([
      'handlers/fetch.ts',
      'handlers/queue/orders.ts',
      'handlers/scheduled.ts',
    ])
    expect(body.deploymentConfigUpdated).toBe(true)

    expect((await app.request(url('/api/workflows/wf-1/files/handlers.ts'))).status).toBe(404)
    const fetchModule = await (
      await app.request(url('/api/workflows/wf-1/files/handlers/fetch.ts'))
    ).json()
    // Module-level imports follow the handlers that may use them.
    expect(fetchModule.source).toContain('import { z } from "zod"')
    expect(fetchModule.source).toContain('export default async function (request, env, ctx)')
    const full = await (await app.request(url('/api/workflows/wf-1/full'))).json()
    expect(full.handlers).toEqual({ modules: true, consumedQueues: ['orders'] })
    expect(full.workflow.triggerCode).toBeNull()
    // Declared settings win over the inline @config; the cron joins the list.
    const config = JSON.parse((await mockDb.getDeploymentConfig('wf-1', 'conn-1'))!.config)
    expect(config).toEqual({
      queueConsumers: [{ queue: 'orders', maxRetries: 9 }],
      cronTriggers: ['0 * * * *'],
    })

    // Done once: the project is on modules now.
    const again = await app.request(url('/api/workflows/wf-1/project/convert-handlers'), {
      method: 'POST',
    })
    expect(again.status).toBe(409)
  })

  it('converts the legacy trigger-code setting when there is no file, and clears it', async () => {
    await app.request(url('/api/workflows/wf-1'), {
      method: 'PATCH',
      headers: json,
      body: JSON.stringify({ triggerCode: 'return new Response("legacy")' }),
    })
    // A first handler module would silently retire the setting: refused.
    const premature = await putFile(
      app,
      'handlers/queue/orders.ts',
      'export default async () => {}',
    )
    expect(premature.status).toBe(422)
    expect((await premature.json()).error).toMatch(/convert it to handler modules first/)

    const preview = await (
      await app.request(url('/api/workflows/wf-1/project/convert-handlers'))
    ).json()
    expect(preview.source).toBe('setting')
    const res = await app.request(url('/api/workflows/wf-1/project/convert-handlers'), {
      method: 'POST',
    })
    expect(res.status).toBe(200)
    expect((await res.json()).deploymentConfigUpdated).toBe(false)
    const full = await (await app.request(url('/api/workflows/wf-1/full'))).json()
    expect(full.workflow.triggerCode).toBeNull()
    expect(full.handlers.modules).toBe(true)
    expect(
      (await putFile(app, 'handlers/queue/orders.ts', 'export default async () => {}')).status,
    ).toBe(201)
  })

  it('reads the current version once while converting', async () => {
    // The source-mode check and the legacy trigger-code lookup are the same
    // row. The plan takes the read as a promise so both still go out at
    // once, rather than fetching it twice.
    await app.request(url('/api/workflows/wf-1'), {
      method: 'PATCH',
      headers: json,
      body: JSON.stringify({ triggerCode: 'return new Response("legacy")' }),
    })
    await saveVersion(app)
    const versions = vi.spyOn(mockDb, 'getWorkflowVersionById')

    const res = await app.request(url('/api/workflows/wf-1/project/convert-handlers'), {
      method: 'POST',
    })

    expect(res.status).toBe(200)
    expect(versions).toHaveBeenCalledTimes(1)
    versions.mockRestore()
  })

  it('converts even when an untouched file already breaks a project rule', async () => {
    // Written straight to the table, as an import or an older client could
    // have. The conversion does not touch it, so it is not a reason to
    // refuse — the save and the deploy report it on their own.
    await mockDb.upsertWorkflowFiles([
      {
        id: 'f-bad',
        workflowId: 'wf-1',
        path: 'package.json',
        source: '{"type":"commonjs"}',
        hash: 'h',
        size: 20,
      },
    ])
    await app.request(url('/api/workflows/wf-1'), {
      method: 'PATCH',
      headers: json,
      body: JSON.stringify({ triggerCode: 'return new Response("legacy")' }),
    })

    const res = await app.request(url('/api/workflows/wf-1/project/convert-handlers'), {
      method: 'POST',
    })
    expect(res.status).toBe(200)
  })

  it('has nothing to convert for a fresh project', async () => {
    const res = await app.request(url('/api/workflows/wf-1/project/convert-handlers'), {
      method: 'POST',
    })
    expect(res.status).toBe(404)
  })

  it('refuses a handler module while the annotation file exists', async () => {
    await putFile(app, 'handlers.ts', '@fetch function handler() {}')
    const res = await putFile(app, 'handlers/fetch.ts', 'export default async () => new Response()')
    expect(res.status).toBe(422)
    expect((await res.json()).error).toMatch(/convert handlers.ts/)
  })

  it('seeds the table from an IR that arrives with files, then treats the table as truth', async () => {
    const imported = {
      ...validIR,
      runtime: { files: [{ path: 'config/from-import.ts', source: 'export const x = 1' }] },
    }
    expect((await saveVersion(app, imported)).status).toBe(201)
    const listed = await (await app.request(url('/api/workflows/wf-1/project'))).json()
    expect(listed.files.map((f: { path: string }) => f.path)).toEqual(['config/from-import.ts'])

    const source = await (await app.request(url('/api/workflows/wf-1/source'))).json()
    expect(source.files.map((f: { path: string }) => f.path)).toContain('config/from-import.ts')
  })

  it('revert restores the reverted version’s project files', async () => {
    await putFile(app, 'config/a.ts', 'first')
    const v1 = await (await saveVersion(app)).json()
    await mockDb.createDeployment({
      id: 'd-1',
      workflowId: 'wf-1',
      versionId: v1.id,
      connectionId: 'c-1',
      serviceName: 's',
      status: 'success',
    })
    await putFile(app, 'config/a.ts', 'second')
    await putFile(app, 'config/b.ts', 'extra')
    const v2 = await (
      await saveVersion(app, { ...validIR, metadata: { ...validIR.metadata, name: 'changed' } })
    ).json()
    expect(v2.id).not.toBe(v1.id)

    const reverted = await app.request(url(`/api/workflows/wf-1/versions/${v1.id}/revert`), {
      method: 'POST',
    })
    expect(reverted.status).toBe(201)
    const listed = await (await app.request(url('/api/workflows/wf-1/project'))).json()
    expect(listed.files.map((f: { path: string }) => f.path)).toEqual(['config/a.ts'])
    const a = await (await app.request(url('/api/workflows/wf-1/files/config/a.ts'))).json()
    expect(a.source).toBe('first')
  })

  it('is scoped to the workflow in the caller’s project', async () => {
    await mockDb.createWorkflow({
      id: 'wf-other',
      projectId: 'another-project',
      createdBy: TEST_USER_ID,
      name: 'Other',
    })
    const res = await app.request(url('/api/workflows/wf-other/project'))
    expect(res.status).toBe(404)
  })
})
