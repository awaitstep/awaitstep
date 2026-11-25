import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { WorkflowProvider, WorkflowRunDetail } from '@awaitstep/codegen'
import { RunGoneError } from '@awaitstep/codegen'
import { isLiveStepId, liveRunSteps, liveStepExtras, STEPS_UNAVAILABLE } from '../lib/live-steps.js'
import { syncRunById } from '../lib/run-sync.js'
import {
  mockDb,
  resetStore,
  storedRun,
  TEST_ORG_ID,
  TEST_PROJECT_ID,
  TEST_USER_ID,
} from './helpers.js'

const MANIFEST = {
  irHash: 'x',
  steps: [
    { nodeId: 'step-1', stepName: 'step-1', kind: 'do', varName: 'Hello' },
    { nodeId: 'step-2', coalescedInto: 'step-1', varName: 'Follow' },
  ],
}
const KEPT_FOR = 'Step detail is kept for a day.'

async function seedRun() {
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
    configSnapshot: JSON.stringify({ stepManifest: MANIFEST }),
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

const STEPS: WorkflowRunDetail['steps'] = [
  {
    name: 'step-1',
    kind: 'do',
    index: 1,
    status: 'complete',
    start: '2026-11-24T10:00:00Z',
    end: '2026-11-24T10:00:02Z',
    attemptCount: 2,
    output: { ok: true },
    attempts: [{ start: '2026-11-24T10:00:00Z', error: { name: 'E', message: 'first' } }],
  },
  { name: 'nap', kind: 'sleep', index: 1, status: 'waiting', attemptCount: 1 },
]

function live(detail: Partial<WorkflowRunDetail> | Error, liveSteps = true) {
  const getRunDetail = vi.fn(async () => {
    if (detail instanceof Error) throw detail
    return { instanceId: 'inst-1', status: 'running', steps: STEPS, ...detail } as WorkflowRunDetail
  })
  const provider = {
    getRunDetail,
    ...(liveSteps && { liveSteps: { keptFor: KEPT_FOR } }),
  } as unknown as WorkflowProvider
  return { provider, getRunDetail }
}

describe('steps read live from their provider', () => {
  beforeEach(() => resetStore())

  it('lists them mapped to nodes, with no output and nothing stored', async () => {
    await seedRun()
    const { provider, getRunDetail } = live({})
    const steps = await liveRunSteps(mockDb, 'run-1', 'wf-1', TEST_ORG_ID, provider)
    expect(getRunDetail).toHaveBeenCalledWith(
      'inst-1',
      expect.objectContaining({ provider: 'cloudflare' }),
    )
    expect(steps).toEqual({
      data: [
        {
          id: 'live-0',
          runId: 'run-1',
          nodeId: 'step-1',
          stepName: 'step-1',
          kind: 'do',
          stepIndex: 1,
          status: 'complete',
          attemptCount: 2,
          error: null,
          startedAt: '2026-11-24T10:00:00Z',
          endedAt: '2026-11-24T10:00:02Z',
          createdAt: '2026-11-24T10:00:00Z',
          updatedAt: '2026-11-24T10:00:02Z',
        },
        expect.objectContaining({ id: 'live-1', nodeId: null, stepName: 'nap', status: 'waiting' }),
      ],
      coalescedInto: { 'step-2': 'step-1' },
    })
    expect((await mockDb.listRunSteps('run-1', 'wf-1')).steps).toEqual([])
  })

  it('reads one step’s output and tries by its place', async () => {
    await seedRun()
    const { provider } = live({})
    expect(isLiveStepId('live-0')).toBe(true)
    expect(isLiveStepId('abc')).toBe(false)
    expect(await liveStepExtras(mockDb, 'live-0', 'run-1', 'wf-1', TEST_ORG_ID, provider)).toEqual({
      output: '{"ok":true}',
      outputTruncated: false,
      attempts: JSON.stringify(STEPS[0]!.attempts),
    })
    expect(
      await liveStepExtras(mockDb, 'live-9', 'run-1', 'wf-1', TEST_ORG_ID, provider),
    ).toBeNull()
  })

  it('says how long they are kept once the provider has let go of the run', async () => {
    await seedRun()
    const { provider } = live(new RunGoneError('instance'))
    expect(await liveRunSteps(mockDb, 'run-1', 'wf-1', TEST_ORG_ID, provider)).toEqual({
      data: [],
      coalescedInto: { 'step-2': 'step-1' },
      notice: KEPT_FOR,
    })
    expect(
      await liveStepExtras(mockDb, 'live-0', 'run-1', 'wf-1', TEST_ORG_ID, provider),
    ).toBeNull()
  })

  it('says so when the provider cannot be read right now', async () => {
    await seedRun()
    const { provider } = live({ steps: [], stepsUnavailable: true })
    expect(await liveRunSteps(mockDb, 'run-1', 'wf-1', TEST_ORG_ID, provider)).toMatchObject({
      data: [],
      notice: STEPS_UNAVAILABLE,
      // A page keeps the steps it has: this is not "there are none".
      unavailable: true,
    })
    const { provider: gone } = live(new RunGoneError('instance'))
    expect(await liveRunSteps(mockDb, 'run-1', 'wf-1', TEST_ORG_ID, gone)).not.toHaveProperty(
      'unavailable',
    )
  })

  it('leaves every other run to its stored rows', async () => {
    await seedRun()
    // A provider whose steps are stored; a run of another organisation; no live provider at all.
    expect(
      await liveRunSteps(mockDb, 'run-1', 'wf-1', TEST_ORG_ID, live({}, false).provider),
    ).toBeNull()
    expect(await liveRunSteps(mockDb, 'run-1', 'wf-1', 'org-other', live({}).provider)).toBeNull()
    expect(await liveRunSteps(mockDb, 'run-1', 'wf-1', TEST_ORG_ID)).toBeNull()
  })

  it('moves the run on a sync without storing its steps', async () => {
    await seedRun()
    const { provider } = live({ status: 'complete' })
    await syncRunById(mockDb, 'run-1', 'wf-1', TEST_ORG_ID, { provider })
    expect(storedRun('run-1')!.status).toBe('complete')
    expect((await mockDb.listRunSteps('run-1', 'wf-1')).steps).toEqual([])
  })
})
