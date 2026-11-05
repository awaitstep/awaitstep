import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { TestSessionState } from '../../../hooks/use-test-session'
import { UP_TO_DATE } from '../../../lib/ide/session-staleness'
import { TestSessionPanel } from '../test-session-panel'

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
    payloadError: null,
    setPayloadError: vi.fn(),
    startRequestedAt: null,
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

describe('Trigger', () => {
  it('hands off to the workspace’s trigger, which asks when it should', async () => {
    const s = state()
    const onTrigger = vi.fn()
    render(<TestSessionPanel session={s} onSaveAll={vi.fn()} onTrigger={onTrigger} />)
    await userEvent.click(screen.getByRole('button', { name: /Trigger/ }))
    expect(onTrigger).toHaveBeenCalled()
    expect(s.trigger).not.toHaveBeenCalled()
  })
})

describe('a stopped session', () => {
  it('does not warn about saved or unsaved files it never had', () => {
    const s = state()
    const stopped = state({
      session: { ...s.session!, status: 'stopped' },
      stale: { ...UP_TO_DATE, saved: 2, unsaved: 1, version: true },
    })
    render(<TestSessionPanel session={stopped} onSaveAll={vi.fn()} onTrigger={vi.fn()} />)
    expect(screen.queryByText(/since this session started/)).toBeNull()
    expect(screen.queryByText(/newer version was saved/)).toBeNull()
    expect(screen.queryByText(/unsaved file/)).toBeNull()
  })
})

describe('Save and restart', () => {
  it('restarts after every unsaved file saved', async () => {
    const s = state({ stale: { ...UP_TO_DATE, unsaved: 2 } })
    render(
      <TestSessionPanel session={s} onSaveAll={vi.fn().mockResolvedValue(2)} onTrigger={vi.fn()} />,
    )
    await userEvent.click(screen.getByRole('button', { name: 'Save and restart' }))
    expect(s.restart).toHaveBeenCalled()
  })

  it('does not restart when a file failed to save', async () => {
    const s = state({ stale: { ...UP_TO_DATE, unsaved: 2 } })
    render(
      <TestSessionPanel session={s} onSaveAll={vi.fn().mockResolvedValue(1)} onTrigger={vi.fn()} />,
    )
    await userEvent.click(screen.getByRole('button', { name: 'Save and restart' }))
    expect(s.restart).not.toHaveBeenCalled()
  })
})
