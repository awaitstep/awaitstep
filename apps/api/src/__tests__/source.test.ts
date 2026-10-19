import { describe, it, expect, beforeEach } from 'vitest'
import { bundleHash } from '@awaitstep/codegen'
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

async function seedWorkflowWithVersion(app: ReturnType<typeof createTestApp>) {
  await mockDb.createWorkflow({
    id: 'wf-1',
    projectId: TEST_PROJECT_ID,
    createdBy: TEST_USER_ID,
    name: 'Test',
  })
  const res = await app.request(url('/api/workflows/wf-1/versions'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ir: validIR }),
  })
  expect(res.status).toBe(201)
}

async function eject(app: ReturnType<typeof createTestApp>) {
  const res = await app.request(url('/api/workflows/wf-1/eject'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  })
  return res
}

describe('source routes', () => {
  let app: ReturnType<typeof createTestApp>

  beforeEach(async () => {
    resetStore()
    app = createTestApp()
    await seedWorkflowWithVersion(app)
  })

  describe('POST /api/workflows/:workflowId/eject', () => {
    it('creates a new ejected version with markers and manifest', async () => {
      const res = await eject(app)
      expect(res.status).toBe(201)
      const body = (await res.json()) as { versionId: string; sourceMode: string }
      expect(body.sourceMode).toBe('ejected')

      const version = await mockDb.getWorkflowVersionById(body.versionId)
      expect(version?.sourceMode).toBe('ejected')
      expect(version?.baseGeneratedHash).toBeTruthy()
      const bundle = JSON.parse(version!.source!) as {
        entry: string
        files: { path: string; source: string }[]
      }
      const entry = bundle.files.find((f) => f.path === bundle.entry)!
      expect(entry.source).toContain('// @awaitstep:node step-1')
      const manifest = JSON.parse(version!.manifest!) as { steps: { nodeId: string }[] }
      expect(manifest.steps.map((s) => s.nodeId)).toEqual(['step-1'])
    })

    it('compiles a project handlers.ts into the entry and leaves the input out of the stored source', async () => {
      const put = await app.request(url('/api/workflows/wf-1/files/handlers.ts'), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          source: '@fetch function handler(request, env) { return new Response("from file") }',
        }),
      })
      expect(put.status).toBe(201)

      const body = (await (await eject(app)).json()) as { versionId: string }
      const version = await mockDb.getWorkflowVersionById(body.versionId)
      const bundle = JSON.parse(version!.source!) as {
        entry: string
        files: { path: string; source: string; role: string }[]
      }
      expect(bundle.files.map((f) => f.path)).not.toContain('handlers.ts')
      expect(bundle.files.find((f) => f.path === bundle.entry)!.source).toContain('"from file"')
      // The drift baseline is the hash of what is stored, so an untouched
      // eject never reads as modified.
      expect(bundleHash(bundle)).toBe(version!.baseGeneratedHash)
    })

    it('rejects functions', async () => {
      await mockDb.updateWorkflow('wf-1', { kind: 'script' })
      const res = await eject(app)
      expect(res.status).toBe(400)
    })
  })

  describe('GET /api/workflows/:workflowId/source', () => {
    it('returns a generated view for generated-mode versions', async () => {
      const res = await app.request(url('/api/workflows/wf-1/source'))
      expect(res.status).toBe(200)
      const body = (await res.json()) as { sourceMode: string; files: { path: string }[] }
      expect(body.sourceMode).toBe('generated')
      expect(body.files.some((f) => f.path === 'worker.ts')).toBe(true)
    })

    it('returns the stored bundle for ejected versions', async () => {
      await eject(app)
      const res = await app.request(url('/api/workflows/wf-1/source'))
      const body = (await res.json()) as { sourceMode: string; entry: string }
      expect(body.sourceMode).toBe('ejected')
      expect(body.entry).toBe('worker.ts')
    })
  })

  describe('GET /source with an unconfigured node', () => {
    // A sub_script with no worker selected generates `env..fetch(...)`, which
    // does not parse. The workspace still has to open — that is where the user
    // sees what is wrong — so the read reports the issue instead of refusing.
    const irWithEmptyBinding = {
      ...validIR,
      nodes: [
        ...validIR.nodes,
        {
          id: 'call',
          type: 'sub_script',
          name: 'call',
          position: { x: 200, y: 0 },
          version: '1.0.0',
          provider: 'cloudflare',
          data: { workerName: '', method: 'POST', url: 'https://invoke/' },
        },
      ],
      edges: [{ id: 'e1', source: 'step-1', target: 'call' }],
    }

    beforeEach(async () => {
      // Written straight to the store: saving this IR is refused now, but
      // rows predating the rule still have to open.
      const version = await mockDb.createVersion({
        id: 'v-invalid',
        workflowId: 'wf-1',
        ir: JSON.stringify(irWithEmptyBinding),
      })
      await mockDb.updateWorkflow('wf-1', { currentVersionId: version.id })
    })

    it('still returns the source, with the validation issue attached', async () => {
      const res = await app.request(url('/api/workflows/wf-1/source'))
      expect(res.status).toBe(200)
      const body = (await res.json()) as {
        files: { path: string }[]
        diagnostics: { source: string; nodeId?: string; message: string }[]
      }
      expect(body.files.some((f) => f.path === 'worker.ts')).toBe(true)

      // Both halves are reported: the cause (an unconfigured node) and the
      // effect (the `env..fetch(` it generates). Dropping either leaves the
      // workspace showing broken code with no explanation, or an explanation
      // with no marker on the file.
      const ir = body.diagnostics.find((d) => d.source === 'ir')
      expect(ir).toMatchObject({ nodeId: 'call' })
      expect(ir!.message).toContain('no worker selected')

      const compile = body.diagnostics.find((d) => d.source === 'compile')
      expect(compile).toMatchObject({ path: 'worker.ts' })
    })

    it('still refuses to eject a workflow the provider cannot deploy', async () => {
      // 400 from validation, before any code is generated — the compile gate
      // is covered separately below, so neither test can pass for the other's
      // reason.
      const res = await eject(app)
      expect(res.status).toBe(400)
      const body = (await res.json()) as { error: string; details: { message: string }[] }
      expect(body.error).toBe('IR validation failed')
      expect(body.details.some((d) => d.message.includes('no worker selected'))).toBe(true)
    })

    it('names the file a compile error came from', async () => {
      const broken = {
        ...validIR,
        nodes: [{ ...validIR.nodes[0], data: { code: 'const x = ;' } }],
      }
      const version = await mockDb.createVersion({
        id: 'v-broken',
        workflowId: 'wf-1',
        ir: JSON.stringify(broken),
      })
      await mockDb.updateWorkflow('wf-1', { currentVersionId: version.id })

      const res = await eject(app)
      expect(res.status).toBe(422)
      const body = (await res.json()) as { error: string }
      // Without the path, a multi-file project gets "Unexpected token (3:10)"
      // and no way to tell which file it came from.
      expect(body.error).toMatch(/^Compile error in \S+\.ts:/)
    })

    it('reports no issues for a healthy workflow', async () => {
      const version = await mockDb.createVersion({
        id: 'v-ok',
        workflowId: 'wf-1',
        ir: JSON.stringify(validIR),
      })
      await mockDb.updateWorkflow('wf-1', { currentVersionId: version.id })
      const res = await app.request(url('/api/workflows/wf-1/source'))
      const body = (await res.json()) as { diagnostics: unknown[] }
      expect(body.diagnostics).toEqual([])
    })
  })

  describe('PUT /api/workflows/:workflowId/source', () => {
    it('rejects generated-mode versions', async () => {
      const res = await app.request(url('/api/workflows/wf-1/source'), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          entry: 'worker.ts',
          files: [{ path: 'worker.ts', source: 'x', role: 'entry' }],
        }),
      })
      expect(res.status).toBe(400)
    })

    it('accepts an edit inside a module region', async () => {
      await eject(app)
      const getRes = await app.request(url('/api/workflows/wf-1/source'))
      const stored = (await getRes.json()) as {
        entry: string
        files: { path: string; source: string; role: string }[]
      }
      const files = stored.files.map((f) =>
        f.path === 'nodes/Hello.ts'
          ? { ...f, source: f.source.replace('return 1;', 'return 42;') }
          : f,
      )
      const res = await app.request(url('/api/workflows/wf-1/source'), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entry: stored.entry, files }),
      })
      expect(res.status).toBe(200)

      const after = await app.request(url('/api/workflows/wf-1/source'))
      const afterBody = (await after.json()) as { files: { path: string; source: string }[] }
      expect(afterBody.files.find((f) => f.path === 'nodes/Hello.ts')!.source).toContain(
        'return 42;',
      )
    })

    it('rejects a renamed step.do label with drift details', async () => {
      await eject(app)
      const getRes = await app.request(url('/api/workflows/wf-1/source'))
      const stored = (await getRes.json()) as {
        entry: string
        files: { path: string; source: string; role: string }[]
      }
      const files = stored.files.map((f) =>
        f.path === stored.entry
          ? { ...f, source: f.source.replace('step.do("step-1"', 'step.do("Renamed"') }
          : f,
      )
      const res = await app.request(url('/api/workflows/wf-1/source'), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entry: stored.entry, files }),
      })
      expect(res.status).toBe(422)
      const body = (await res.json()) as { details: { nodeId?: string }[] }
      expect(body.details.some((d) => d.nodeId === 'step-1')).toBe(true)
    })

    it('rejects a module file claiming a reserved toolchain filename', async () => {
      await eject(app)
      const getRes = await app.request(url('/api/workflows/wf-1/source'))
      const stored = (await getRes.json()) as {
        entry: string
        files: { path: string; source: string; role: string }[]
      }
      const files = [
        ...stored.files,
        { path: 'nodes/package.json', source: 'export const x = 1;', role: 'module' },
      ]
      const res = await app.request(url('/api/workflows/wf-1/source'), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entry: stored.entry, files }),
      })
      expect(res.status).toBe(422)
      const body = (await res.json()) as { error: string }
      expect(body.error).toContain('Reserved toolchain filename')
    })

    it('rejects source that does not compile', async () => {
      await eject(app)
      const getRes = await app.request(url('/api/workflows/wf-1/source'))
      const stored = (await getRes.json()) as {
        entry: string
        files: { path: string; source: string; role: string }[]
      }
      const files = stored.files.map((f) =>
        f.path === 'nodes/Hello.ts' ? { ...f, source: f.source + '\nconst broken = {' } : f,
      )
      const res = await app.request(url('/api/workflows/wf-1/source'), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entry: stored.entry, files }),
      })
      expect(res.status).toBe(422)
    })
  })
})

describe('canvas saves after eject', () => {
  let app: ReturnType<typeof createTestApp>

  beforeEach(async () => {
    resetStore()
    app = createTestApp()
    await seedWorkflowWithVersion(app)
  })

  it('overwriting an undeployed ejected version resets it to generated mode', async () => {
    const ejectRes = await eject(app)
    const { versionId } = (await ejectRes.json()) as { versionId: string }

    const changedIR = {
      ...validIR,
      nodes: [{ ...validIR.nodes[0]!, data: { code: 'return 2;' } }],
    }
    const saveRes = await app.request(url('/api/workflows/wf-1/versions'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ir: changedIR }),
    })
    expect(saveRes.status).toBe(200)

    const row = await mockDb.getWorkflowVersionById(versionId)
    expect(row?.sourceMode).toBe('generated')
    expect(row?.source).toBeNull()
    expect(row?.manifest).toBeNull()
    expect(row?.baseGeneratedHash).toBeNull()
  })

  it('a no-op canvas save keeps the ejected version intact', async () => {
    const ejectRes = await eject(app)
    const { versionId } = (await ejectRes.json()) as { versionId: string }

    const saveRes = await app.request(url('/api/workflows/wf-1/versions'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ir: validIR }),
    })
    expect(saveRes.status).toBe(200)

    const row = await mockDb.getWorkflowVersionById(versionId)
    expect(row?.sourceMode).toBe('ejected')
    expect(row?.source).toBeTruthy()
  })
})
