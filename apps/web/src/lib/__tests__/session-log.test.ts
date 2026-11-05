import { describe, it, expect } from 'vitest'
import type { TestSession } from '../api-client'
import type { SessionLogLine } from '../../stores/test-session-store'
import {
  MAX_TRIGGER_PAYLOAD_BYTES,
  canTrigger,
  countStderr,
  elapsedSeconds,
  filterLogLines,
  formatLogTime,
  parseTriggerPayload,
  runAction,
  sessionSummary,
  startPhase,
  startPhaseLabel,
} from '../ide/session-log'

const IDLE = { starting: false, stopping: false }

function session(overrides: Partial<TestSession> = {}): TestSession {
  return {
    id: 's-1',
    workflowId: 'wf-1',
    versionId: 'v-1',
    runtime: 'node',
    status: 'running',
    error: null,
    createdAt: '2026-10-20T00:00:00.000Z',
    lastUsedAt: '2026-10-20T00:00:00.000Z',
    files: null,
    ...overrides,
  }
}

describe('runAction', () => {
  it('offers to start when there is no session', () => {
    expect(runAction(null, IDLE)).toMatchObject({ kind: 'start', label: 'Start' })
  })

  it('offers to stop a running session', () => {
    expect(runAction(session(), IDLE)).toMatchObject({ kind: 'stop' })
  })

  it('offers Cancel, not Start, while a session is starting', () => {
    // Pressing Start again here is how a user ends up with two sessions.
    expect(runAction(session({ status: 'starting' }), IDLE)).toMatchObject({
      kind: 'cancel',
      label: 'Cancel',
    })
  })

  it('still offers Cancel when the start request returned and the poll is in flight', () => {
    expect(
      runAction(session({ status: 'starting' }), { starting: true, stopping: false }),
    ).toMatchObject({ kind: 'cancel' })
  })

  it('offers to start again once a session has finished', () => {
    for (const status of ['stopped', 'failed'] as const) {
      expect(runAction(session({ status }), IDLE), status).toMatchObject({ kind: 'start' })
    }
  })

  it('is busy while a start or stop is in flight', () => {
    expect(runAction(session(), { starting: true, stopping: false })).toMatchObject({
      kind: 'busy',
      label: 'Starting…',
    })
    expect(runAction(session(), { starting: false, stopping: true })).toMatchObject({
      kind: 'busy',
      label: 'Stopping…',
    })
  })
})

describe('a trigger in flight', () => {
  it('still offers Stop', () => {
    // A handler that never returns must not be what prevents stopping the
    // session running it.
    expect(runAction(session(), IDLE)).toMatchObject({ kind: 'stop' })
  })
})

describe('canTrigger', () => {
  it('allows a trigger only while a session is running', () => {
    expect(canTrigger(session())).toBe(true)
    expect(canTrigger(session({ status: 'starting' }))).toBe(false)
    expect(canTrigger(session({ status: 'stopped' }))).toBe(false)
    expect(canTrigger(null)).toBe(false)
  })
})

describe('sessionSummary', () => {
  it('says where a running session is', () => {
    expect(sessionSummary(session())).toContain('this machine')
    expect(sessionSummary(session({ runtime: 'sandbox' }))).toContain('container')
  })

  it('reports a lost stream above everything else', () => {
    // It is why the output stopped moving.
    expect(sessionSummary(session(), { streamError: 'Lost the log stream — retrying' })).toBe(
      'Lost the log stream — retrying',
    )
  })

  it('says when the session is running older code', () => {
    // Otherwise a user tests the bundle they just replaced and believes it.
    expect(sessionSummary(session(), { stale: true })).toContain('older version')
  })

  it('prefers the session’s own reason for stopping', () => {
    // "Stopped" alone leaves the user to guess whether they did it.
    expect(
      sessionSummary(
        session({ status: 'stopped', error: 'Test session stopped after being idle' }),
      ),
    ).toBe('Test session stopped after being idle')
    expect(sessionSummary(session({ status: 'stopped' }))).toBe('Test session stopped')
  })

  it('says when there is nothing running', () => {
    expect(sessionSummary(null)).toBe('No test session')
  })

  it('says a failed session failed to start when it gave no reason', () => {
    expect(sessionSummary(session({ status: 'failed' }))).toBe('Test session failed to start')
  })
})

describe('startPhase', () => {
  it('is preparing while the request is in flight and no session exists yet', () => {
    expect(startPhase(null, { starting: true })).toBe('preparing')
  })

  it('is starting once the session exists but is not running', () => {
    expect(startPhase(session({ status: 'starting' }), { starting: false })).toBe('starting')
    expect(startPhase(session({ status: 'starting' }), { starting: true })).toBe('starting')
  })

  it('is null when nothing is starting', () => {
    expect(startPhase(null, { starting: false })).toBeNull()
    expect(startPhase(session(), { starting: false })).toBeNull()
    expect(startPhase(session({ status: 'failed' }), { starting: false })).toBeNull()
  })

  it('words each phase for where the session runs', () => {
    expect(startPhaseLabel('preparing', null)).toBe('Preparing your files…')
    expect(startPhaseLabel('starting', 'sandbox')).toBe('Starting the container…')
    expect(startPhaseLabel('starting', 'node')).toBe('Starting on this machine…')
  })

  it('counts elapsed whole seconds and never goes negative', () => {
    expect(elapsedSeconds(11_900, 10_000)).toBe(1)
    expect(elapsedSeconds(10_000, 12_000)).toBe(0)
  })
})

function logLine(id: number, stream: 'stdout' | 'stderr', text: string): SessionLogLine {
  return { id, stream, text, timestamp: id }
}

const LINES = [
  logLine(1, 'stdout', 'fetch GET /orders 200'),
  logLine(2, 'stderr', 'PaymentDeclined: ord_1'),
  logLine(3, 'stdout', 'done'),
  logLine(4, 'stderr', 'Warning: slow'),
]

describe('filterLogLines', () => {
  const all = { clearedBefore: 0, stream: 'all' as const, text: '' }

  it('returns everything by default', () => {
    expect(filterLogLines(LINES, all)).toHaveLength(4)
  })

  it('shows only stderr when asked, and the count matches', () => {
    const shown = filterLogLines(LINES, { ...all, stream: 'stderr' })
    expect(shown.map((l) => l.id)).toEqual([2, 4])
    expect(countStderr(LINES)).toBe(shown.length)
  })

  it('narrows by text, ignoring case and surrounding spaces, and clearing it brings lines back', () => {
    expect(filterLogLines(LINES, { ...all, text: ' PAYMENT ' }).map((l) => l.id)).toEqual([2])
    expect(filterLogLines(LINES, { ...all, text: '' })).toHaveLength(4)
  })

  it('hides lines up to the cleared id but not later ones', () => {
    expect(filterLogLines(LINES, { ...all, clearedBefore: 3 }).map((l) => l.id)).toEqual([4])
  })

  it('combines stream, text and clear', () => {
    expect(
      filterLogLines(LINES, { clearedBefore: 2, stream: 'stderr', text: 'warn' }).map((l) => l.id),
    ).toEqual([4])
  })
})

describe('formatLogTime', () => {
  it('is local HH:MM:SS.mmm with padded milliseconds', () => {
    const date = new Date(2026, 10, 5, 4, 5, 6, 7)
    expect(formatLogTime(date.getTime())).toBe('04:05:06.007')
  })
})

describe('parseTriggerPayload', () => {
  it('treats empty text as an empty object', () => {
    expect(parseTriggerPayload('  ')).toEqual({ ok: true, value: {} })
  })

  it('parses valid JSON', () => {
    expect(parseTriggerPayload('{"a":1}')).toEqual({ ok: true, value: { a: 1 } })
  })

  it('refuses text that is not JSON', () => {
    expect(parseTriggerPayload('{oops')).toEqual({ ok: false, error: 'Not valid JSON' })
  })

  it('refuses a payload over the limit, naming the limit and the size', () => {
    const big = JSON.stringify({ blob: 'x'.repeat(120 * 1024) })
    const result = parseTriggerPayload(big)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toContain('Payload must be under 100 KB')
      expect(result.error).toMatch(/12\d KB/)
    }
  })

  it('accepts a payload just under the limit', () => {
    const fits = JSON.stringify({ blob: 'x'.repeat(MAX_TRIGGER_PAYLOAD_BYTES - 20) })
    expect(parseTriggerPayload(fits).ok).toBe(true)
  })

  it('measures the compact form, as the server does', () => {
    // Lots of whitespace in the text must not count against the limit.
    const spaced = `{ "a" :${' '.repeat(MAX_TRIGGER_PAYLOAD_BYTES * 2)}1 }`
    expect(parseTriggerPayload(spaced).ok).toBe(true)
  })
})
