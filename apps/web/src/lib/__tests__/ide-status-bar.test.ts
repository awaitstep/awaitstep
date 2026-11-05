import { describe, expect, it } from 'vitest'
import type { TestSession } from '../api-client'
import { UP_TO_DATE } from '../ide/session-staleness'
import { sessionStatus, unsavedLabel } from '../ide/status-bar'

const IDLE = { starting: false, stopping: false }

function session(status: TestSession['status']): TestSession {
  return {
    id: 's',
    workflowId: 'wf',
    versionId: 'v1',
    runtime: 'sandbox',
    status,
    error: null,
    createdAt: '2026-11-05T14:02:00.000Z',
    lastUsedAt: '2026-11-05T14:02:00.000Z',
    files: {},
  }
}

describe('sessionStatus', () => {
  it('says there is no session', () => {
    expect(sessionStatus(null, UP_TO_DATE, IDLE)).toEqual({
      tone: 'idle',
      label: 'No test session',
    })
  })

  it('shows starting from the request and from the session', () => {
    expect(sessionStatus(null, UP_TO_DATE, { starting: true, stopping: false }).tone).toBe('info')
    expect(sessionStatus(session('starting'), UP_TO_DATE, IDLE).label).toMatch(/starting/)
  })

  it('shows a running session as ok, and behind as a warning that names why', () => {
    expect(sessionStatus(session('running'), UP_TO_DATE, IDLE).tone).toBe('ok')
    expect(sessionStatus(session('running'), { ...UP_TO_DATE, saved: 1 }, IDLE)).toEqual({
      tone: 'warn',
      label: 'Test session · behind your saves',
    })
    expect(sessionStatus(session('running'), { ...UP_TO_DATE, version: true }, IDLE).label).toBe(
      'Test session · older version',
    )
  })

  it('does not count unsaved files as behind', () => {
    expect(sessionStatus(session('running'), { ...UP_TO_DATE, unsaved: 3 }, IDLE).tone).toBe('ok')
  })

  it('shows failed as an error and stopped as idle', () => {
    expect(sessionStatus(session('failed'), UP_TO_DATE, IDLE).tone).toBe('error')
    expect(sessionStatus(session('stopped'), UP_TO_DATE, IDLE).tone).toBe('idle')
  })
})

describe('unsavedLabel', () => {
  it('appears only when something is unsaved', () => {
    expect(unsavedLabel(0)).toBeNull()
    expect(unsavedLabel(2)).toBe('2 unsaved ›')
  })
})
