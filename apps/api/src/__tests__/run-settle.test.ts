import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { WorkflowProvider } from '@awaitstep/codegen'
import { settleRun, tellFunctionsFailed } from '../lib/run-settle.js'
import { syncActiveRuns } from '../lib/run-sync.js'
import { useExtensionProviders } from '../lib/provider-registry.js'
import {
  mockDb,
  resetStore,
  sentNotifications,
  storedRun,
  TEST_ORG_ID,
  TEST_PROJECT_ID,
  TEST_USER_ID,
} from './helpers.js'

const getRunDetail = vi.fn()
const reporting = { name: 'reporting', reportsRunEnds: true, getRunDetail }
const ref = { runId: 'run-1', workflowId: 'wf-1', organizationId: TEST_ORG_ID }

async function seed(
  run: { instanceId: string; status: string; error?: string },
  kind: 'workflow' | 'script' = 'workflow',
) {
  await mockDb.createWorkflow({
    id: 'wf-1',
    kind,
    projectId: TEST_PROJECT_ID,
    createdBy: TEST_USER_ID,
    name: 'My Flow',
  })
  await mockDb.createConnection({
    id: 'conn-1',
    organizationId: TEST_ORG_ID,
    provider: 'reporting',
    name: 'Reporting',
    createdBy: TEST_USER_ID,
    credentials: '{}',
  })
  await mockDb.createRun({
    id: 'run-1',
    workflowId: 'wf-1',
    versionId: 'v-1',
    versionNumber: 1,
    connectionId: 'conn-1',
    ...run,
  })
}

describe('a provider that reports its own runs’ ends', () => {
  beforeEach(() => {
    resetStore()
    getRunDetail.mockReset()
    useExtensionProviders([
      {
        id: 'ext',
        providers: { reporting: () => reporting as unknown as WorkflowProvider },
      },
    ])
  })
  afterEach(() => useExtensionProviders([]))

  it('is not asked about its runs by the background sync', async () => {
    await seed({ instanceId: 'inst-1', status: 'running' })
    await syncActiveRuns(mockDb)
    expect(getRunDetail).not.toHaveBeenCalled()
    expect(storedRun('run-1')!.status).toBe('running')
  })

  it('has one run read on demand, and its watchers told when it failed', async () => {
    await seed({ instanceId: 'inst-1', status: 'running' })
    getRunDetail.mockResolvedValue({
      instanceId: 'inst-1',
      status: 'errored',
      error: { name: 'Error', message: 'boom' },
      steps: [],
    })
    expect(await settleRun(mockDb, ref)).toBe('errored')
    expect(storedRun('run-1')!.status).toBe('errored')
    expect(sentNotifications().length).toBeGreaterThan(0)
    const told = sentNotifications().length
    // Read again, it has not failed a second time.
    expect(await settleRun(mockDb, ref)).toBe('errored')
    expect(sentNotifications()).toHaveLength(told)
  })

  it('tells a failed call’s watchers without asking the provider, and nothing for one that answered', async () => {
    await seed(
      {
        instanceId: 'call_abc',
        status: 'errored',
        error: JSON.stringify({ message: 'Answered 500' }),
      },
      'script',
    )
    expect(await settleRun(mockDb, ref)).toBe('errored')
    expect(getRunDetail).not.toHaveBeenCalled()
    expect(sentNotifications().length).toBeGreaterThan(0)

    resetStore()
    await seed({ instanceId: 'call_abc', status: 'complete' }, 'script')
    expect(await settleRun(mockDb, ref)).toBe('complete')
    expect(sentNotifications()).toHaveLength(0)
  })

  it('reads a workflow’s run whatever it is named, even like a call', async () => {
    await seed({ instanceId: 'call_7', status: 'running' })
    getRunDetail.mockResolvedValue({ instanceId: 'call_7', status: 'complete', steps: [] })
    expect(await settleRun(mockDb, ref)).toBe('complete')
    expect(getRunDetail).toHaveBeenCalled()
    expect(storedRun('run-1')!.status).toBe('complete')
  })

  it('answers null for a run that is not that organization’s', async () => {
    await seed({ instanceId: 'inst-1', status: 'running' })
    expect(await settleRun(mockDb, { ...ref, organizationId: 'org-other' })).toBeNull()
    expect(await settleRun(mockDb, { ...ref, runId: 'run-none' })).toBeNull()
    expect(getRunDetail).not.toHaveBeenCalled()
  })
})

describe('failed function calls with no run behind them', () => {
  beforeEach(async () => {
    resetStore()
    await mockDb.createWorkflow({
      id: 'fn-1',
      kind: 'script',
      projectId: TEST_PROJECT_ID,
      createdBy: TEST_USER_ID,
      name: 'My Function',
    })
  })

  it('tells the function’s watchers once for a batch of its failures, with the newest error', async () => {
    const failed = (message: string) => ({
      organizationId: TEST_ORG_ID,
      workflowId: 'fn-1',
      error: JSON.stringify({ name: 'HttpStatus', message }),
    })
    await tellFunctionsFailed(mockDb, [failed('Answered 500'), failed('Answered 503')])
    const sent = sentNotifications()
    expect(sent).toHaveLength(1)
    expect(sent[0]).toMatchObject({
      event: 'run.failed',
      organizationId: TEST_ORG_ID,
      meta: { workflow: 'My Function', call: true },
    })
  })

  it('tells nothing for a function of another organization, or one that is gone', async () => {
    await tellFunctionsFailed(mockDb, [
      { organizationId: 'org-other', workflowId: 'fn-1', error: null },
      { organizationId: TEST_ORG_ID, workflowId: 'fn-none', error: null },
    ])
    expect(sentNotifications()).toHaveLength(0)
  })
})
