import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import type { WorkflowProvider, WorkflowRunDetail } from '@awaitstep/codegen'
import { syncActiveRuns, syncRunById } from '../lib/run-sync.js'
import {
  createTestApp,
  mockDb,
  resetStore,
  sentNotifications,
  TEST_ORG_ID,
  TEST_PROJECT_ID,
  TEST_USER_ID,
} from './helpers.js'

const MANIFEST = {
  irHash: 'x',
  steps: [
    { nodeId: 'step-1', stepName: 'step-1', kind: 'do', varName: 'Hello' },
    { nodeId: 'step-2', coalescedInto: 'step-1', varName: 'Follow' },
    { nodeId: 'loop-1', stepName: 'work', kind: 'do', varName: 'Work' },
  ],
}

async function seedActiveRun() {
  await mockDb.createWorkflow({
    id: 'wf-1',
    projectId: TEST_PROJECT_ID,
    createdBy: TEST_USER_ID,
    name: 'My Flow',
  })
  await mockDb.createConnection({
    id: 'conn-1',
    organizationId: TEST_ORG_ID,
    provider: 'cloudflare',
    name: 'CF',
    createdBy: TEST_USER_ID,
    credentials: JSON.stringify({ accountId: 'acc', apiToken: 'tok' }),
  })
  await mockDb.createDeployment({
    id: 'dep-1',
    workflowId: 'wf-1',
    versionId: 'v-1',
    versionNumber: 1,
    connectionId: 'conn-1',
    serviceName: 'svc',
    status: 'success',
    configSnapshot: JSON.stringify({ workersSubdomain: 'x', stepManifest: MANIFEST }),
  })
  await mockDb.createRun({
    id: 'run-1',
    workflowId: 'wf-1',
    versionId: 'v-1',
    versionNumber: 1,
    connectionId: 'conn-1',
    instanceId: 'inst-1',
    status: 'running',
  })
}

function stubProvider(detail: Partial<WorkflowRunDetail>): WorkflowProvider {
  return {
    getRunDetail: async () =>
      ({
        instanceId: 'inst-1',
        status: 'running',
        steps: [],
        ...detail,
      }) as WorkflowRunDetail,
  } as unknown as WorkflowProvider
}

describe('syncActiveRuns', () => {
  beforeEach(() => {
    resetStore()
  })

  it('updates run status and upserts manifest-mapped steps', async () => {
    await seedActiveRun()
    const provider = stubProvider({
      status: 'complete',
      output: { ok: true },
      endedAt: '2026-10-08T00:00:09Z',
      stepCount: 3,
      steps: [
        {
          name: 'step-1',
          kind: 'do',
          index: 1,
          status: 'complete',
          start: '2026-10-08T00:00:00Z',
          end: '2026-10-08T00:00:02Z',
          attemptCount: 1,
        },
        { name: 'work [0]', kind: 'do', index: 1, status: 'complete', attemptCount: 2 },
        { name: 'mystery', kind: 'do', index: 1, status: 'running', attemptCount: 1 },
      ],
    })

    await syncActiveRuns(mockDb, { provider })

    const run = await mockDb.getWorkflowRunById('run-1')
    expect(run!.status).toBe('complete')
    expect(run!.output).toBe(JSON.stringify({ ok: true }))

    const { steps } = await mockDb.listRunSteps('run-1', 'wf-1')
    expect(steps).toHaveLength(3)
    const byName = new Map(steps.map((s) => [s.stepName, s]))
    expect(byName.get('step-1')!.nodeId).toBe('step-1')
    // Loop iteration labels map back through the suffix-stripped base label.
    expect(byName.get('work [0]')!.nodeId).toBe('loop-1')
    // Labels the manifest cannot claim keep the step without attribution.
    expect(byName.get('mystery')!.nodeId).toBeNull()
  })

  it('converges across ticks instead of duplicating step rows', async () => {
    await seedActiveRun()
    const running = stubProvider({
      steps: [{ name: 'step-1', kind: 'do', index: 1, status: 'running', attemptCount: 1 }],
    })
    const done = stubProvider({
      status: 'complete',
      steps: [{ name: 'step-1', kind: 'do', index: 1, status: 'complete', attemptCount: 2 }],
    })

    await syncActiveRuns(mockDb, { provider: running })
    await syncActiveRuns(mockDb, { provider: done })

    const { steps } = await mockDb.listRunSteps('run-1', 'wf-1')
    expect(steps).toHaveLength(1)
    expect(steps[0]!.status).toBe('complete')
    expect(steps[0]!.attemptCount).toBe(2)
  })

  it('tells the workflow’s watchers when a run moves to errored, folding by the hour', async () => {
    await seedActiveRun()
    await syncActiveRuns(mockDb, {
      provider: stubProvider({
        status: 'errored',
        steps: [
          { name: 'step-1', kind: 'do', index: 1, status: 'complete', attemptCount: 1 },
          { name: 'work [0]', kind: 'do', index: 1, status: 'errored', attemptCount: 3 },
        ],
      }),
    })
    expect(sentNotifications()).toHaveLength(1)
    expect(sentNotifications()[0]).toMatchObject({
      event: 'run.failed',
      kind: 'failure',
      needsAction: true,
      organizationId: TEST_ORG_ID,
      projectId: TEST_PROJECT_ID,
      meta: { workflow: 'My Flow', step: 'work [0]' },
      recipients: { workflowWatchers: { workflowId: 'wf-1' } },
      onRepeat: 'fold',
    })
    expect(sentNotifications()[0]!.groupKey).toMatch(/^run\.failed:wf-1:\d{4}-\d{2}-\d{2}T\d{2}$/)
  })

  it('tells nobody when another sync moved the run first', async () => {
    await seedActiveRun()
    const beaten = vi.spyOn(mockDb, 'updateRunFromStatus').mockResolvedValueOnce(false)
    await syncActiveRuns(mockDb, { provider: stubProvider({ status: 'errored' }) })
    beaten.mockRestore()
    expect(sentNotifications()).toEqual([])
  })

  it('tells nobody of a run a person terminated', async () => {
    await seedActiveRun()
    await syncActiveRuns(mockDb, { provider: stubProvider({ status: 'terminated' }) })
    expect((await mockDb.getWorkflowRunById('run-1'))!.status).toBe('terminated')
    expect(sentNotifications()).toEqual([])
  })

  it('is a no-op for providers without getRunDetail', async () => {
    await seedActiveRun()
    const provider = {} as WorkflowProvider
    await syncActiveRuns(mockDb, { provider })
    expect((await mockDb.getWorkflowRunById('run-1'))!.status).toBe('running')
  })

  it('a failing run detail call does not block other runs', async () => {
    await seedActiveRun()
    await mockDb.createRun({
      id: 'run-2',
      workflowId: 'wf-1',
      versionId: 'v-1',
      versionNumber: 1,
      connectionId: 'conn-1',
      instanceId: 'inst-2',
      status: 'running',
    })
    let calls = 0
    const provider = {
      getRunDetail: async (instanceId: string) => {
        calls++
        if (instanceId === 'inst-1') throw new Error('CF unavailable')
        return { instanceId, status: 'complete', steps: [] } as unknown as WorkflowRunDetail
      },
    } as unknown as WorkflowProvider

    await syncActiveRuns(mockDb, { provider })
    expect(calls).toBe(2)
    expect((await mockDb.getWorkflowRunById('run-2'))!.status).toBe('complete')
    expect((await mockDb.getWorkflowRunById('run-1'))!.status).toBe('running')
  })
})

describe('GET /api/workflows/:workflowId/runs/:runId/steps', () => {
  beforeEach(() => {
    resetStore()
  })

  it('returns synced steps for a run', async () => {
    const app = createTestApp()
    await seedActiveRun()
    await mockDb.upsertRunSteps('run-1', [
      {
        id: 'rs-1',
        nodeId: 'step-1',
        stepName: 'step-1',
        kind: 'do',
        stepIndex: 1,
        status: 'complete',
        attemptCount: 1,
      },
    ])
    const res = await app.request(
      `/api/workflows/wf-1/runs/run-1/steps?projectId=${TEST_PROJECT_ID}`,
    )
    expect(res.status).toBe(200)
    const body = (await res.json()) as {
      data: { stepName: string; nodeId: string | null }[]
      coalescedInto: Record<string, string>
    }
    expect(body.data).toHaveLength(1)
    expect(body.data[0]!.nodeId).toBe('step-1')
    // Members of a merged step link to the leader through the deploy manifest.
    expect(body.coalescedInto).toEqual({ 'step-2': 'step-1' })
  })

  it('reads as empty for a run that is not in the workflow', async () => {
    const app = createTestApp()
    await seedActiveRun()
    await mockDb.createWorkflow({
      id: 'wf-2',
      projectId: TEST_PROJECT_ID,
      createdBy: TEST_USER_ID,
      name: 'Other',
    })
    const res = await app.request(
      `/api/workflows/wf-2/runs/run-1/steps?projectId=${TEST_PROJECT_ID}`,
    )
    expect(res.status).toBe(200)
    expect(((await res.json()) as { data: unknown[] }).data).toEqual([])
  })
})

describe('syncRunById', () => {
  beforeEach(() => {
    resetStore()
  })

  it('reconciles one run on demand and returns the provider detail', async () => {
    await seedActiveRun()
    const provider = stubProvider({
      status: 'complete',
      steps: [{ name: 'step-1', kind: 'do', index: 1, status: 'complete', attemptCount: 1 }],
    })
    const detail = await syncRunById(mockDb, 'run-1', 'wf-1', { provider })
    expect(detail?.status).toBe('complete')
    expect((await mockDb.getWorkflowRunById('run-1'))!.status).toBe('complete')
    expect((await mockDb.listRunSteps('run-1', 'wf-1')).steps).toHaveLength(1)
  })

  it('returns null for a run outside the workflow', async () => {
    await seedActiveRun()
    const provider = stubProvider({ status: 'complete' })
    expect(await syncRunById(mockDb, 'run-1', 'other-wf', { provider })).toBeNull()
  })
})

describe('GET /api/workflows/:workflowId/runs/:runId/stream', () => {
  beforeEach(() => {
    resetStore()
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('streams run and step events, writes through, and closes with done once terminal', async () => {
    const app = createTestApp()
    await seedActiveRun()
    // The route reconciles through the real Cloudflare adapter; stand in for
    // the instance-describe endpoint with a completed instance.
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            success: true,
            result: {
              id: 'inst-1',
              status: 'complete',
              step_count: 1,
              steps: [
                {
                  type: 'step',
                  name: 'step-1',
                  success: true,
                  start: '2026-10-17T00:00:00Z',
                  end: '2026-10-17T00:00:01Z',
                },
              ],
            },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      ),
    )
    const res = await app.request(
      `/api/workflows/wf-1/runs/run-1/stream?projectId=${TEST_PROJECT_ID}`,
    )
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toContain('text/event-stream')
    const text = await res.text()
    const order = ['event: run', 'event: step', 'event: done'].map((m) => text.indexOf(m))
    expect(order.every((i) => i >= 0)).toBe(true)
    expect(order).toEqual([...order].sort((a, b) => a - b))
    expect(text).toContain('"status":"complete"')
    // Write-through: the tick reconciled the DB, not just the stream.
    expect((await mockDb.getWorkflowRunById('run-1'))!.status).toBe('complete')
    expect((await mockDb.listRunSteps('run-1', 'wf-1')).steps).toHaveLength(1)
  })

  it('reports a provider failure as an error event and closes', async () => {
    const app = createTestApp()
    await seedActiveRun()
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('upstream unreachable')))
    const res = await app.request(
      `/api/workflows/wf-1/runs/run-1/stream?projectId=${TEST_PROJECT_ID}`,
    )
    const text = await res.text()
    expect(text).toContain('event: error')
    expect(text).toContain('upstream unreachable')
    expect(text).not.toContain('event: done')
  })

  it('404s for a run that is not in the workflow', async () => {
    const app = createTestApp()
    await seedActiveRun()
    await mockDb.createWorkflow({
      id: 'wf-2',
      projectId: TEST_PROJECT_ID,
      createdBy: TEST_USER_ID,
      name: 'Other',
    })
    const res = await app.request(
      `/api/workflows/wf-2/runs/run-1/stream?projectId=${TEST_PROJECT_ID}`,
    )
    expect(res.status).toBe(404)
  })
})
