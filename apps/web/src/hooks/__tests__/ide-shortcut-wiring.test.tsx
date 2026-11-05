import { act, cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { GeneratedFile } from '@awaitstep/codegen'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { RunConfirmDialog } from '../../components/ide/run-confirm-dialog'
import { runShortcut } from '../../lib/ide/key-ownership'
import { UP_TO_DATE } from '../../lib/ide/session-staleness'
import { useIdeLayoutStore } from '../../stores/ide-layout-store'
import { useIdeSearchStore } from '../../stores/ide-search-store'
import { useIdeStore } from '../../stores/ide-store'
import { useQuickTestStore } from '../../stores/quick-test-store'
import { useIdeShortcuts } from '../use-ide-shortcuts'
import { useRunAction } from '../use-run-action'
import { useSearchActions } from '../use-search-actions'
import type { TestSessionState } from '../use-test-session'

vi.mock('../../lib/action-toast', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>()
  return { ...actual, actionToast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }
})

const files = new Map<string, GeneratedFile>()
let trigger: ReturnType<typeof vi.fn>
let restartAndTrigger: ReturnType<typeof vi.fn>

function session(unsaved: number): TestSessionState {
  trigger = vi.fn().mockResolvedValue(undefined)
  restartAndTrigger = vi.fn().mockResolvedValue(undefined)
  return {
    session: { id: 's', status: 'running', runtime: 'sandbox', createdAt: '2026-11-05T14:00:00Z' },
    payload: '{}',
    setPayloadError: vi.fn(),
    starting: false,
    stopping: false,
    stale: { ...UP_TO_DATE, unsaved },
    acceptedSignature: null,
    acceptStale: vi.fn(),
    triggering: false,
    trigger,
    restartAndTrigger,
  } as unknown as TestSessionState
}

/** The real shortcut, Run and Search hooks wired as the workspace wires them. */
function Harness({ testSession }: { testSession: TestSessionState }) {
  const runAction = useRunAction({
    workflowId: 'wf',
    hasVersion: true,
    testSession,
    activeFile: { path: 'lib/a.ts', source: 'export const a = 1' },
    onSaveAll: vi.fn().mockResolvedValue(1),
  })
  const search = useSearchActions(files)
  useIdeShortcuts({
    run: runShortcut(runAction.run),
    findInFiles: search.findInFiles,
    nextSearchHit: search.nextSearchHitKey,
    prevSearchHit: search.prevSearchHitKey,
  })
  return (
    <>
      <input aria-label="Search" />
      <textarea aria-label="Trigger payload" data-ide-run-field="" />
      <button onClick={runAction.run}>Palette Run</button>
      <div id="editor-focus" tabIndex={-1} />
      <RunConfirmDialog confirm={runAction.confirm} />
    </>
  )
}

let focusEditor: ReturnType<typeof vi.fn<() => void>>
beforeEach(() => {
  focusEditor = vi.fn<() => void>()
  useIdeStore.getState().resetSession()
  useIdeStore
    .getState()
    .setEditorHandle({ focus: focusEditor, trigger: vi.fn(), searchSeed: () => null })
  useIdeLayoutStore.setState({ dockTab: 'problems', dockOpen: false })
  useIdeSearchStore.getState().reset()
  useQuickTestStore.getState().reset()
})
afterEach(() => {
  cleanup()
  document.body.innerHTML = ''
})

describe('Run and Search shortcuts, wired together', () => {
  it('does not run, or take focus, on Alt+Enter typed in the Search box', async () => {
    const user = userEvent.setup()
    render(<Harness testSession={session(0)} />)
    await user.click(screen.getByLabelText('Search'))
    await user.keyboard('{Alt>}{Enter}{/Alt}')
    expect(trigger).not.toHaveBeenCalled()
    expect(focusEditor).not.toHaveBeenCalled()
    expect(screen.getByLabelText('Search')).toHaveFocus()
  })

  it('runs on Alt+Enter typed in the trigger payload box', async () => {
    const user = userEvent.setup()
    render(<Harness testSession={session(0)} />)
    await user.click(screen.getByLabelText('Trigger payload'))
    await user.keyboard('{Alt>}{Enter}{/Alt}')
    expect(trigger).toHaveBeenCalledTimes(1)
  })

  it('runs on Alt+Enter from the page', async () => {
    const user = userEvent.setup()
    render(<Harness testSession={session(0)} />)
    await user.keyboard('{Alt>}{Enter}{/Alt}')
    expect(trigger).toHaveBeenCalledTimes(1)
  })

  it('leaves Alt+Enter to Monaco while its find widget is visible', async () => {
    const user = userEvent.setup()
    render(<Harness testSession={session(0)} />)
    document.body.insertAdjacentHTML('beforeend', '<div class="find-widget visible"></div>')
    await user.keyboard('{Alt>}{Enter}{/Alt}')
    expect(trigger).not.toHaveBeenCalled()
    document.querySelector('.find-widget')!.className = 'find-widget'
    await user.keyboard('{Alt>}{Enter}{/Alt}')
    expect(trigger).toHaveBeenCalledTimes(1)
  })

  it('ignores Shift+Mod+F while the Run question is open', async () => {
    const user = userEvent.setup()
    render(<Harness testSession={session(2)} />)
    await user.click(screen.getByText('Palette Run'))
    expect(await screen.findByRole('alertdialog')).toBeInTheDocument()
    await user.keyboard('{Control>}{Shift>}f{/Shift}{/Control}')
    expect(useIdeSearchStore.getState().focusRequested).toBe(false)
    expect(screen.getByRole('alertdialog')).toBeInTheDocument()
  })

  it.each(['Save, restart and run', 'Run saved files', 'Cancel'])(
    'puts focus in the editor after the Run question is answered with %s',
    async (label) => {
      const user = userEvent.setup()
      render(<Harness testSession={session(2)} />)
      await user.click(screen.getByText('Palette Run'))
      await screen.findByRole('alertdialog')
      focusEditor.mockClear()
      await user.click(screen.getByRole('button', { name: label }))
      await act(async () => {
        await new Promise((r) => setTimeout(r, 20))
      })
      expect(screen.queryByRole('alertdialog')).toBeNull()
      expect(focusEditor).toHaveBeenCalled()
    },
  )
})
