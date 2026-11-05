import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { TestSessionState } from '../../../hooks/use-test-session'
import { UP_TO_DATE } from '../../../lib/ide/session-staleness'
import { RunPanel } from '../run-panel'

function state(overrides: Partial<TestSessionState> = {}): TestSessionState {
  return {
    session: {
      id: 's1',
      workflowId: 'wf',
      versionId: 'v1',
      runtime: 'sandbox',
      status: 'running',
      error: null,
      createdAt: '2026-11-05T14:02:00.000Z',
      lastUsedAt: '2026-11-05T14:02:00.000Z',
      files: {},
    },
    logs: [],
    lastResult: null,
    payload: '{}',
    starting: false,
    stopping: false,
    triggering: false,
    stale: { ...UP_TO_DATE, saved: 1, signature: 's:a.ts:h2' },
    streamError: null,
    actionError: null,
    acceptedSignature: null,
    acceptStale: vi.fn(),
    start: vi.fn(),
    stop: vi.fn(),
    trigger: vi.fn(),
    restart: vi.fn().mockResolvedValue(true),
    restartAndTrigger: vi.fn().mockResolvedValue(undefined),
    setPayload: vi.fn(),
    ...overrides,
  } as TestSessionState
}

describe('triggering a session that is behind', () => {
  it('asks first, and "Trigger anyway" triggers and remembers the choice', async () => {
    const s = state()
    render(<RunPanel session={s} onSaveAll={vi.fn()} />)
    await userEvent.click(screen.getByRole('button', { name: /Trigger/ }))
    expect(s.trigger).not.toHaveBeenCalled()
    await userEvent.click(await screen.findByRole('button', { name: 'Trigger anyway' }))
    expect(s.trigger).toHaveBeenCalledWith({})
    expect(s.acceptStale).toHaveBeenCalledWith('s:a.ts:h2')
  })

  it('does not ask again for changes already accepted', async () => {
    const s = state({ acceptedSignature: 's:a.ts:h2' })
    render(<RunPanel session={s} onSaveAll={vi.fn()} />)
    await userEvent.click(screen.getByRole('button', { name: /Trigger/ }))
    expect(s.trigger).toHaveBeenCalled()
  })

  it('"Restart and trigger" restarts first', async () => {
    const s = state()
    render(<RunPanel session={s} onSaveAll={vi.fn().mockResolvedValue(0)} />)
    await userEvent.click(screen.getByRole('button', { name: /Trigger/ }))
    await userEvent.click(await screen.findByRole('button', { name: 'Restart and trigger' }))
    expect(s.restartAndTrigger).toHaveBeenCalledWith({})
  })
})

describe('Save and restart', () => {
  it('restarts after every unsaved file saved', async () => {
    const s = state({ stale: { ...UP_TO_DATE, unsaved: 2 } })
    render(<RunPanel session={s} onSaveAll={vi.fn().mockResolvedValue(2)} />)
    await userEvent.click(screen.getByRole('button', { name: 'Save and restart' }))
    expect(s.restart).toHaveBeenCalled()
  })

  it('does not restart when a file failed to save', async () => {
    const s = state({ stale: { ...UP_TO_DATE, unsaved: 2 } })
    render(<RunPanel session={s} onSaveAll={vi.fn().mockResolvedValue(1)} />)
    await userEvent.click(screen.getByRole('button', { name: 'Save and restart' }))
    expect(s.restart).not.toHaveBeenCalled()
  })
})
