import { describe, it, expect } from 'vitest'
import type { RunStep } from '../api-client'
import { buildRunTimeline } from '../run-steps'
import {
  buildStepList,
  failedOnly,
  flatSteps,
  focusStep,
  runWhereabouts,
  type StepGroup,
} from '../run-step-list'

let seq = 0
function step(overrides: Partial<RunStep> = {}): RunStep {
  seq += 1
  return {
    id: `rs-${seq}`,
    runId: 'run-1',
    nodeId: null,
    stepName: `step-${seq}`,
    kind: 'do',
    stepIndex: 1,
    status: 'complete',
    attemptCount: 1,
    error: null,
    startedAt: `2026-11-11T13:00:${String(seq).padStart(2, '0')}.000Z`,
    endedAt: `2026-11-11T13:00:${String(seq).padStart(2, '0')}.500Z`,
    createdAt: '2026-11-11T13:00:00.000Z',
    updatedAt: '2026-11-11T13:00:00.000Z',
    ...overrides,
  }
}

function list(steps: RunStep[], runStatus = 'complete', types = new Map<string, string>()) {
  const timeline = buildRunTimeline(steps, { status: runStatus, endedAt: null })
  return buildStepList({
    rows: timeline.rows,
    steps,
    runStatus,
    nodeNames: { fetch: 'Fetch company', loop: 'For each contact', crm: 'Write to CRM' },
    containment: new Map(),
    types,
  })
}

describe('buildStepList', () => {
  it('names steps by their node and keeps the provider label', () => {
    const [entry] = list([step({ nodeId: 'fetch', stepName: 'fetch-1' })])
    expect(entry).toMatchObject({ kind: 'step', name: 'Fetch company', label: 'fetch-1' })
  })

  it('folds a loop’s iterations into one row at the first one’s place', () => {
    const entries = list(
      [
        step({ nodeId: 'fetch' }),
        step({ nodeId: 'loop', stepName: 'work [0]' }),
        step({ nodeId: 'loop', stepName: 'work [1]', status: 'errored', error: 'boom' }),
        step({ nodeId: 'crm' }),
      ],
      'errored',
      new Map([['loop', 'loop']]),
    )
    expect(entries.map((e) => e.kind)).toEqual(['step', 'group', 'step'])
    const group = entries[1] as StepGroup
    expect(group).toMatchObject({ name: 'For each contact', meta: 'loop · 2 iterations' })
    // The worst iteration colours the group.
    expect(group.state).toBe('failed')
    expect(flatSteps(entries)).toHaveLength(4)
  })

  it('reads a timed-out wait as timed out, not failed', () => {
    const [entry] = list([
      step({ kind: 'waitForEvent', status: 'errored', error: 'WorkflowTimeoutError: no event' }),
    ])
    expect(entry!.kind === 'step' && entry.state).toBe('timedOut')
  })
})

describe('failedOnly', () => {
  it('keeps failed steps and a group’s failed iterations only', () => {
    const entries = list([
      step({ nodeId: 'fetch' }),
      step({ nodeId: 'loop' }),
      step({ nodeId: 'loop', status: 'errored' }),
      step({ nodeId: 'crm', status: 'errored' }),
    ])
    const failed = failedOnly(entries)
    expect(failed.map((e) => e.kind)).toEqual(['group', 'step'])
    expect((failed[0] as StepGroup).items).toHaveLength(1)
  })
})

describe('focusStep and runWhereabouts', () => {
  it('opens a failed run on the step it stopped at', () => {
    const items = flatSteps(
      list([step({ nodeId: 'fetch' }), step({ nodeId: 'crm', status: 'errored' })], 'errored'),
    )
    expect(focusStep(items, 'errored')?.name).toBe('Write to CRM')
    expect(runWhereabouts(items, 'errored')).toBe('Stopped at Write to CRM')
  })

  it('opens a live run on the step in flight and says it is waiting', () => {
    const items = flatSteps(
      list(
        [
          step({ nodeId: 'fetch' }),
          step({ kind: 'waitForEvent', status: 'waiting', endedAt: null }),
        ],
        'running',
      ),
    )
    expect(focusStep(items, 'running')?.state).toBe('waiting')
    expect(runWhereabouts(items, 'running')).toBe('Waiting for an event')
  })

  it('says a live run with no steps yet is starting', () => {
    expect(runWhereabouts([], 'running')).toBe('Starting')
    expect(focusStep([], 'running')).toBeUndefined()
  })
})
