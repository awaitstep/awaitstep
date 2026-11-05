import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { TestSessionState } from '../use-test-session'
import { UP_TO_DATE } from '../../lib/ide/session-staleness'
import { useIdeLayoutStore } from '../../stores/ide-layout-store'
import { useIdeStore } from '../../stores/ide-store'
import { useQuickTestStore } from '../../stores/quick-test-store'
import { useRunAction } from '../use-run-action'

vi.mock('../../lib/action-toast', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>()
  return { ...actual, actionToast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }
})

function state(over: Partial<TestSessionState> = {}): TestSessionState {
  return {
    session: null,
    payload: '{"a":1}',
    setPayloadError: vi.fn(),
    starting: false,
    stopping: false,
    stale: UP_TO_DATE,
    acceptedSignature: null,
    acceptStale: vi.fn(),
    triggering: false,
    trigger: vi.fn().mockResolvedValue(undefined),
    restartAndTrigger: vi.fn().mockResolvedValue(undefined),
    ...over,
  } as unknown as TestSessionState
}

const running = {
  id: 's',
  status: 'running',
  runtime: 'sandbox',
  createdAt: '2026-11-05T14:00:00.000Z',
} as TestSessionState['session']

const STEP = { path: 'nodes/validate_order.ts', source: 'export default async function f() {}' }
const LIB = { path: 'lib/charge.ts', source: 'export const x = 1' }

let focus: () => void
beforeEach(() => {
  focus = vi.fn<() => void>()
  useIdeStore.getState().resetSession()
  useIdeStore.getState().setEditorHandle({ focus, trigger: vi.fn() })
  useIdeLayoutStore.setState({ dockTab: 'problems', dockOpen: false })
  useQuickTestStore.getState().reset()
})

function setup(
  session: TestSessionState,
  file: { path: string; source: string } | null,
  save = vi.fn(),
) {
  return renderHook(() =>
    useRunAction({ workflowId: 'wf', testSession: session, activeFile: file, onSaveAll: save }),
  )
}

describe('useRunAction', () => {
  it('quick-tests a step file, opens Quick test, and returns focus to the editor', () => {
    const s = state()
    const { result } = setup(s, STEP)
    expect(result.current.intent.label).toBe('Quick test step')
    act(() => result.current.run())
    expect(useIdeLayoutStore.getState()).toMatchObject({ dockTab: 'quickTest', dockOpen: true })
    expect(s.trigger).not.toHaveBeenCalled()
    expect(focus).toHaveBeenCalled()
  })

  it('triggers a running, up-to-date session with the remembered payload', () => {
    const s = state({ session: running })
    const { result } = setup(s, LIB)
    expect(result.current.intent.label).toBe('Trigger session')
    act(() => result.current.run())
    expect(s.trigger).toHaveBeenCalledWith({ a: 1 })
    expect(useIdeLayoutStore.getState().dockTab).toBe('session')
    expect(focus).toHaveBeenCalled()
  })

  it('starts and triggers with no session', () => {
    const s = state()
    const { result } = setup(s, LIB)
    expect(result.current.intent.label).toBe('Start and trigger')
    act(() => result.current.run())
    expect(s.restartAndTrigger).toHaveBeenCalledWith({ a: 1 })
  })

  it('restarts and triggers a session that is behind', () => {
    const s = state({ session: running, stale: { ...UP_TO_DATE, saved: 1, signature: 'x' } })
    const { result } = setup(s, LIB)
    expect(result.current.intent.label).toBe('Restart and trigger')
    act(() => result.current.run())
    expect(s.restartAndTrigger).toHaveBeenCalled()
  })

  it('does not treat accepted-behind changes as behind', () => {
    const s = state({
      session: running,
      stale: { ...UP_TO_DATE, saved: 1, signature: 'x' },
      acceptedSignature: 'x',
    })
    expect(setup(s, LIB).result.current.intent.kind).toBe('trigger')
  })

  it('sends nothing and says why when the payload is not valid', () => {
    const s = state({ session: running, payload: '{nope' })
    const { result } = setup(s, LIB)
    act(() => result.current.run())
    expect(s.trigger).not.toHaveBeenCalled()
    expect(s.setPayloadError).toHaveBeenCalledWith('Not valid JSON')
    expect(useIdeLayoutStore.getState().dockTab).toBe('session')
  })

  it('refuses an oversized payload before anything is sent', () => {
    const s = state({ session: running, payload: JSON.stringify({ b: 'x'.repeat(120 * 1024) }) })
    const { result } = setup(s, LIB)
    act(() => result.current.run())
    expect(s.trigger).not.toHaveBeenCalled()
    expect(vi.mocked(s.setPayloadError).mock.calls[0]![0]).toMatch(/under 100 KB/)
  })

  it('does nothing but explain while the session is starting', () => {
    const s = state({ session: { ...running!, status: 'starting' } })
    const { result } = setup(s, LIB)
    expect(result.current.intent.kind).toBe('busy')
    act(() => result.current.run())
    expect(s.trigger).not.toHaveBeenCalled()
    expect(s.restartAndTrigger).not.toHaveBeenCalled()
  })

  describe('with unsaved files', () => {
    const dirty = { ...UP_TO_DATE, unsaved: 2 }

    it('asks once before starting, and Save and run saves first', async () => {
      const save = vi.fn().mockResolvedValue(2)
      const s = state({ stale: dirty })
      const { result } = setup(s, LIB, save)
      act(() => result.current.run())
      expect(result.current.confirm.open).toBe(true)
      expect(s.restartAndTrigger).not.toHaveBeenCalled()
      await act(async () => result.current.confirm.onConfirm())
      expect(save).toHaveBeenCalled()
      expect(s.restartAndTrigger).toHaveBeenCalledWith({ a: 1 })
      expect(result.current.confirm.open).toBe(false)
    })

    it('does not start when a file failed to save', async () => {
      const s = state({ stale: dirty })
      const { result } = setup(s, LIB, vi.fn().mockResolvedValue(1))
      act(() => result.current.run())
      await act(async () => result.current.confirm.onConfirm())
      expect(s.restartAndTrigger).not.toHaveBeenCalled()
    })

    it('Run saved files starts without saving', () => {
      const save = vi.fn()
      const s = state({ stale: dirty })
      const { result } = setup(s, LIB, save)
      act(() => result.current.run())
      act(() => result.current.confirm.onSecondary())
      expect(save).not.toHaveBeenCalled()
      expect(s.restartAndTrigger).toHaveBeenCalled()
    })

    it('closing the question runs nothing', () => {
      const s = state({ stale: dirty })
      const { result } = setup(s, LIB)
      act(() => result.current.run())
      act(() => result.current.confirm.onOpenChange(false))
      expect(result.current.confirm.open).toBe(false)
      expect(s.restartAndTrigger).not.toHaveBeenCalled()
    })

    it('asks before triggering a running session that lacks them, and Save restarts it', async () => {
      const save = vi.fn().mockResolvedValue(2)
      const s = state({ session: running, stale: dirty })
      const { result } = setup(s, LIB, save)
      act(() => result.current.run())
      expect(s.trigger).not.toHaveBeenCalled()
      expect(result.current.confirm).toMatchObject({
        open: true,
        description: 'The running session doesn’t have your 2 unsaved files.',
        confirmLabel: 'Save, restart and run',
      })
      await act(async () => result.current.confirm.onConfirm())
      expect(save).toHaveBeenCalled()
      expect(s.restartAndTrigger).toHaveBeenCalledWith({ a: 1 })
      expect(s.trigger).not.toHaveBeenCalled()
    })

    it('"Run saved files" triggers the running session as it is', () => {
      const s = state({ session: running, stale: dirty })
      const { result } = setup(s, LIB)
      act(() => result.current.run())
      act(() => result.current.confirm.onSecondary())
      expect(s.trigger).toHaveBeenCalledWith({ a: 1 })
    })

    it('does not ask when nothing is unsaved', () => {
      const s = state({ session: running })
      const { result } = setup(s, LIB)
      act(() => result.current.run())
      expect(result.current.confirm.open).toBe(false)
      expect(s.trigger).toHaveBeenCalled()
    })
  })

  describe('triggerSession (Trigger button, palette)', () => {
    const behind = { ...UP_TO_DATE, saved: 1, signature: 's:a.ts:h2' }

    it('asks about older code, as the Run does, and "Trigger anyway" remembers the choice', () => {
      const s = state({ session: running, stale: behind })
      const { result } = setup(s, LIB)
      act(() => result.current.triggerSession())
      expect(s.trigger).not.toHaveBeenCalled()
      expect(result.current.confirm).toMatchObject({
        open: true,
        title: 'This session is running older code',
        secondaryLabel: 'Trigger anyway',
      })
      act(() => result.current.confirm.onSecondary())
      expect(s.acceptStale).toHaveBeenCalledWith('s:a.ts:h2')
      expect(s.trigger).toHaveBeenCalledWith({ a: 1 })
    })

    it('does not ask again for changes already accepted', () => {
      const s = state({ session: running, stale: behind, acceptedSignature: 's:a.ts:h2' })
      const { result } = setup(s, LIB)
      act(() => result.current.triggerSession())
      expect(s.trigger).toHaveBeenCalled()
    })

    it('Restart and trigger restarts first', async () => {
      const s = state({ session: running, stale: behind })
      const { result } = setup(s, LIB, vi.fn().mockResolvedValue(0))
      act(() => result.current.triggerSession())
      await act(async () => result.current.confirm.onConfirm())
      expect(s.restartAndTrigger).toHaveBeenCalledWith({ a: 1 })
    })

    it('does nothing while a trigger is running or there is no running session', () => {
      const busy = state({ session: running, triggering: true })
      const first = setup(busy, LIB)
      act(() => first.result.current.triggerSession())
      expect(busy.trigger).not.toHaveBeenCalled()
      const none = state()
      const second = setup(none, LIB)
      act(() => second.result.current.triggerSession())
      expect(none.trigger).not.toHaveBeenCalled()
    })
  })

  it('Run is busy, not a second trigger, while one is in flight', () => {
    const s = state({ session: running, triggering: true })
    const { result } = setup(s, LIB)
    expect(result.current.intent).toMatchObject({ kind: 'busy', label: 'Running…' })
    act(() => result.current.run())
    expect(s.trigger).not.toHaveBeenCalled()
  })
})
