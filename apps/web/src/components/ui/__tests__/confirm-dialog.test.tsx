import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ConfirmDialog } from '../confirm-dialog'

function renderDialog(props: Partial<React.ComponentProps<typeof ConfirmDialog>> = {}) {
  const onConfirm = vi.fn()
  const onOpenChange = vi.fn()
  render(
    <ConfirmDialog
      open
      onOpenChange={onOpenChange}
      title="Delete workflow"
      description="This cannot be undone."
      confirmLabel="Delete"
      onConfirm={onConfirm}
      {...props}
    />,
  )
  return { onConfirm, onOpenChange }
}

describe('ConfirmDialog', () => {
  it('is announced as an alert dialog named by its title and description', () => {
    renderDialog()
    const dialog = screen.getByRole('alertdialog', { name: 'Delete workflow' })
    expect(dialog).toHaveAccessibleDescription('This cannot be undone.')
  })

  it('calls onConfirm without closing itself, so a failed action can keep it open', async () => {
    const { onConfirm, onOpenChange } = renderDialog()
    await userEvent.click(screen.getByRole('button', { name: 'Delete' }))
    expect(onConfirm).toHaveBeenCalledOnce()
    expect(onOpenChange).not.toHaveBeenCalled()
  })

  it('asks to close on Cancel and on Escape', async () => {
    const { onOpenChange } = renderDialog()
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    await userEvent.keyboard('{Escape}')
    expect(onOpenChange.mock.calls).toEqual([[false], [false]])
  })

  it('shows the secondary action only when both its label and handler are given', async () => {
    const onSecondary = vi.fn()
    renderDialog({ secondaryLabel: 'Switch without saving', onSecondary })
    await userEvent.click(screen.getByRole('button', { name: 'Switch without saving' }))
    expect(onSecondary).toHaveBeenCalledOnce()
  })

  it('hides the secondary action when its handler is missing', () => {
    renderDialog({ secondaryLabel: 'Switch without saving' })
    expect(screen.queryByRole('button', { name: 'Switch without saving' })).toBeNull()
  })

  it('disables the actions while loading', () => {
    renderDialog({ loading: true, secondaryLabel: 'Other', onSecondary: vi.fn() })
    expect(screen.getByRole('button', { name: 'Delete' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Other' })).toBeDisabled()
  })
})
