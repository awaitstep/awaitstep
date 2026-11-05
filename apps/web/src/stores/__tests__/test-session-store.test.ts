// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest'
import type { ProcessLogEntry } from '@awaitstep/codegen'
import {
  MAX_LOG_LINES,
  MAX_REMEMBERED_PAYLOADS,
  sessionView,
  useTestSessionStore,
} from '../test-session-store'

function line(text: string): ProcessLogEntry {
  return { timestamp: 1, stream: 'stdout', text }
}

const SESSION = 's-1'

describe('test session store', () => {
  beforeEach(() => {
    useTestSessionStore.setState({ views: {}, payloads: {}, payloadErrors: {} })
  })

  function view(sessionId = SESSION) {
    return sessionView(useTestSessionStore.getState().views, sessionId)
  }

  it('appends lines in order and remembers the cursor', () => {
    useTestSessionStore.getState().appendLogs(SESSION, [line('a'), line('b')], '2:0')
    expect(view().logs.map((l) => l.text)).toEqual(['a', 'b'])
    expect(view().cursor).toBe('2:0')
  })

  it('gives every line an id that survives trimming', () => {
    const store = useTestSessionStore.getState()
    store.appendLogs(SESSION, [line('first')], '1')
    const firstId = view().logs[0]!.id

    store.appendLogs(SESSION, [line('second')], '2')
    // Keys built from the array index change under every line once the
    // buffer starts trimming, which remounts the whole list.
    expect(view().logs[0]!.id).toBe(firstId)
    expect(view().logs[1]!.id).not.toBe(firstId)
  })

  it('keeps the newest lines once the buffer is full', () => {
    const store = useTestSessionStore.getState()
    store.appendLogs(
      SESSION,
      Array.from({ length: MAX_LOG_LINES }, (_, i) => line(`old-${i}`)),
      '1',
    )
    store.appendLogs(SESSION, [line('new')], '2')

    const logs = view().logs
    expect(logs).toHaveLength(MAX_LOG_LINES)
    expect(logs.at(-1)!.text).toBe('new')
    // The oldest goes: trimming the other end hides what is being waited on.
    expect(logs[0]!.text).toBe('old-1')
  })

  it('advances the cursor even when a page carries nothing new', () => {
    const store = useTestSessionStore.getState()
    store.appendLogs(SESSION, [], '7:3')
    expect(view().cursor).toBe('7:3')
    expect(view().logs).toEqual([])
  })

  it('keeps each session separate', () => {
    const store = useTestSessionStore.getState()
    store.appendLogs('a', [line('from a')], '1')
    store.appendLogs('b', [line('from b')], '1')
    expect(view('a').logs.map((l) => l.text)).toEqual(['from a'])
    expect(view('b').logs.map((l) => l.text)).toEqual(['from b'])
  })

  it('forgets a session entirely on reset', () => {
    const store = useTestSessionStore.getState()
    store.appendLogs(SESSION, [line('a')], '1')
    store.setResult(SESSION, { status: 200, body: {} })
    store.reset(SESSION)

    // A new session must not inherit the cursor, or the server replays
    // every line it already sent.
    expect(view().logs).toEqual([])
    expect(view().lastResult).toBeNull()
    expect(view().cursor).toBeUndefined()
  })

  it('holds the payload being edited, per workflow', () => {
    const store = useTestSessionStore.getState()
    store.setPayload('wf-1', '{"a":1}')
    // Switching dock tabs unmounts the panel; the text has to outlive it.
    expect(useTestSessionStore.getState().payloads['wf-1']).toBe('{"a":1}')
    expect(useTestSessionStore.getState().payloads['wf-2']).toBeUndefined()
  })

  it('keeps the payload when a session ends and a new one has a different id', () => {
    useTestSessionStore.getState().setPayload('wf-1', '{"keep":true}')
    useTestSessionStore.getState().reset('s-old')
    expect(useTestSessionStore.getState().payloads['wf-1']).toBe('{"keep":true}')
  })

  it('forgets the oldest workflows beyond the cap, and a touched one counts as newest', () => {
    const store = useTestSessionStore.getState()
    for (let i = 0; i < MAX_REMEMBERED_PAYLOADS; i++) store.setPayload(`wf-${i}`, '{}')
    store.setPayload('wf-0', '{"again":1}')
    store.setPayload('wf-new', '{}')
    const keys = Object.keys(useTestSessionStore.getState().payloads)
    expect(keys).toHaveLength(MAX_REMEMBERED_PAYLOADS)
    expect(keys).toContain('wf-0')
    expect(keys).not.toContain('wf-1')
  })

  it('clears the payload error as soon as the payload is edited', () => {
    const store = useTestSessionStore.getState()
    store.setPayloadError('wf-1', 'Not valid JSON')
    expect(useTestSessionStore.getState().payloadErrors['wf-1']).toBe('Not valid JSON')
    store.setPayload('wf-1', '{}')
    expect(useTestSessionStore.getState().payloadErrors['wf-1']).toBeUndefined()
  })

  it('persists only payloads: never logs, results or errors', () => {
    const store = useTestSessionStore.getState()
    store.setPayload('wf-1', '{"a":1}')
    store.setPayloadError('wf-1', 'Not valid JSON')
    store.appendLogs(SESSION, [line('secret=abc')], '1')
    const saved = JSON.parse(localStorage.getItem('awaitstep-test-session') ?? '{}') as {
      state: Record<string, unknown>
    }
    // owner and savedAt are the retention envelope, not remembered text.
    expect(Object.keys(saved.state).sort()).toEqual(['owner', 'payloads', 'savedAt'])
    expect(JSON.stringify(saved)).not.toContain('secret=abc')
  })

  it('Clear view hides lines so far but not the ones that follow', () => {
    const store = useTestSessionStore.getState()
    store.appendLogs(SESSION, [line('a'), line('b')], '2')
    store.clearView(SESSION)
    expect(view().clearedBefore).toBe(2)
    store.appendLogs(SESSION, [line('c')], '3')
    expect(view().logs.map((l) => l.id)).toEqual([1, 2, 3])
    expect(
      view()
        .logs.filter((l) => l.id > view().clearedBefore)
        .map((l) => l.text),
    ).toEqual(['c'])
  })

  it('reports an empty view for a session it has never seen', () => {
    expect(sessionView({}, null)).toMatchObject({ logs: [], clearedBefore: 0 })
  })
})
