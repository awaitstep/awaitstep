import { describe, it, expect, beforeEach } from 'vitest'
import { contentHash } from '@awaitstep/codegen'
import { isPrepareError, prepareWorkflow } from '../lib/workflow-prepare.js'
import { NO_VERSION_MESSAGE, projectFileDiagnostics } from '../lib/blank-source.js'
import {
  createTestApp,
  FakeTestSessionRunner,
  resetStore,
  mockDb,
  TEST_ORG_ID,
  TEST_PROJECT_ID,
  TEST_USER_ID,
} from './helpers.js'
import { createSqliteApp, seedAcme, type SqliteApp } from './sqlite-app.js'

// A workflow nobody has saved a version of: the source read answers with the
// project's own files and nothing generated, and everything that needs a
// version keeps refusing.

const json = { 'Content-Type': 'application/json' }

interface BlankBody {
  versionId: null
  entry: null
  primary: null
  files: { path: string; source: string; hash: string; role: string }[]
  manifest: null
  requirements: unknown[]
  diagnostics: unknown[]
}

describe('the source of a workflow with no saved version (mock database)', () => {
  let app: ReturnType<typeof createTestApp>
  const url = (path: string) =>
    `${path}${path.includes('?') ? '&' : '?'}projectId=${TEST_PROJECT_ID}`

  beforeEach(async () => {
    resetStore()
    app = createTestApp({ enableLocalDev: true, testSessionRunner: new FakeTestSessionRunner() })
    await mockDb.createWorkflow({
      id: 'wf-blank',
      projectId: TEST_PROJECT_ID,
      createdBy: TEST_USER_ID,
      name: 'Blank',
    })
  })

  it('answers 200 with null version fields and no files for an empty project', async () => {
    const res = await app.request(url('/api/workflows/wf-blank/source'))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({
      versionId: null,
      entry: null,
      primary: null,
      files: [],
      manifest: null,
      requirements: [],
      diagnostics: [],
    })
  })

  it('lists a written project file with its hash and no generated file', async () => {
    const put = await app.request(url('/api/workflows/wf-blank/files/lib/a.ts'), {
      method: 'PUT',
      headers: json,
      body: JSON.stringify({ source: 'export const a = 1\n' }),
    })
    expect(put.status).toBe(201)
    const body = (await (
      await app.request(url('/api/workflows/wf-blank/source'))
    ).json()) as BlankBody
    expect(body.files).toEqual([
      {
        path: 'lib/a.ts',
        source: 'export const a = 1\n',
        role: 'module',
        hash: contentHash('export const a = 1\n'),
      },
    ])
    expect(body.files.some((f) => f.path === 'worker.ts')).toBe(false)
  })

  it('persists nothing: the workflow still has no version afterwards', async () => {
    await app.request(url('/api/workflows/wf-blank/source'))
    expect((await mockDb.getWorkflowById('wf-blank'))?.currentVersionId ?? null).toBeNull()
  })

  it('still reports not found for a version id that does not exist', async () => {
    const res = await app.request(url('/api/workflows/wf-blank/source?versionId=nope'))
    expect(res.status).toBe(404)
  })

  it('the check answers 200 ok:false with the no-saved-version finding, as a deploy would refuse', async () => {
    const res = await app.request(url('/api/workflows/wf-blank/source/check'), { method: 'POST' })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({
      ok: false,
      versionId: null,
      checked: ['compile', 'import'],
      requirements: [],
      diagnostics: [{ source: 'ir', message: NO_VERSION_MESSAGE }],
    })
  })

  async function putFile(path: string, source: string) {
    const put = await app.request(url(`/api/workflows/wf-blank/files/${path}`), {
      method: 'PUT',
      headers: json,
      body: JSON.stringify({ source }),
    })
    expect(put.status).toBe(201)
  }

  it('a broken project file shows up as a compile diagnostic in the read and in the check', async () => {
    await putFile('lib/a.ts', 'export const a = (\n')
    const read = (await (
      await app.request(url('/api/workflows/wf-blank/source'))
    ).json()) as BlankBody
    expect(read.diagnostics).toEqual([
      expect.objectContaining({ source: 'compile', path: 'lib/a.ts' }),
    ])
    const check = (await (
      await app.request(url('/api/workflows/wf-blank/source/check'), { method: 'POST' })
    ).json()) as { ok: boolean; diagnostics: { source: string; path?: string }[] }
    expect(check.ok).toBe(false)
    expect(check.diagnostics.map((d) => d.source)).toEqual(['ir', 'compile'])
    expect(check.diagnostics[1]!.path).toBe('lib/a.ts')
  })

  it('an import that leaves the project is reported', async () => {
    await putFile('lib/a.ts', "import x from '../../../etc/passwd'\nexport default x\n")
    const read = (await (
      await app.request(url('/api/workflows/wf-blank/source'))
    ).json()) as BlankBody
    expect(read.diagnostics).toEqual([
      expect.objectContaining({ source: 'import', path: 'lib/a.ts' }),
    ])
  })

  it('a healthy project file adds no diagnostic to the read', async () => {
    await putFile('lib/a.ts', 'export const a = 1\n')
    const read = (await (
      await app.request(url('/api/workflows/wf-blank/source'))
    ).json()) as BlankBody
    expect(read.diagnostics).toEqual([])
  })

  it('an empty versionId is no version asked for: the read answers the blank source, the check the finding', async () => {
    const read = await app.request(url('/api/workflows/wf-blank/source?versionId='))
    expect(read.status).toBe(200)
    expect(((await read.json()) as BlankBody).versionId).toBeNull()
    const check = await app.request(url('/api/workflows/wf-blank/source/check?versionId='), {
      method: 'POST',
    })
    expect(check.status).toBe(200)
    expect(((await check.json()) as { ok: boolean }).ok).toBe(false)
  })

  it('the check refuses candidate files, which are judged against generated code', async () => {
    const res = await app.request(url('/api/workflows/wf-blank/source/check'), {
      method: 'POST',
      headers: json,
      body: JSON.stringify({ files: [{ path: 'lib/a.ts', source: 'export {}' }] }),
    })
    expect(res.status).toBe(400)
  })

  it('a strict prepare still refuses with a message that says what to do', async () => {
    const workflow = (await mockDb.getWorkflowById('wf-blank'))!
    const result = await prepareWorkflow({
      db: mockDb,
      workflow,
      organizationId: TEST_ORG_ID,
      projectId: TEST_PROJECT_ID,
    })
    expect(isPrepareError(result) && result.status).toBe(400)
    expect(isPrepareError(result) && result.error).toBe(NO_VERSION_MESSAGE)
  })

  it('local dev and test sessions still refuse with a 400', async () => {
    const dev = await app.request(url('/api/workflows/wf-blank/local-dev/start'), {
      method: 'POST',
    })
    expect(dev.status).toBe(400)
    expect(((await dev.json()) as { error: string }).error).toBe(NO_VERSION_MESSAGE)
    const session = await app.request(url('/api/workflows/wf-blank/test-sessions'), {
      method: 'POST',
    })
    expect(session.status).toBe(400)
    expect(((await session.json()) as { error: string }).error).toBe(NO_VERSION_MESSAGE)
  })
})

describe('the source of a workflow with no saved version (real SQLite database)', () => {
  let h: SqliteApp
  const path = '/api/workflows/wf-sales/source?projectId=p-101'

  beforeEach(async () => {
    h = createSqliteApp()
    await seedAcme(h)
  })

  it('reads the project files in one 200, then the generated ones appear after a first save', async () => {
    const put = await h.app.request(
      '/api/workflows/wf-sales/files/lib/a.ts?projectId=p-101',
      h.as('u-ama', { method: 'PUT', body: JSON.stringify({ source: 'export const a = 1\n' }) }),
    )
    expect(put.status).toBe(201)

    const blank = (await (await h.app.request(path, h.as('u-ama'))).json()) as BlankBody
    expect(blank.versionId).toBeNull()
    expect(blank.entry).toBeNull()
    expect(blank.files.map((f) => [f.path, f.hash])).toEqual([
      ['lib/a.ts', contentHash('export const a = 1\n')],
    ])

    const ir = {
      metadata: {
        name: 't',
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
    const saved = await h.app.request(
      '/api/workflows/wf-sales/versions?projectId=p-101',
      h.as('u-ama', { method: 'POST', body: JSON.stringify({ ir }) }),
    )
    expect(saved.status).toBe(201)

    const after = (await (await h.app.request(path, h.as('u-ama'))).json()) as {
      versionId: string
      entry: string
      files: { path: string; hash?: string }[]
    }
    expect(after.versionId).toEqual(expect.any(String))
    expect(after.entry).toBe('awaitstep/workflow.ts')
    const paths = after.files.map((f) => f.path)
    expect(paths).not.toContain('worker.ts')
    expect(paths).toContain('awaitstep/workflow.ts')
    expect(paths).toContain('lib/a.ts')
    expect(after.files.find((f) => f.path === 'lib/a.ts')?.hash).toBe(
      contentHash('export const a = 1\n'),
    )
  })

  it('the check answers 200 ok:false on a blank workflow, naming a broken stored file', async () => {
    const put = await h.app.request(
      '/api/workflows/wf-sales/files/lib/a.ts?projectId=p-101',
      h.as('u-ama', { method: 'PUT', body: JSON.stringify({ source: 'export const a = (\n' }) }),
    )
    expect(put.status).toBe(201)
    const res = await h.app.request(
      '/api/workflows/wf-sales/source/check?projectId=p-101',
      h.as('u-ama', { method: 'POST' }),
    )
    expect(res.status).toBe(200)
    const body = (await res.json()) as {
      ok: boolean
      diagnostics: { source: string; path?: string }[]
    }
    expect(body.ok).toBe(false)
    expect(body.diagnostics.map((d) => [d.source, d.path])).toEqual([
      ['ir', undefined],
      ['compile', 'lib/a.ts'],
    ])
  })

  it('local dev start still refuses a blank workflow', async () => {
    const dev = createSqliteApp({ enableLocalDev: true })
    await seedAcme(dev)
    const res = await dev.app.request(
      '/api/workflows/wf-sales/local-dev/start?projectId=p-101',
      dev.as('u-ama', { method: 'POST' }),
    )
    expect(res.status).toBe(400)
  })
})

describe('projectFileDiagnostics', () => {
  it('judges package.json by the write rules, which a stored row can bypass', async () => {
    const found = await projectFileDiagnostics([
      { path: 'package.json', source: '{ nope', role: 'meta' },
    ])
    expect(found).toEqual([
      { source: 'compile', message: 'package.json must be valid JSON', path: 'package.json' },
    ])
  })

  it('ignores non-code files', async () => {
    expect(
      await projectFileDiagnostics([{ path: 'data/x.json', source: '{ nope', role: 'asset' }]),
    ).toEqual([])
  })
})
