import { describe, it, expect, beforeEach } from 'vitest'
import type { ProcessLogEntry } from '@awaitstep/codegen'
import { MAX_LOG_LINES, sessionView, useTestSessionStore } from '../test-session-store'

function line(text: string): ProcessLogEntry {
  return { timestamp: 1, stream: 'stdout', text }
}

const SESSION = 's-1'

describe('test session store', () => {
  beforeEach(() => {
    useTestSessionStore.setState({ views: {} })
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

  it('holds the payload being edited, per session', () => {
    const store = useTestSessionStore.getState()
    store.setPayload(SESSION, '{"a":1}')
    // Switching dock tabs unmounts the panel; the text has to outlive it.
    expect(view().payload).toBe('{"a":1}')
    expect(view('other').payload).toBe('{}')
  })

  it('reports an empty view for a session it has never seen', () => {
    expect(sessionView({}, null)).toMatchObject({ logs: [], payload: '{}' })
  })
})
