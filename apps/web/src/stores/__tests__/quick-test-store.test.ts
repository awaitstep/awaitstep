import { describe, it, expect, beforeEach } from 'vitest'
import { quickTestKey, quickTestView, useQuickTestStore } from '../quick-test-store'
import type { QuickTestResult } from '../../lib/ide/quick-test-runner'

const RESULT: QuickTestResult = {
  status: 'ok',
  result: '42',
  error: null,
  logs: [],
  durationMs: 7,
}

beforeEach(() => {
  useQuickTestStore.getState().reset()
})

describe('quickTestKey', () => {
  it('separates the same path in two workflows', () => {
    expect(quickTestKey('wf-1', 'nodes/step_1.ts')).not.toBe(
      quickTestKey('wf-2', 'nodes/step_1.ts'),
    )
  })

  it('cannot be forged by a path that looks like a key', () => {
    // The separator is a character a path cannot contain, so one workflow's
    // file can never address another's entry.
    expect(quickTestKey('wf-1', 'nodes/a.ts')).not.toBe(quickTestKey('wf', '1/nodes/a.ts'))
  })
})

describe('useQuickTestStore', () => {
  it('keeps each file its own arguments', () => {
    const a = quickTestKey('wf-1', 'nodes/a.ts')
    const b = quickTestKey('wf-1', 'nodes/b.ts')
    const { setField } = useQuickTestStore.getState()

    setField(a, 'inputs', '{"x":1}')
    setField(b, 'inputs', '{"y":2}')

    const { views } = useQuickTestStore.getState()
    expect(quickTestView(views, a).inputs).toBe('{"x":1}')
    expect(quickTestView(views, b).inputs).toBe('{"y":2}')
  })

  it('does not let one workflow see another workflow run', () => {
    // Both workflows have nodes/step_1.ts; they are not the same file.
    const mine = quickTestKey('wf-1', 'nodes/step_1.ts')
    const theirs = quickTestKey('wf-2', 'nodes/step_1.ts')
    const { beginRun, settleRun } = useQuickTestStore.getState()

    const run = beginRun(mine)
    settleRun(mine, run, RESULT)

    const { views } = useQuickTestStore.getState()
    expect(quickTestView(views, theirs).result).toBeNull()
    expect(quickTestView(views, theirs).running).toBe(false)
  })

  it('leaves the other fields alone when one is edited', () => {
    const key = quickTestKey('wf-1', 'nodes/a.ts')
    const { setField, beginRun, settleRun } = useQuickTestStore.getState()

    settleRun(key, beginRun(key), RESULT)
    setField(key, 'env', '{"API":"x"}')

    const view = quickTestView(useQuickTestStore.getState().views, key)
    expect(view.result).toEqual(RESULT)
    expect(view.env).toBe('{"API":"x"}')
    expect(view.inputs).toBeNull()
  })

  it('marks a run as running and clears the previous result', () => {
    const key = quickTestKey('wf-1', 'nodes/a.ts')
    const { beginRun, settleRun } = useQuickTestStore.getState()
    settleRun(key, beginRun(key), RESULT)

    beginRun(key)

    const view = quickTestView(useQuickTestStore.getState().views, key)
    expect(view.running).toBe(true)
    expect(view.result).toBeNull()
  })

  it('ignores a result from a run that was superseded', () => {
    const key = quickTestKey('wf-1', 'nodes/a.ts')
    const { beginRun, settleRun } = useQuickTestStore.getState()
    const first = beginRun(key)
    const second = beginRun(key)

    settleRun(key, first, RESULT)

    const view = quickTestView(useQuickTestStore.getState().views, key)
    expect(view.result).toBeNull()
    expect(view.running).toBe(true)
    expect(first.signal.aborted).toBe(true)
    expect(second.signal.aborted).toBe(false)
  })

  it('aborts a run in flight on reset, and refuses its late answer', () => {
    // Without this the worker kept going after the workspace was gone, and
    // its answer recreated the entry the reset had just cleared.
    const key = quickTestKey('wf-1', 'nodes/a.ts')
    const { beginRun, settleRun, reset } = useQuickTestStore.getState()
    const run = beginRun(key)

    reset()
    expect(run.signal.aborted).toBe(true)

    settleRun(key, run, RESULT)
    expect(useQuickTestStore.getState().views).toEqual({})
  })

  it('clears running without a result when a run is abandoned', () => {
    const key = quickTestKey('wf-1', 'nodes/a.ts')
    const { beginRun, settleRun } = useQuickTestStore.getState()
    const run = beginRun(key)

    settleRun(key, run, null)

    const view = quickTestView(useQuickTestStore.getState().views, key)
    expect(view.running).toBe(false)
    expect(view.result).toBeNull()
  })

  it('reports an untouched file as empty rather than undefined', () => {
    const view = quickTestView(
      useQuickTestStore.getState().views,
      quickTestKey('wf-1', 'nodes/a.ts'),
    )
    expect(view).toEqual({ inputs: null, env: null, event: null, result: null, running: false })
  })

  it('treats a missing key as empty', () => {
    expect(quickTestView(useQuickTestStore.getState().views, null).result).toBeNull()
  })

  it('forgets everything on reset, so leaving a workspace leaves nothing behind', () => {
    // Including a run still marked in flight, which would otherwise greet
    // the next workflow as a stuck spinner.
    const key = quickTestKey('wf-1', 'nodes/a.ts')
    const { beginRun, setField, reset } = useQuickTestStore.getState()
    beginRun(key)
    setField(key, 'inputs', '{"x":1}')

    reset()

    expect(useQuickTestStore.getState().views).toEqual({})
    expect(quickTestView(useQuickTestStore.getState().views, key).running).toBe(false)
  })
})
