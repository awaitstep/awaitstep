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
    it('does not apply the deploy provider’s compatibility checks to the presentation view', async () => {
      const version = await mockDb.createVersion({
        id: 'v-neutral',
        workflowId: 'wf-1',
        ir: JSON.stringify({
          ...validIR,
          nodes: [{ ...validIR.nodes[0], provider: 'inngest' }],
          runtime: {
            resources: [{ name: 'STATE', kind: 'durable_object', provider: 'inngest' }],
          },
        }),
      })
      await mockDb.updateWorkflow('wf-1', { currentVersionId: version.id })
      const res = await app.request(url('/api/workflows/wf-1/source'))
      expect(res.status).toBe(200)
      const body = (await res.json()) as {
        diagnostics: { message: string }[]
        requirements: { id: string }[]
      }
      expect(body.diagnostics.map((d) => d.message)).not.toContain(
        'Node "Hello" is not supported by this provider',
      )
      expect(body.requirements.some((r) => r.id === 'cloudflare')).toBe(false)
    })

    it('generates the portable presentation view from the current version', async () => {
      const res = await app.request(url('/api/workflows/wf-1/source'))
      expect(res.status).toBe(200)
      const body = (await res.json()) as {
        entry: string
        primary: string
        requirements: unknown[]
        files: { path: string }[]
      }
      // The IDE/local-development view is provider-neutral: no worker, entry
      // or platform adapter. Those are deploy artifacts.
      expect(body.entry).toBe('awaitstep/workflow.ts')
      expect(body.primary).toBe('awaitstep/workflow.ts')
      expect(body.files.some((f) => f.path === 'worker.ts')).toBe(false)
      expect(body.files.some((f) => f.path === 'awaitstep/entry.ts')).toBe(false)
      expect(body.files.some((f) => f.path === 'awaitstep/platform.ts')).toBe(false)
      expect(body.files.some((f) => f.path === 'awaitstep/workflow.ts')).toBe(true)
      expect(body.requirements).toEqual([])
    })

    it('reports provider-scoped primitives as requirements and diagnostics', async () => {
      const providerIR = {
        ...validIR,
        nodes: [
          {
            ...validIR.nodes[0]!,
            data: { code: "import { inngest } from '#awaitstep/inngest'\nreturn 1;" },
          },
        ],
      }
      const version = await mockDb.createVersion({
        id: 'v-inngest',
        workflowId: 'wf-1',
        ir: JSON.stringify(providerIR),
      })
      await mockDb.updateWorkflow('wf-1', { currentVersionId: version.id })

      const res = await app.request(url('/api/workflows/wf-1/source'))
      expect(res.status).toBe(200)
      const body = (await res.json()) as {
        requirements: { kind: string; id: string; label: string }[]
        diagnostics: { source: string; message: string }[]
      }
      expect(body.requirements).toContainEqual(
        expect.objectContaining({ kind: 'provider', id: 'inngest' }),
      )
      // A read is lenient: the workspace still opens, with the reason.
      expect(body.diagnostics).toContainEqual(
        expect.objectContaining({
          source: 'provider',
          message: expect.stringContaining('inngest'),
        }),
      )
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

    it('treats an empty versionId as none asked for: the current version is read', async () => {
      const res = await app.request(url('/api/workflows/wf-1/source?versionId='))
      expect(res.status).toBe(200)
      expect(((await res.json()) as { versionId: string | null }).versionId).not.toBeNull()
    })

    it('returns a project handlers.ts as a file, not compiled into the portable entry', async () => {
      // These tests model the legacy annotation file, which cannot sit beside
      // the HTTP entry a fresh first save seeds: drop the seeded module first.
      await app.request(url('/api/workflows/wf-1/files/handlers/fetch.ts'), { method: 'DELETE' })
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
      // The presentation view is the portable workflow plus the person's own
      // files. Compiling handlers.ts into an entry is a deploy concern.
      expect(body.files.map((f) => f.path)).toContain('handlers.ts')
      expect(body.entry).toBe('awaitstep/workflow.ts')
      expect(body.files.find((f) => f.path === body.entry)!.source).not.toContain('"from file"')
    })
  })

  describe('GET /source with an unconfigured node', () => {
    // A sub_script with no worker selected no longer emits a syntax error —
    // the primitive call is valid — but the workflow still has to open, with
    // the IR finding that names the node.
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
        files: { path: string; source: string }[]
        diagnostics: { source: string; nodeId?: string; message: string }[]
      }
      expect(body.files.some((f) => f.path === 'awaitstep/workflow.ts')).toBe(true)

      // The cause is the IR finding; it marks the node on the canvas. The
      // generated code is still shown, and names the binding it resolved.
      const ir = body.diagnostics.find((d) => d.source === 'ir')
      expect(ir).toMatchObject({ nodeId: 'call' })
      expect(ir!.message).toContain('no script selected')

      const workflow = body.files.find((f) => f.path === 'awaitstep/workflow.ts')!
      expect(workflow.source).toContain('flow.callScript({ script: "",')
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
      const body = (await res.json()) as {
        diagnostics: { source: string; path?: string; nodeId?: string }[]
      }
      // Without the path, a multi-file project gets "Unexpected token (3:10)"
      // and no way to tell which file it came from; the node lets the editor
      // open the step body the module was generated from.
      const compile = body.diagnostics.find((d) => d.source === 'compile')
      expect(compile?.path).toMatch(/^steps\/.*\.ts$/)
      expect(compile?.nodeId).toBe('step-1')
    })

    it('names the member of a merged step whose module fails to compile, not its leader', async () => {
      // Two adjacent plain steps coalesce into one durable step under the
      // leader's label; each still has its own module, and the broken one
      // is the file the person has to open.
      const chain = {
        ...validIR,
        nodes: [
          validIR.nodes[0],
          {
            id: 'step-2',
            type: 'step',
            name: 'World',
            position: { x: 0, y: 100 },
            version: '1.0.0',
            provider: 'cloudflare',
            data: { code: 'const y = ;' },
          },
        ],
        edges: [{ id: 'e1', source: 'step-1', target: 'step-2' }],
      }
      const version = await mockDb.createVersion({
        id: 'v-chain',
        workflowId: 'wf-1',
        ir: JSON.stringify(chain),
      })
      await mockDb.updateWorkflow('wf-1', { currentVersionId: version.id })

      const res = await app.request(url('/api/workflows/wf-1/source'))
      const body = (await res.json()) as {
        manifest: { steps: { nodeId: string; coalescedInto?: string; filePath?: string }[] }
        diagnostics: { source: string; path?: string; nodeId?: string }[]
      }
      const member = body.manifest.steps.find((s) => s.nodeId === 'step-2')
      expect(member?.coalescedInto).toBe('step-1')
      const compile = body.diagnostics.filter((d) => d.source === 'compile')
      expect(compile).toEqual([
        expect.objectContaining({ path: member?.filePath, nodeId: 'step-2' }),
      ])
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
