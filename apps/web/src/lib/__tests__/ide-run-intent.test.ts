import { describe, expect, it } from 'vitest'
import type { TestSession } from '../api-client'
import { runIntent, sessionCommands, type RunIntentInput } from '../ide/run-intent'

function session(status: TestSession['status'] = 'running'): TestSession {
  return {
    id: 's1',
    workflowId: 'wf',
    versionId: 'v1',
    runtime: 'sandbox',
    status,
    error: null,
    createdAt: '2026-11-05T14:00:00.000Z',
    lastUsedAt: '2026-11-05T14:00:00.000Z',
    files: {},
  }
}

function input(overrides: Partial<RunIntentInput> = {}): RunIntentInput {
  return {
    isStep: false,
    session: null,
    starting: false,
    stopping: false,
    triggering: false,
    behind: false,
    unsavedCount: 0,
    ...overrides,
  }
}

describe('runIntent', () => {
  it('quick-tests a step file whatever the session is doing', () => {
    for (const s of [null, session(), session('starting')]) {
      expect(runIntent(input({ isStep: true, session: s, unsavedCount: 3 }))).toEqual({
        kind: 'quickTest',
        label: 'Quick test step',
        needsSave: false,
      })
    }
  })

  it('starts and triggers when there is no session', () => {
    expect(runIntent(input())).toMatchObject({
      kind: 'startAndTrigger',
      label: 'Start and trigger',
    })
  })

  it('starts again after a session stopped or failed', () => {
    for (const status of ['stopped', 'failed'] as const) {
      expect(runIntent(input({ session: session(status) })).kind, status).toBe('startAndTrigger')
    }
  })

  it('triggers a running session that is up to date', () => {
    expect(runIntent(input({ session: session() }))).toMatchObject({
      kind: 'trigger',
      label: 'Trigger session',
      needsSave: false,
    })
  })

  it('restarts and triggers a session that is behind', () => {
    expect(runIntent(input({ session: session(), behind: true }))).toMatchObject({
      kind: 'restartAndTrigger',
      label: 'Restart and trigger',
    })
  })

  it('asks to save only when it will (re)start the session', () => {
    expect(runIntent(input({ unsavedCount: 2 })).needsSave).toBe(true)
    expect(runIntent(input({ session: session(), behind: true, unsavedCount: 2 })).needsSave).toBe(
      true,
    )
    // A running session cannot hold unsaved files, so triggering it asks too.
    expect(runIntent(input({ session: session(), unsavedCount: 2 }))).toMatchObject({
      kind: 'trigger',
      needsSave: true,
    })
    expect(runIntent(input({ session: session(), unsavedCount: 0 })).needsSave).toBe(false)
  })

  it('is disabled while a session is starting, by request or by status', () => {
    expect(runIntent(input({ starting: true }))).toMatchObject({ kind: 'busy', label: 'Starting…' })
    expect(runIntent(input({ session: session('starting') }))).toMatchObject({ kind: 'busy' })
  })

  it('is disabled while a session is stopping', () => {
    expect(runIntent(input({ session: session(), stopping: true }))).toMatchObject({
      kind: 'busy',
      label: 'Stopping…',
    })
  })
})

describe('a trigger in flight', () => {
  it('makes Run busy, so holding the key runs the workflow once', () => {
    expect(runIntent(input({ session: session(), triggering: true }))).toMatchObject({
      kind: 'busy',
      label: 'Running…',
    })
  })
})

describe('sessionCommands', () => {
  const idle = { starting: false, stopping: false, triggering: false }

  it('offers Start only with nothing running, starting or in flight', () => {
    expect(sessionCommands(null, idle).canStart).toBe(true)
    expect(sessionCommands(session('stopped'), idle).canStart).toBe(true)
    expect(sessionCommands(session(), idle).canStart).toBe(false)
    expect(sessionCommands(null, { ...idle, starting: true }).canStart).toBe(false)
    expect(sessionCommands(null, { ...idle, stopping: true }).canStart).toBe(false)
  })

  it('offers Stop for a session that can be stopped, once', () => {
    expect(sessionCommands(session(), idle).canStop).toBe(true)
    expect(sessionCommands(session('starting'), idle).canStop).toBe(true)
    expect(sessionCommands(session(), { ...idle, stopping: true }).canStop).toBe(false)
    expect(sessionCommands(null, idle).canStop).toBe(false)
  })

  it('offers Trigger for a running session with nothing in flight', () => {
    expect(sessionCommands(session(), idle).canTrigger).toBe(true)
    expect(sessionCommands(session(), { ...idle, triggering: true }).canTrigger).toBe(false)
    expect(sessionCommands(session(), { ...idle, stopping: true }).canTrigger).toBe(false)
    expect(sessionCommands(session('starting'), idle).canTrigger).toBe(false)
  })
})
