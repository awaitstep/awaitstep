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

describe('source routes', () => {
  let app: ReturnType<typeof createTestApp>

  beforeEach(async () => {
    resetStore()
    app = createTestApp()
    await seedWorkflowWithVersion(app)
  })

  describe('GET /api/workflows/:workflowId/source', () => {
    it('generates the deployable view from the current version', async () => {
      const res = await app.request(url('/api/workflows/wf-1/source'))
      expect(res.status).toBe(200)
      const body = (await res.json()) as { entry: string; files: { path: string }[] }
      expect(body.entry).toBe('worker.ts')
      expect(body.files.some((f) => f.path === 'worker.ts')).toBe(true)
    })

    it('reads the version row once, beside the file rows', async () => {
      // The route used to fetch the row to decide whether the version owned
      // its source, then hand the id to the prepare, which fetched it again —
      // two serialized round trips for one row.
      const versions = vi.spyOn(mockDb, 'getWorkflowVersionById')
      const files = vi.spyOn(mockDb, 'listWorkflowFiles')
      const res = await app.request(url('/api/workflows/wf-1/source'))
      expect(res.status).toBe(200)
      expect(versions).toHaveBeenCalledTimes(1)
      expect(files).toHaveBeenCalledTimes(1)
      vi.restoreAllMocks()
    })

    it('still answers 404 for a version belonging to another workflow', async () => {
      // The 404 moved into the prepare with the row read; it has to arrive
      // with the same status it did from the route's own check.
      await mockDb.createWorkflow({
        id: 'wf-2',
        projectId: TEST_PROJECT_ID,
        createdBy: TEST_USER_ID,
        name: 'Other',
      })
      const other = await mockDb.createVersion({
        id: 'v-other',
        workflowId: 'wf-2',
        ir: JSON.stringify(validIR),
      })
      const res = await app.request(url(`/api/workflows/wf-1/source?versionId=${other.id}`))
      expect(res.status).toBe(404)
      expect((await res.json()) as { error: string }).toMatchObject({ error: 'Version not found' })
    })

    it('compiles a project handlers.ts into the generated entry', async () => {
      const put = await app.request(url('/api/workflows/wf-1/files/handlers.ts'), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          source: '@fetch function handler(request, env) { return new Response("from file") }',
        }),
      })
      expect(put.status).toBe(201)

      const res = await app.request(url('/api/workflows/wf-1/source'))
      const body = (await res.json()) as {
        entry: string
        files: { path: string; source: string }[]
      }
      // The annotation file is input to the entry — the read shows both the
      // project file as it was written and the entry it compiled into.
      expect(body.files.map((f) => f.path)).toContain('handlers.ts')
      expect(body.files.find((f) => f.path === body.entry)!.source).toContain('"from file"')
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

      const res = await app.request(url('/api/workflows/wf-1/source'))
      expect(res.status).toBe(200)
      const body = (await res.json()) as { diagnostics: { source: string; path?: string }[] }
      // Without the path, a multi-file project gets "Unexpected token (3:10)"
      // and no way to tell which file it came from.
      const compile = body.diagnostics.find((d) => d.source === 'compile')
      expect(compile?.path).toMatch(/\.ts$/)
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
})
