import { describe, it, expect } from 'vitest'
import { mapInstanceSteps, toRunDetail } from '../run-detail.js'
import type { CFInstanceStatus } from '../api.js'

describe('mapInstanceSteps', () => {
  it('maps do steps with attempts, status, and timing', () => {
    const steps = mapInstanceSteps([
      {
        type: 'step',
        name: 'fetch',
        start: '2026-10-08T00:00:00Z',
        end: '2026-10-08T00:00:05Z',
        success: true,
        attempts: [
          {
            start: '2026-10-08T00:00:00Z',
            end: '2026-10-08T00:00:02Z',
            success: false,
            error: { name: 'Error', message: 'boom' },
          },
          { start: '2026-10-08T00:00:03Z', end: '2026-10-08T00:00:05Z', success: true },
        ],
      },
    ])
    expect(steps).toEqual([
      {
        name: 'fetch',
        kind: 'do',
        index: 1,
        status: 'complete',
        start: '2026-10-08T00:00:00Z',
        end: '2026-10-08T00:00:05Z',
        attemptCount: 2,
        error: { name: 'Error', message: 'boom' },
      },
    ])
  })

  it('marks a failed step errored with its last attempt error', () => {
    const steps = mapInstanceSteps([
      {
        type: 'step',
        name: 'fetch',
        start: '2026-10-08T00:00:00Z',
        end: '2026-10-08T00:00:05Z',
        success: false,
        attempts: [{ success: false, error: { name: 'TypeError', message: 'nope' } }],
      },
    ])
    expect(steps[0]!.status).toBe('errored')
    expect(steps[0]!.error).toEqual({ name: 'TypeError', message: 'nope' })
  })

  it('maps sleep and waitForEvent via finished, pending as waiting', () => {
    const steps = mapInstanceSteps([
      { type: 'sleep', name: 'nap', start: '2026-10-08T00:00:00Z', finished: true },
      { type: 'waitForEvent', name: 'gate', start: '2026-10-08T00:00:01Z' },
    ])
    expect(steps.map((s) => [s.kind, s.status])).toEqual([
      ['sleep', 'complete'],
      ['waitForEvent', 'waiting'],
    ])
  })

  it('numbers repeated labels (loops) 1-based per kind in report order', () => {
    const steps = mapInstanceSteps([
      { type: 'step', name: 'work [0]', success: true },
      { type: 'step', name: 'work [0]', success: true },
      { type: 'sleep', name: 'work [0]', finished: true },
    ])
    expect(steps.map((s) => [s.kind, s.index])).toEqual([
      ['do', 1],
      ['do', 2],
      ['sleep', 1],
    ])
  })

  it('drops termination entries, which carry no name', () => {
    expect(mapInstanceSteps([{ type: 'termination' }])).toEqual([])
    expect(mapInstanceSteps(undefined)).toEqual([])
  })
})

describe('toRunDetail', () => {
  it('maps instance status, timing, and billable step count', () => {
    const status: CFInstanceStatus = {
      id: 'inst-1',
      status: 'complete',
      output: { ok: true },
      start: '2026-10-08T00:00:00Z',
      end: '2026-10-08T00:00:09Z',
      step_count: 4,
      steps: [{ type: 'step', name: 'fetch', success: true }],
    }
    const detail = toRunDetail(status)
    expect(detail.instanceId).toBe('inst-1')
    expect(detail.status).toBe('complete')
    expect(detail.startedAt).toBe('2026-10-08T00:00:00Z')
    expect(detail.endedAt).toBe('2026-10-08T00:00:09Z')
    expect(detail.stepCount).toBe(4)
    expect(detail.steps).toHaveLength(1)
  })
})
