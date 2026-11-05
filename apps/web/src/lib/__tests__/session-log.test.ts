import { describe, it, expect } from 'vitest'
import type { TestSession } from '../api-client'
import { canTrigger, runAction, sessionSummary } from '../ide/session-log'

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
    expect(runAction(null, IDLE)).toMatchObject({ kind: 'start', label: 'Run' })
  })

  it('offers to stop a running session', () => {
    expect(runAction(session(), IDLE)).toMatchObject({ kind: 'stop' })
  })

  it('offers neither while a session is starting', () => {
    // Pressing Run again here is how a user ends up with two sessions.
    expect(runAction(session({ status: 'starting' }), IDLE)).toMatchObject({ kind: 'busy' })
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
})
