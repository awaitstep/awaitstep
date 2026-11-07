import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { IdeCommandActions } from '../../../lib/ide/commands'
import { useIdeStore } from '../../../stores/ide-store'
import { CommandPalette } from '../command-palette'

function actions(): IdeCommandActions {
  return new Proxy({} as IdeCommandActions, { get: () => vi.fn() })
}

function renderPalette(runBlockedReason: string | null) {
  render(
    <CommandPalette
      actions={actions()}
      canEdit
      editBlockedReason={null}
      activeStepId={null}
      activeIsStoredFile={false}
      activeIsHandlersFile={false}
      activeDirty={false}
      activeMovedOnServer={false}
      dirtyCount={0}
      runBlockedReason={runBlockedReason}
      runLabel="Save a version first"
      runEnabled
      canStartSession
      canStopSession={false}
      canTriggerSession={false}
    />,
  )
}

beforeEach(() => {
  useIdeStore.getState().resetSession()
  useIdeStore.getState().showDialog('palette')
})

describe('CommandPalette without a saved version', () => {
  it('lists Run and the session commands disabled, each saying what to do', () => {
    renderPalette('Save a version on the canvas first')
    const start = screen.getByRole('option', { name: /Test Session: Start/ })
    expect(start).toHaveAttribute('aria-disabled', 'true')
    expect(start).toHaveTextContent('Save a version on the canvas first')
    const run = screen.getByRole('option', { name: /^Run/ })
    expect(run).toHaveAttribute('aria-disabled', 'true')
    // The reason is said once: the label does not repeat it.
    expect(run).not.toHaveTextContent('Save a version first')
    // Showing the tab is a view, and the tab says what to do.
    expect(screen.getByRole('option', { name: /Quick Test This Step/ })).not.toHaveAttribute(
      'aria-disabled',
      'true',
    )
  })

  it('shows no reason and leaves them enabled once a version exists', () => {
    renderPalette(null)
    expect(screen.getByRole('option', { name: /Test Session: Start/ })).not.toHaveAttribute(
      'aria-disabled',
      'true',
    )
    expect(screen.queryByText('Save a version on the canvas first')).toBeNull()
  })
})
