import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import {
  CONFLICT_UNSAVED_SENTENCE,
  EditorDialogs,
  type EditorDialogsProps,
} from '../editor-dialogs'

function props(overrides: Partial<EditorDialogsProps> = {}): EditorDialogsProps {
  return {
    confirmAction: null,
    setConfirmAction: vi.fn(),
    onConfirmSwitchTemplate: vi.fn(),
    onConfirmReload: vi.fn(),
    blockerStatus: 'idle',
    onBlockerProceed: vi.fn(),
    onBlockerReset: vi.fn(),
    switchTarget: null,
    canSave: true,
    saveConflict: false,
    onSaveAndSwitch: vi.fn(),
    isSaving: false,
    ...overrides,
  }
}

describe('EditorDialogs: switching away while Code changed the workflow', () => {
  it('offers Save and switch while a save is still possible', () => {
    render(<EditorDialogs {...props({ blockerStatus: 'blocked', switchTarget: 'ide' })} />)
    expect(screen.getByRole('button', { name: 'Save and switch' })).toBeInTheDocument()
    expect(screen.getByText(/The canvas has unsaved changes\./)).toBeInTheDocument()
  })

  it('drops Save and switch and says why once a save would be refused', async () => {
    const p = props({ blockerStatus: 'blocked', switchTarget: 'ide', saveConflict: true })
    render(<EditorDialogs {...p} />)
    expect(screen.queryByRole('button', { name: 'Save and switch' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Switch without saving' })).toBeNull()
    expect(screen.getByRole('alertdialog')).toHaveTextContent(CONFLICT_UNSAVED_SENTENCE)
    expect(screen.getByRole('alertdialog')).toHaveTextContent('They’ll be lost.')
    await userEvent.click(screen.getByRole('button', { name: 'Open Code' }))
    expect(p.onBlockerProceed).toHaveBeenCalledTimes(1)
    expect(p.onSaveAndSwitch).not.toHaveBeenCalled()
  })

  it('says the same when leaving the workflow altogether', () => {
    render(<EditorDialogs {...props({ blockerStatus: 'blocked', saveConflict: true })} />)
    expect(screen.getByRole('alertdialog')).toHaveTextContent(
      `${CONFLICT_UNSAVED_SENTENCE} They’ll be lost if you leave.`,
    )
    expect(screen.getByRole('button', { name: 'Leave' })).toBeInTheDocument()
  })
})

describe('EditorDialogs: reloading over unsaved canvas edits', () => {
  it('asks first, then reloads and closes', async () => {
    const p = props({ confirmAction: 'reload' })
    render(<EditorDialogs {...p} />)
    const dialog = screen.getByRole('alertdialog', { name: 'Discard your unsaved canvas changes?' })
    expect(dialog).toHaveTextContent(CONFLICT_UNSAVED_SENTENCE)
    await userEvent.click(screen.getByRole('button', { name: 'Discard and reload' }))
    expect(p.onConfirmReload).toHaveBeenCalledTimes(1)
    expect(p.setConfirmAction).toHaveBeenCalledWith(null)
  })

  it('cancelling keeps the canvas as it is', async () => {
    const p = props({ confirmAction: 'reload' })
    render(<EditorDialogs {...p} />)
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(p.onConfirmReload).not.toHaveBeenCalled()
    expect(p.setConfirmAction).toHaveBeenCalledWith(null)
  })
})
