import { describe, expect, it } from 'vitest'
import type { WorkflowProvider } from '@awaitstep/codegen'
import { runOnInstance, type LiveWorkflow } from '../lib/run-record.js'

/** Just what recording a run reads of where it is live. */
function live(adapter: Partial<WorkflowProvider>): LiveWorkflow {
  return {
    deps: { trigger: 'dashboard' },
    workflow: { id: 'wf-1' },
    connection: { id: 'conn-1', deployedVersionId: 'v-1', deployedVersionNumber: 3 },
    adapter,
    deployedName: 'orders',
  } as unknown as LiveWorkflow
}

describe('the status a started run is recorded with', () => {
  it('is queued where the background sync will move it on', () => {
    expect(runOnInstance(live({}), 'inst-1', { params: { a: 1 } }).status).toBe('queued')
  })

  it('is running for a provider that reports its own ends, whose runs the sync never asks about', () => {
    const run = runOnInstance(live({ reportsRunEnds: true }), 'inst-1', { params: { a: 1 } })
    expect(run).toMatchObject({ status: 'running', instanceId: 'inst-1', versionNumber: 3 })
  })
})
