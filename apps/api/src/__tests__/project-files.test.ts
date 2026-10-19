import { describe, it, expect, beforeEach } from 'vitest'
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

  it('describes an empty project with its conventions, mode and limits', async () => {
    const res = await app.request(url('/api/workflows/wf-1/project'))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toMatchObject({
      importPrefix: '#app/',
      generated: ['worker.*', 'nodes/**', 'wrangler.*'],
      rootConfigFiles: ['package.json', 'tsconfig.json', 'jsconfig.json'],
      sourceMode: 'generated',
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

  it('refuses file writes while the current version is ejected', async () => {
    await putFile(app, 'config/a.ts', 'v1')
    expect((await saveVersion(app)).status).toBe(201)
    const ejected = await app.request(url('/api/workflows/wf-1/eject'), {
      method: 'POST',
      headers: json,
      body: JSON.stringify({}),
    })
    expect(ejected.status).toBe(201)

    const write = await putFile(app, 'config/b.ts', 'nope')
    expect(write.status).toBe(409)
    expect(await write.json()).toMatchObject({ sourceMode: 'ejected' })
    const remove = await app.request(url('/api/workflows/wf-1/files/config/a.ts'), {
      method: 'DELETE',
    })
    expect(remove.status).toBe(409)
    const listed = await (await app.request(url('/api/workflows/wf-1/project'))).json()
    expect(listed.sourceMode).toBe('ejected')
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
