import { describe, it, expect } from 'vitest'
import type { WorkflowRunDetail } from '@awaitstep/codegen'
import { diffRunDetail } from '../lib/run-events.js'

function detail(overrides: Partial<WorkflowRunDetail> = {}): WorkflowRunDetail {
  return { instanceId: 'inst-1', status: 'running', steps: [], ...overrides }
}

describe('diffRunDetail', () => {
  it('emits the run status and every step on the first snapshot', () => {
    const events = diffRunDetail(
      null,
      detail({
        steps: [{ name: 'fetch', kind: 'do', index: 1, status: 'running', attemptCount: 1 }],
      }),
    )
    expect(events.map((e) => e.event)).toEqual(['run', 'step'])
  })

  it('emits nothing for an unchanged snapshot', () => {
    const snapshot = detail({
      steps: [{ name: 'fetch', kind: 'do', index: 1, status: 'complete', attemptCount: 1 }],
    })
    expect(diffRunDetail(snapshot, snapshot)).toEqual([])
  })

  it('emits only the steps whose status or attempts moved, plus run status changes', () => {
    const before = detail({
      steps: [
        { name: 'fetch', kind: 'do', index: 1, status: 'running', attemptCount: 1 },
        { name: 'nap', kind: 'sleep', index: 1, status: 'waiting', attemptCount: 1 },
      ],
    })
    const after = detail({
      status: 'complete',
      steps: [
        { name: 'fetch', kind: 'do', index: 1, status: 'complete', attemptCount: 2 },
        { name: 'nap', kind: 'sleep', index: 1, status: 'waiting', attemptCount: 1 },
        { name: 'work [0]', kind: 'do', index: 1, status: 'running', attemptCount: 1 },
      ],
    })
    const events = diffRunDetail(before, after)
    expect(events).toEqual([
      { event: 'run', data: { status: 'complete' } },
      {
        event: 'step',
        data: { name: 'fetch', kind: 'do', index: 1, status: 'complete', attemptCount: 2 },
      },
      {
        event: 'step',
        data: { name: 'work [0]', kind: 'do', index: 1, status: 'running', attemptCount: 1 },
      },
    ])
  })

  it('keeps loop iterations distinct by index', () => {
    const before = detail({
      steps: [{ name: 'work', kind: 'do', index: 1, status: 'complete', attemptCount: 1 }],
    })
    const after = detail({
      steps: [
        { name: 'work', kind: 'do', index: 1, status: 'complete', attemptCount: 1 },
        { name: 'work', kind: 'do', index: 2, status: 'running', attemptCount: 1 },
      ],
    })
    expect(diffRunDetail(before, after).map((e) => e.data)).toEqual([
      { name: 'work', kind: 'do', index: 2, status: 'running', attemptCount: 1 },
    ])
  })
})
