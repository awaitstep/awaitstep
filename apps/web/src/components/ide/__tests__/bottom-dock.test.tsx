import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { TestSessionState } from '../../../hooks/use-test-session'
import type { ProblemGroups } from '../../../lib/ide/problems'
import { UP_TO_DATE } from '../../../lib/ide/session-staleness'
import { useIdeLayoutStore } from '../../../stores/ide-layout-store'
import { useIdeStore } from '../../../stores/ide-store'
import { BottomDock } from '../bottom-dock'

const noSession = {
  session: null,
  logs: [],
  lastResult: null,
  payload: '{}',
  payloadError: null,
  setPayloadError: vi.fn(),
  startRequestedAt: null,
  starting: false,
  stopping: false,
  triggering: false,
  stale: UP_TO_DATE,
  streamError: null,
  actionError: null,
  acceptedSignature: null,
  acceptStale: vi.fn(),
  start: vi.fn(),
  stop: vi.fn(),
  trigger: vi.fn(),
  restart: vi.fn(),
  restartAndTrigger: vi.fn(),
  setPayload: vi.fn(),
} as unknown as TestSessionState

const problem = (file: string, message: string) => ({
  file,
  line: 3,
  column: 2,
  endLine: 3,
  endColumn: 3,
  message,
  severity: 'error' as const,
})

function renderDock(
  groups: ProblemGroups = { live: [problem('a.ts', 'Cannot find name x')], saved: [] },
) {
  return render(
    <BottomDock
      workflowId="wf"
      groups={groups}
      savedAt="14:01"
      testSession={noSession}
      activeFile={null}
      onSaveAll={vi.fn()}
      onTrigger={vi.fn()}
    />,
  )
}

beforeEach(() => {
  useIdeLayoutStore.setState({ dockTab: 'problems', dockOpen: true })
  useIdeStore.getState().resetSession()
})

describe('BottomDock tabs', () => {
  it('has exactly Problems, Test session and Quick test', () => {
    renderDock()
    expect(screen.getAllByRole('tab').map((t) => t.textContent?.replace(/\d+$/, ''))).toEqual([
      'Problems',
      'Test session',
      'Quick test',
    ])
  })

  it('moves between tabs with the arrow keys and focuses the new tab', async () => {
    renderDock()
    const [problems] = screen.getAllByRole('tab')
    problems!.focus()
    await userEvent.keyboard('{ArrowRight}')
    expect(useIdeLayoutStore.getState().dockTab).toBe('session')
    expect(screen.getByRole('tab', { name: 'Test session' })).toHaveFocus()
    await userEvent.keyboard('{ArrowLeft}{ArrowLeft}')
    expect(useIdeLayoutStore.getState().dockTab).toBe('quickTest')
  })

  it('"Use the test session instead" hands focus to the Test session tab, not the page', async () => {
    useIdeLayoutStore.setState({ dockTab: 'quickTest', dockOpen: true })
    renderDock()
    await userEvent.click(screen.getByRole('button', { name: 'Use the test session instead' }))
    expect(useIdeLayoutStore.getState().dockTab).toBe('session')
    expect(screen.getByRole('tab', { name: 'Test session' })).toHaveFocus()
  })

  it('names the live dot on a running session’s tab as an image', () => {
    render(
      <BottomDock
        workflowId="wf"
        groups={{ live: [], saved: [] }}
        savedAt={null}
        testSession={{ ...noSession, session: { id: 's', status: 'running' } } as never}
        activeFile={null}
        onSaveAll={vi.fn()}
        onTrigger={vi.fn()}
      />,
    )
    expect(screen.getByRole('img', { name: 'Test session running' })).toBeInTheDocument()
  })

  it('makes only the active tab a tab stop', () => {
    renderDock()
    const tabs = screen.getAllByRole('tab')
    expect(tabs.map((t) => t.tabIndex)).toEqual([0, -1, -1])
  })

  it('hands focus to the editor on Esc', async () => {
    const focus = vi.fn()
    useIdeStore.getState().setEditorHandle({ focus, trigger: vi.fn() })
    renderDock()
    screen.getAllByRole('tab')[0]!.focus()
    await userEvent.keyboard('{Escape}')
    expect(focus).toHaveBeenCalledTimes(1)
  })

  it('ignores an Esc that something else already used', async () => {
    const focus = vi.fn()
    useIdeStore.getState().setEditorHandle({ focus, trigger: vi.fn() })
    renderDock()
    // A child that handled Esc (a menu closing) calls preventDefault first.
    screen.getAllByRole('tab')[0]!.addEventListener('keydown', (e) => e.preventDefault())
    screen.getAllByRole('tab')[0]!.focus()
    await userEvent.keyboard('{Escape}')
    expect(focus).not.toHaveBeenCalled()
  })

  it('does not treat an Esc from a portaled dialog as its own', async () => {
    const focus = vi.fn()
    useIdeStore.getState().setEditorHandle({ focus, trigger: vi.fn() })
    renderDock()
    // A node outside the dock's DOM (a dialog portal) reaching the handler via React bubbling.
    const outside = document.createElement('div')
    document.body.appendChild(outside)
    const { fireEvent } = await import('@testing-library/react')
    fireEvent.keyDown(outside, { key: 'Escape' })
    expect(focus).not.toHaveBeenCalled()
  })
})

describe('Problems tab', () => {
  it('shows the two groups with the saved group time', () => {
    renderDock({
      live: [problem('a.ts', 'live one')],
      saved: [
        { problem: problem('b.ts', 'saved one'), pending: false },
        { problem: problem('c.ts', 'edited since'), pending: true },
        { problem: problem('', 'no place'), pending: false },
      ],
    })
    expect(screen.getByRole('region', { name: 'As you type' })).toHaveTextContent('live one')
    const saved = screen.getByRole('region', { name: 'From your saved files · 14:01' })
    expect(saved).toHaveTextContent('From your saved files · 14:01 · 3')
    expect(saved).toHaveTextContent('saved one')
  })

  it('dims server rows of a file with unsaved edits and says they are re-checked on save', () => {
    renderDock({
      live: [],
      saved: [
        { problem: problem('b.ts', 'saved one'), pending: false },
        { problem: problem('c.ts', 'edited since'), pending: true },
      ],
    })
    const rows = screen.getAllByRole('button')
    const edited = rows.find((r) => r.textContent?.includes('edited since'))!
    const fresh = rows.find((r) => r.textContent?.includes('saved one'))!
    expect(edited).toHaveAttribute('data-pending', 'true')
    expect(edited).toHaveTextContent('re-checked on save')
    expect(fresh).not.toHaveAttribute('data-pending')
    expect(fresh).not.toHaveTextContent('re-checked on save')
  })

  it('places a finding with no file under "no location" and does not navigate', async () => {
    useIdeStore.getState().setEditorHandle(null)
    renderDock({ live: [], saved: [{ problem: problem('', 'no place'), pending: false }] })
    expect(screen.getByText('no location')).toBeInTheDocument()
    const reveal = vi.spyOn(useIdeStore.getState(), 'revealLocation')
    await userEvent.click(screen.getByRole('button', { name: /no place/ }))
    expect(reveal).not.toHaveBeenCalled()
  })

  it('counts both groups on the tab', () => {
    renderDock({
      live: [problem('a.ts', 'l')],
      saved: [{ problem: problem('b.ts', 's'), pending: false }],
    })
    expect(screen.getByRole('tab', { name: /Problems/ })).toHaveTextContent('2')
  })

  it('says so when there is nothing to show', () => {
    renderDock({ live: [], saved: [] })
    expect(screen.getByText('No problems detected')).toBeInTheDocument()
  })
})
