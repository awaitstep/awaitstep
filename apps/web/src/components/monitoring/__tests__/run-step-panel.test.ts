import { describe, expect, it } from 'vitest'
import type { RunStep } from '../../../lib/api-client'
import { buildRunTimeline } from '../../../lib/run-steps'
import { buildStepList, type StepItem } from '../../../lib/run-step-list'
import { attemptLines } from '../run-step-panel'

/** A terminated run's sleep, reported with the wake time it never reached. */
const SLEEP: RunStep = {
  id: 'rs-1',
  runId: 'run-1',
  nodeId: 'nap',
  stepName: 'nap (nap)-1',
  kind: 'sleep',
  stepIndex: 1,
  status: 'waiting',
  attemptCount: 1,
  error: null,
  startedAt: '2026-11-22T06:00:10.660Z',
  endedAt: '2026-11-22T06:00:20.660Z',
  createdAt: '2026-11-22T06:00:10.660Z',
  updatedAt: '2026-11-22T06:00:12.026Z',
}

function itemOf(step: RunStep, runStatus: string): StepItem {
  const timeline = buildRunTimeline([step], {
    status: runStatus,
    endedAt: '2026-11-22T06:00:13.929Z',
  })
  const [entry] = buildStepList({
    rows: timeline.rows,
    steps: [step],
    runStatus,
    nodeNames: { nap: '10s sleep' },
    containment: new Map(),
    types: new Map(),
  })
  return entry as StepItem
}

describe('attemptLines', () => {
  it('says a sleep its run stopped in was interrupted, not finished at its wake time', () => {
    const lines = attemptLines(itemOf(SLEEP, 'terminated'), [])
    expect(lines).toEqual([
      { label: 'Interrupted', at: undefined, tone: 'stopped' },
      { label: 'Started', at: SLEEP.startedAt, tone: 'ok' },
    ])
  })

  it('still says sleeping while the run is going', () => {
    expect(attemptLines(itemOf(SLEEP, 'running'), [])[0]).toEqual({
      label: 'Sleeping',
      at: undefined,
      tone: 'wait',
    })
  })

  it('calls an unfinished try of an interrupted step interrupted, not running', () => {
    const step = { ...SLEEP, kind: 'do' as const, status: 'running' as const, endedAt: null }
    const lines = attemptLines(itemOf(step, 'terminated'), [
      {
        start: '2026-11-22T06:00:10.000Z',
        end: '2026-11-22T06:00:11.000Z',
        error: { name: 'E', message: 'x' },
      },
      { start: '2026-11-22T06:00:12.000Z' },
    ])
    expect(lines[0]).toEqual({
      label: 'Attempt 2 · interrupted',
      at: '2026-11-22T06:00:12.000Z',
      tone: 'stopped',
    })
  })
})
