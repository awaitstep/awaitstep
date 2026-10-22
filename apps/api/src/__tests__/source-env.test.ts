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

describe('source with unresolved env vars', () => {
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
    // A declared secret pointing at a project variable that does not exist:
    // a deploy must refuse, a read of the source must not. Stubbed at the
    // storage layer so the resolution itself is the code under test —
    // findEnvVarsByNames finds nothing, so the reference stays unresolved.
    vi.spyOn(mockDb, 'getWorkflowEnvVars').mockResolvedValue([
      {
        name: 'ALICLOUD_ACCESS_KEY_ID',
        value: '{{global.env.ALICLOUD_ACCESS_KEY_ID}}',
        isSecret: true,
      },
    ])
  })

  it('GET /source renders the generated view without env values', async () => {
    const res = await app.request(url('/api/workflows/wf-1/source'))
    expect(res.status).toBe(200)
    const body = (await res.json()) as { entry: string; files: { path: string }[] }
    expect(body.files.map((f) => f.path)).toContain(body.entry)
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
    // A read of the same workflow still succeeds: the names come from the
    // IR, and only a deploy needs the values.
    const forRead = await prepareWorkflow({ ...base, mode: 'read' })
    expect(isPrepareError(forRead)).toBe(false)
  })

  it('reports the unresolved variable as a diagnostic instead of dropping it', async () => {
    // A read used to ignore the env result entirely, so a check could call
    // this workflow healthy and the deploy then refuse it — the likeliest
    // "it passed, then it failed" surprise for anything automated.
    const workflow = await mockDb.getWorkflowById('wf-1')
    const prepared = await prepareWorkflow({
      db: mockDb,
      workflow: workflow!,
      organizationId: 'org-1',
      projectId: TEST_PROJECT_ID,
      mode: 'read',
    })

    expect(isPrepareError(prepared)).toBe(false)
    if (isPrepareError(prepared)) return
    const env = prepared.diagnostics.filter((d) => d.source === 'env')
    expect(env).toHaveLength(1)
    expect(env[0]!.message).toContain('ALICLOUD_ACCESS_KEY_ID')
  })

  it('never puts a variable value in a diagnostic', async () => {
    // Diagnostics travel to an editor, an agent and a log. Names are the
    // whole point; a value would be a leak with no purpose.
    //
    // The variable has to be *unresolved* for a diagnostic to exist at all.
    // An earlier version of this test used a plain value, so nothing was
    // produced and it asserted against an empty list — it would have passed
    // however badly the message leaked.
    const secret = 'sk-live-should-never-appear'
    vi.spyOn(mockDb, 'getWorkflowEnvVars').mockResolvedValue([
      { name: 'ALICLOUD_ACCESS_KEY_ID', value: `{{global.env.MISSING}}`, isSecret: true },
      { name: 'OTHER', value: secret, isSecret: true },
    ])
    const workflow = await mockDb.getWorkflowById('wf-1')
    const prepared = await prepareWorkflow({
      db: mockDb,
      workflow: workflow!,
      organizationId: 'org-1',
      projectId: TEST_PROJECT_ID,
      mode: 'read',
    })

    expect(isPrepareError(prepared)).toBe(false)
    if (isPrepareError(prepared)) throw new Error('expected a prepared workflow')
    const env = prepared.diagnostics.filter((d) => d.source === 'env')
    expect(env.length).toBeGreaterThan(0)
    expect(JSON.stringify(prepared.diagnostics)).not.toContain(secret)
  })
})
