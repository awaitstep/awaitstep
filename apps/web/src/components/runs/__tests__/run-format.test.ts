import { describe, expect, it } from 'vitest'
import type { WorkspaceRun } from '../../../types/dashboard/runs'
import { resultLabel, runKindLabel, tookLabel, triggerLabel } from '../run-format'

function run(overrides: Partial<WorkspaceRun> = {}): WorkspaceRun {
  return {
    id: 'run_8f2c',
    workflowId: 'itm',
    createdAt: new Date().toISOString(),
    workflowName: 'Lead enrichment',
    kind: 'workflow',
    result: 'succeeded',
    trigger: 'webhook',
    durationMs: 4200,
    waitingOn: null,
    httpStatus: null,
    failure: null,
    ...overrides,
  }
}

describe('run labels, in the boards’ words', () => {
  it('reads results, and a function’s success as its response on the Overview', () => {
    expect(resultLabel(run({ result: 'failed' }))).toBe('Failed')
    const request = run({ kind: 'script', httpStatus: 200 })
    expect(resultLabel(request)).toBe('Succeeded')
    expect(resultLabel(request, { httpStatus: true })).toBe('200 OK')
  })

  it('reads durations as "86ms", "4.2s", "1.1s" and "—" while running', () => {
    expect(tookLabel(86)).toBe('86ms')
    expect(tookLabel(4200)).toBe('4.2s')
    expect(tookLabel(1100)).toBe('1.1s')
    expect(tookLabel(72_000)).toBe('1m 12s')
    expect(tookLabel(null)).toBe('—')
  })

  it('rounds before picking the unit, so nothing reads "1000ms" or "60.0s"', () => {
    expect(tookLabel(999.6)).toBe('1.0s')
    expect(tookLabel(59_960)).toBe('1m 0s')
    expect(tookLabel(59_940)).toBe('59.9s')
  })

  it('names the kind, and the step a running workflow waits on', () => {
    expect(runKindLabel(run({ kind: 'script' }))).toBe('Function')
    expect(runKindLabel(run({ waitingOn: 'Wait 1 day', result: 'running' }))).toBe(
      'Workflow · waiting on step “Wait 1 day”',
    )
  })

  it('names triggers', () => {
    expect(triggerLabel('http')).toBe('HTTP')
    expect(triggerLabel('schedule')).toBe('Schedule')
  })
})
