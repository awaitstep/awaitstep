import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { KeyRound, Trash2 } from 'lucide-react'
import { ConfirmDialog } from '../confirm-dialog'

function renderDeleteProject() {
  const onConfirm = vi.fn()
  render(
    <ConfirmDialog
      open
      onOpenChange={vi.fn()}
      icon={Trash2}
      title="Delete Project 101?"
      description="This removes Sales, IT and Support, 8 workflows and all their history."
      confirmLabel="Delete project"
      confirmText="Project 101"
      onConfirm={onConfirm}
    />,
  )
  return {
    onConfirm,
    field: screen.getByRole('textbox', { name: 'Type Project 101 to confirm' }),
    confirm: screen.getByRole('button', { name: 'Delete project' }),
  }
}

describe('ConfirmDialog with type-to-confirm', () => {
  it('focuses the confirmation field first', () => {
    const { field } = renderDeleteProject()
    expect(field).toHaveFocus()
  })

  it('keeps Confirm disabled until the name matches exactly', async () => {
    const { field, confirm } = renderDeleteProject()
    expect(confirm).toBeDisabled()
    for (const attempt of ['project 101', 'Project 10', 'Project 1011']) {
      await userEvent.clear(field)
      await userEvent.type(field, attempt)
      expect(confirm).toBeDisabled()
    }
    await userEvent.clear(field)
    await userEvent.type(field, 'Project 101')
    expect(confirm).toBeEnabled()
  })

  it('ignores spaces around the typed name', async () => {
    const { field, confirm } = renderDeleteProject()
    await userEvent.type(field, '  Project 101 ')
    expect(confirm).toBeEnabled()
  })

  it('confirms on Enter only once the name matches', async () => {
    const { field, onConfirm } = renderDeleteProject()
    await userEvent.type(field, 'Project 10{Enter}')
    expect(onConfirm).not.toHaveBeenCalled()
    await userEvent.type(field, '1{Enter}')
    expect(onConfirm).toHaveBeenCalledOnce()
  })

  it('stays an alert dialog named by its title', () => {
    renderDeleteProject()
    expect(
      screen.getByRole('alertdialog', { name: 'Delete Project 101?' }),
    ).toHaveAccessibleDescription(
      'This removes Sales, IT and Support, 8 workflows and all their history.',
    )
  })
})

describe('ConfirmDialog with an icon only', () => {
  it('asks for no typing and confirms straight away', async () => {
    const onConfirm = vi.fn()
    render(
      <ConfirmDialog
        open
        onOpenChange={vi.fn()}
        icon={KeyRound}
        title="Revoke CRM webhook?"
        description="Scripts using this key stop working at once."
        confirmLabel="Revoke key"
        onConfirm={onConfirm}
      />,
    )
    expect(screen.queryByRole('textbox')).toBeNull()
    await userEvent.click(screen.getByRole('button', { name: 'Revoke key' }))
    expect(onConfirm).toHaveBeenCalledOnce()
  })
})
