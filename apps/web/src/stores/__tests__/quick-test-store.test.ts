// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest'
import {
  MAX_REMEMBERED_STEPS,
  quickTestKey,
  quickTestView,
  useQuickTestStore,
} from '../quick-test-store'
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
  useQuickTestStore.setState({ remembered: {}, argTab: 'inputs' })
  localStorage.clear()
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
    expect(view).toEqual({
      inputs: null,
      env: null,
      event: null,
      result: null,
      running: false,
      invalid: null,
    })
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

describe('remembered arguments', () => {
  const key = quickTestKey('wf-1', 'nodes/step_1.ts')
  const stored = () =>
    JSON.parse(localStorage.getItem('awaitstep-quick-test') ?? '{}') as {
      state: { remembered: Record<string, Record<string, string>> }
    }

  it('remembers inputs and event per workflow and step', () => {
    const store = useQuickTestStore.getState()
    store.setField(key, 'inputs', '{"a":1}')
    store.setField(key, 'event', '{"payload":{"x":1}}')
    expect(useQuickTestStore.getState().remembered[key]).toEqual({
      inputs: '{"a":1}',
      event: '{"payload":{"x":1}}',
    })
    expect(
      useQuickTestStore.getState().remembered[quickTestKey('wf-2', 'nodes/step_1.ts')],
    ).toBeUndefined()
  })

  it('never remembers env: secrets are typed there', () => {
    useQuickTestStore.getState().setField(key, 'env', '{"API_KEY":"sk-live-123"}')
    expect(useQuickTestStore.getState().remembered[key]).toBeUndefined()
    expect(localStorage.getItem('awaitstep-quick-test') ?? '').not.toContain('sk-live-123')
    // Still held in memory for the run.
    expect(quickTestView(useQuickTestStore.getState().views, key).env).toBe(
      '{"API_KEY":"sk-live-123"}',
    )
  })

  it('writes only the remembered arguments to storage, not results or env', () => {
    const store = useQuickTestStore.getState()
    store.setField(key, 'inputs', '{"a":1}')
    store.setField(key, 'env', '{"TOKEN":"abc"}')
    const run = store.beginRun(key)
    store.settleRun(key, run, RESULT)
    const saved = stored()
    // owner and savedAt are the retention envelope, not remembered text.
    expect(Object.keys(saved.state).sort()).toEqual(['owner', 'remembered', 'savedAt'])
    expect(JSON.stringify(saved)).not.toContain('abc')
    expect(JSON.stringify(saved)).not.toContain('"42"')
  })

  it('survives reset(): leaving a workspace is not forgetting', () => {
    useQuickTestStore.getState().setField(key, 'inputs', '{"a":1}')
    useQuickTestStore.getState().reset()
    expect(useQuickTestStore.getState().remembered[key]?.inputs).toBe('{"a":1}')
    expect(quickTestView(useQuickTestStore.getState().views, key).inputs).toBeNull()
  })

  it('resetField drops the field back to its seed and forgets it', () => {
    const store = useQuickTestStore.getState()
    store.setField(key, 'inputs', '{"a":1}')
    store.setField(key, 'event', '{}')
    store.resetField(key, 'inputs')
    expect(quickTestView(useQuickTestStore.getState().views, key).inputs).toBeNull()
    expect(useQuickTestStore.getState().remembered[key]).toEqual({ event: '{}' })
    store.resetField(key, 'event')
    expect(useQuickTestStore.getState().remembered[key]).toBeUndefined()
  })

  it('editing a field clears its "not valid JSON" mark', () => {
    const store = useQuickTestStore.getState()
    store.setInvalid(key, 'event')
    expect(quickTestView(useQuickTestStore.getState().views, key).invalid).toBe('event')
    store.setField(key, 'event', '{}')
    expect(quickTestView(useQuickTestStore.getState().views, key).invalid).toBeNull()
  })

  it('caps how many steps are remembered, dropping the least recently edited', () => {
    const store = useQuickTestStore.getState()
    for (let i = 0; i < MAX_REMEMBERED_STEPS + 5; i++) {
      store.setField(quickTestKey('wf', `nodes/s${i}.ts`), 'inputs', '{}')
    }
    const keys = Object.keys(useQuickTestStore.getState().remembered)
    expect(keys).toHaveLength(MAX_REMEMBERED_STEPS)
    expect(keys).not.toContain(quickTestKey('wf', 'nodes/s0.ts'))
  })
})
