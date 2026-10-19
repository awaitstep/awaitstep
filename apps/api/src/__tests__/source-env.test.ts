import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createTestApp, resetStore, TEST_USER_ID, TEST_PROJECT_ID, mockDb } from './helpers.js'
import { isPrepareError, prepareWorkflow } from '../lib/workflow-prepare.js'

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

type Resolved = Awaited<ReturnType<typeof mockDb.resolveEnvVars>>

describe('source and eject with unresolved env vars', () => {
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
    const saved = await app.request(url('/api/workflows/wf-1/versions'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ir: validIR }),
    })
    expect(saved.status).toBe(201)
    // A declared secret whose value was never set: a deploy must refuse,
    // a read of the source must not.
    vi.spyOn(mockDb, 'resolveEnvVars').mockResolvedValue({
      ALICLOUD_ACCESS_KEY_ID: { value: undefined, isSecret: true },
    } as unknown as Resolved)
  })

  it('GET /source renders the generated view without env values', async () => {
    const res = await app.request(url('/api/workflows/wf-1/source'))
    expect(res.status).toBe(200)
    const body = (await res.json()) as { entry: string; files: { path: string }[] }
    expect(body.files.map((f) => f.path)).toContain(body.entry)
  })

  it('POST /eject materializes the source without env values', async () => {
    const res = await app.request(url('/api/workflows/wf-1/eject'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    })
    expect(res.status).toBe(201)
  })

  it('preparing for a deploy still refuses until every env var resolves', async () => {
    const workflow = await mockDb.getWorkflowById('wf-1')
    const base = {
      db: mockDb,
      workflow: workflow!,
      organizationId: 'org-1',
      projectId: TEST_PROJECT_ID,
    }
    const forDeploy = await prepareWorkflow(base)
    expect(isPrepareError(forDeploy) && forDeploy.status).toBe(400)
    expect(isPrepareError(forDeploy) && forDeploy.error).toMatch(
      /Missing or unresolved environment variables: ALICLOUD_ACCESS_KEY_ID/,
    )
    for (const mode of ['build', 'read'] as const) {
      const prepared = await prepareWorkflow({ ...base, mode })
      expect(isPrepareError(prepared), mode).toBe(false)
    }
  })
})
