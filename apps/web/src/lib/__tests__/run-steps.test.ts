import { describe, it, expect } from 'vitest'
import type { RunStep } from '../api-client'
import {
  buildRunTimeline,
  isInterruptedStep,
  mapRunStepsToNodeStatuses,
  stepToNodeStatus,
} from '../run-steps'

function step(overrides: Partial<RunStep> = {}): RunStep {
  return {
    id: `rs-${Math.random().toString(36).slice(2)}`,
    runId: 'run-1',
    nodeId: null,
    stepName: 'fetch',
    kind: 'do',
    stepIndex: 1,
    status: 'complete',
    attemptCount: 1,
    error: null,
    startedAt: '2026-10-15T00:00:00.000Z',
    endedAt: '2026-10-15T00:00:02.000Z',
    createdAt: '2026-10-15T00:00:00.000Z',
    updatedAt: '2026-10-15T00:00:02.000Z',
    ...overrides,
  }
}

describe('isInterruptedStep', () => {
  it('flags in-flight steps only once the run is over', () => {
    const inFlight = step({ status: 'running', endedAt: null })
    expect(isInterruptedStep(inFlight, 'running')).toBe(false)
    expect(isInterruptedStep(inFlight, 'terminated')).toBe(true)
    expect(isInterruptedStep(step({ status: 'complete' }), 'terminated')).toBe(false)
  })
})

describe('stepToNodeStatus', () => {
  it('animates both running and waiting as in-progress', () => {
    expect(stepToNodeStatus('running')).toBe('running')
    expect(stepToNodeStatus('waiting')).toBe('running')
    expect(stepToNodeStatus('complete')).toBe('complete')
    expect(stepToNodeStatus('errored')).toBe('errored')
  })
})

describe('mapRunStepsToNodeStatuses', () => {
  const nodeIds = ['fetch', 'loop', 'work', 'follow', 'branch', 'sub-1']

  it('attributes rows by nodeId, then by label base (loop and derived suffixes stripped)', () => {
    const statuses = mapRunStepsToNodeStatuses(
      nodeIds,
      [
        step({ nodeId: 'fetch', stepName: 'fetch' }),
        step({ nodeId: null, stepName: 'work [0]', status: 'running' }),
        step({ nodeId: null, stepName: 'sub-1--await', status: 'complete' }),
      ],
      {},
      'running',
    )
    expect(statuses.fetch).toBe('complete')
    expect(statuses.work).toBe('running')
    expect(statuses['sub-1']).toBe('complete')
  })

  it('keeps the most urgent status across repeated rows (loop iterations)', () => {
    const statuses = mapRunStepsToNodeStatuses(
      nodeIds,
      [
        step({ stepName: 'work [0]', status: 'complete' }),
        step({ stepName: 'work [1]', status: 'errored' }),
        step({ stepName: 'work [2]', status: 'complete' }),
      ],
      {},
      'errored',
    )
    expect(statuses.work).toBe('errored')
  })

  it('mirrors the leader status onto coalesced members', () => {
    const statuses = mapRunStepsToNodeStatuses(
      nodeIds,
      [step({ nodeId: 'fetch', status: 'running' })],
      { follow: 'fetch' },
      'running',
    )
    expect(statuses.follow).toBe('running')
  })

  it('marks unreported nodes pending while active and leaves them unstyled when terminal', () => {
    const active = mapRunStepsToNodeStatuses(nodeIds, [step({ nodeId: 'fetch' })], {}, 'running')
    expect(active.branch).toBe('pending')
    const done = mapRunStepsToNodeStatuses(nodeIds, [step({ nodeId: 'fetch' })], {}, 'complete')
    expect(done.branch).toBeUndefined()
    expect(done.fetch).toBe('complete')
  })

  it('reads interrupted steps as pending, not running, once the run is terminal', () => {
    const rows = [step({ nodeId: 'fetch', status: 'running', endedAt: null })]
    expect(mapRunStepsToNodeStatuses(nodeIds, rows, {}, 'running').fetch).toBe('running')
    expect(mapRunStepsToNodeStatuses(nodeIds, rows, {}, 'terminated').fetch).toBe('pending')
  })

  it('ignores rows that map to no known node', () => {
    const statuses = mapRunStepsToNodeStatuses(
      nodeIds,
      [step({ nodeId: null, stepName: 'ghost' })],
      {},
      'complete',
    )
    expect(Object.keys(statuses)).toEqual([])
  })
})

describe('buildRunTimeline', () => {
  const now = new Date('2026-10-15T00:00:10.000Z')
  const active = { status: 'running', endedAt: null }

  it('lays rows out from the earliest start with measured durations', () => {
    const timeline = buildRunTimeline(
      [
        step({
          id: 'a',
          startedAt: '2026-10-15T00:00:01.000Z',
          endedAt: '2026-10-15T00:00:03.000Z',
        }),
        step({
          id: 'b',
          startedAt: '2026-10-15T00:00:00.000Z',
          endedAt: '2026-10-15T00:00:02.000Z',
        }),
      ],
      active,
      now,
    )
    expect(timeline.rows.map((r) => r.id)).toEqual(['b', 'a'])
    expect(timeline.rows[1]).toMatchObject({ startOffsetMs: 1000, durationMs: 2000 })
    expect(timeline.spanMs).toBe(3000)
    expect(timeline.billableSteps).toBe(2)
  })

  it('extends in-flight steps of an active run to now', () => {
    const timeline = buildRunTimeline(
      [step({ status: 'running', startedAt: '2026-10-15T00:00:04.000Z', endedAt: null })],
      active,
      now,
    )
    expect(timeline.rows[0]).toMatchObject({ durationMs: 6000, interrupted: false })
  })

  it('caps interrupted steps at the run end instead of growing forever', () => {
    const timeline = buildRunTimeline(
      [step({ status: 'running', startedAt: '2026-10-15T00:00:04.000Z', endedAt: null })],
      { status: 'terminated', endedAt: '2026-10-15T00:00:06.000Z' },
      new Date('2026-10-18T00:00:00.000Z'),
    )
    expect(timeline.rows[0]).toMatchObject({ durationMs: 2000, interrupted: true })
    expect(timeline.spanMs).toBe(2000)
  })

  it('lists steps without timing at zero width', () => {
    const timeline = buildRunTimeline([step({ startedAt: null, endedAt: null })], active, now)
    expect(timeline.rows[0]).toMatchObject({ startOffsetMs: 0, durationMs: 0 })
    expect(timeline.spanMs).toBe(1)
  })

  it('treats an end without a start as no timing rather than measuring from the origin', () => {
    const timeline = buildRunTimeline(
      [
        step({
          id: 'a',
          startedAt: '2026-10-15T00:00:00.000Z',
          endedAt: '2026-10-15T00:00:01.000Z',
        }),
        step({ id: 'b', startedAt: null, endedAt: '2026-10-15T00:00:09.000Z' }),
      ],
      active,
      now,
    )
    expect(timeline.rows.find((r) => r.id === 'b')).toMatchObject({
      startOffsetMs: 0,
      durationMs: 0,
    })
    expect(timeline.spanMs).toBe(1000)
  })
})
