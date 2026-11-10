import { describe, it, expect, beforeEach } from 'vitest'
import { isPrepareError, prepareWorkflow } from '../lib/workflow-prepare.js'
import { resetStore, TEST_ORG_ID, TEST_USER_ID, TEST_PROJECT_ID, mockDb } from './helpers.js'

/**
 * The refusals a strict prepare owes its callers. A deploy is the only
 * caller left that cannot proceed on a broken workflow — `GET /source` and
 * `POST /source/check` report the same problems as diagnostics instead — so
 * these are the tests that keep "it passed the check, then the deploy
 * refused it" honest about which half refuses.
 */
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

async function prepareStoredIr(ir: unknown, provider?: string) {
  const version = await mockDb.createVersion({
    id: 'v-1',
    workflowId: 'wf-1',
    ir: JSON.stringify(ir),
  })
  await mockDb.updateWorkflow('wf-1', { currentVersionId: version.id })
  const workflow = (await mockDb.getWorkflowById('wf-1'))!
  return prepareWorkflow({
    db: mockDb,
    workflow,
    organizationId: TEST_ORG_ID,
    projectId: TEST_PROJECT_ID,
    ...(provider && { provider }),
  })
}

describe('a strict prepare', () => {
  beforeEach(async () => {
    resetStore()
    await mockDb.createWorkflow({
      id: 'wf-1',
      projectId: TEST_PROJECT_ID,
      createdBy: TEST_USER_ID,
      name: 'Test',
    })
  })

  it('refuses a stored IR that fails its schema, with the errors attached', async () => {
    const prepared = await prepareStoredIr({ ...validIR, nodes: [{ id: 'step-1' }] })
    expect(isPrepareError(prepared) && prepared.error).toBe('IR validation failed')
    expect(isPrepareError(prepared) && prepared.status).toBe(400)
    expect(isPrepareError(prepared) && prepared.details).toBeTruthy()
  })

  it('refuses a node the provider cannot deploy as configured', async () => {
    // A sub_script with no worker selected: the graph is schema-valid, so
    // only the provider's own validation catches it.
    const prepared = await prepareStoredIr({
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
    })
    expect(isPrepareError(prepared) && prepared.error).toBe('IR validation failed')
    expect(isPrepareError(prepared) && prepared.status).toBe(400)
    const details = isPrepareError(prepared) ? (prepared.details as { message: string }[]) : []
    expect(details.some((d) => d.message.includes('no script selected'))).toBe(true)
  })

  it('names the file of code that will not compile', async () => {
    const prepared = await prepareStoredIr({
      ...validIR,
      nodes: [{ ...validIR.nodes[0], data: { code: 'const x = ;' } }],
    })
    expect(isPrepareError(prepared) && prepared.status).toBe(422)
    // Without the path, a multi-file project gets "Unexpected token (3:10)"
    // and no way to tell which file it came from.
    expect(isPrepareError(prepared) && prepared.error).toMatch(/^Compile error in \S+\.ts:/)
  })

  it('prepares a healthy workflow, generating the bundle from the IR', async () => {
    const prepared = await prepareStoredIr(validIR)
    expect(isPrepareError(prepared)).toBe(false)
    if (isPrepareError(prepared)) return
    expect(prepared.bundle.files.map((f) => f.path)).toContain('worker.ts')
    expect(prepared.diagnostics).toEqual([])
  })

  it('uses the artifact’s runtime provider with no connection', async () => {
    const prepared = await prepareStoredIr({
      ...validIR,
      runtime: { provider: 'cloudflare' },
    })
    expect(isPrepareError(prepared)).toBe(false)
  })

  it('refuses a connection that disagrees with the artifact target', async () => {
    const prepared = await prepareStoredIr(
      { ...validIR, runtime: { provider: 'cloudflare' } },
      'inngest',
    )
    expect(isPrepareError(prepared)).toBe(true)
    if (!isPrepareError(prepared)) return
    expect(prepared.status).toBe(400)
    expect(prepared.error).toContain('targets cloudflare')
  })
})
