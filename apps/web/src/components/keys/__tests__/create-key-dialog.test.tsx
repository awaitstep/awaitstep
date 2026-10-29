import { beforeEach, describe, expect, it, vi } from 'vitest'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {
  DANIEL,
  dashboardDb,
  renderWithDashboardData,
  resetDashboardData,
} from '../../../data/dashboard/__tests__/fixtures/dashboard-data'
import { CreateKeyDialog } from '../create-key-dialog'

const ORG = { slug: 'acme', name: 'Acme Inc' }
const P101 = { slug: 'project-101', name: 'Project 101' }
beforeEach(() => resetDashboardData(new Date()))

function renderDialog(
  options: { start?: 'organization' | 'project' | 'workspace'; userId?: string } = {},
) {
  const onClose = vi.fn()
  renderWithDashboardData(
    <CreateKeyDialog
      org={ORG}
      start={options.start ?? 'project'}
      project={P101}
      workspace="sales"
      onClose={onClose}
    />,
    { userId: options.userId },
  )
  return { onClose, dialog: screen.getByRole('dialog', { name: 'Create an API key' }) }
}

describe('Create an API key', () => {
  it('starts at the project with Deploy & run, creates the key and reveals it once', async () => {
    const user = userEvent.setup()
    vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue()
    const { dialog, onClose } = renderDialog()
    expect(within(dialog).getByRole('radio', { name: /Project 101/ })).toBeChecked()
    expect(within(dialog).getByRole('button', { name: 'Deploy & run' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    await user.type(within(dialog).getByRole('textbox', { name: /Name/ }), 'Release bot')
    await user.click(within(dialog).getByRole('button', { name: 'Create key' }))
    const secret = await within(dialog).findByRole('textbox', { name: 'Your API key' })
    expect((secret as HTMLInputElement).value).toMatch(/^ask_[A-Za-z0-9_-]{40}$/)
    expect(dialog).toHaveTextContent('Release bot is ready.')
    await user.click(within(dialog).getByRole('button', { name: 'Copy' }))
    expect(await within(dialog).findByText('Key copied. You can close this.')).toBeVisible()
    await user.click(within(dialog).getByRole('button', { name: 'Done' }))
    expect(onClose).toHaveBeenCalled()
    expect(dashboardDb().keys[0]).toMatchObject({ name: 'Release bot', level: 'project' })
  })

  it('asks before closing when the key wasn’t copied', async () => {
    const { dialog, onClose } = renderDialog()
    await userEvent.type(within(dialog).getByRole('textbox', { name: /Name/ }), 'x')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Create key' }))
    await within(dialog).findByRole('textbox', { name: 'Your API key' })
    await userEvent.click(within(dialog).getByRole('button', { name: 'Done' }))
    expect(onClose).not.toHaveBeenCalled()
    await userEvent.click(screen.getByRole('button', { name: 'Close anyway' }))
    expect(onClose).toHaveBeenCalled()
  })

  it('starts at the org with Read only and no Deploy & run', async () => {
    const { dialog } = renderDialog({ start: 'organization' })
    expect(within(dialog).getByRole('radio', { name: /Organization/ })).toBeChecked()
    expect(within(dialog).queryByRole('button', { name: 'Deploy & run' })).not.toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: 'Read only' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
  })

  it('makes a workspace key for the picked workspace', async () => {
    const { dialog } = renderDialog({ start: 'workspace' })
    expect(within(dialog).getByRole('radio', { name: /One workspace/ })).toBeChecked()
    await userEvent.type(within(dialog).getByRole('textbox', { name: /Name/ }), 'Sales hook')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Create key' }))
    await within(dialog).findByRole('textbox', { name: 'Your API key' })
    expect(dashboardDb().keys[0]).toMatchObject({
      name: 'Sales hook',
      level: 'workspace',
      workspaceId: 'ws_sales',
    })
  })

  it('disables the levels the viewer can’t create keys at, saying why', async () => {
    const { dialog } = renderDialog({ start: 'workspace', userId: DANIEL })
    expect(await within(dialog).findByText('Only org owners and admins can do this')).toBeVisible()
    expect(within(dialog).getByRole('radio', { name: /Organization/ })).toBeDisabled()
    expect(within(dialog).getByRole('radio', { name: /Project 101/ })).toBeDisabled()
    expect(dialog).toHaveTextContent('Only project admins and org owners can do this')
  })

  it('keeps One workspace usable for a workspace admin, with the first workspace picked', async () => {
    dashboardDb().workspaceMembers.find(
      (m) => m.workspaceId === 'ws_sales' && m.userId === DANIEL,
    )!.role = 'admin'
    const onClose = vi.fn()
    renderWithDashboardData(
      <CreateKeyDialog org={ORG} start="project" project={P101} onClose={onClose} />,
      { userId: DANIEL },
    )
    const dialog = screen.getByRole('dialog', { name: 'Create an API key' })
    const one = within(dialog).getByRole('radio', { name: /One workspace/ })
    await waitFor(() => expect(one).toBeEnabled())
    await userEvent.click(one)
    await userEvent.type(within(dialog).getByRole('textbox', { name: /Name/ }), 'Sales hook')
    await waitFor(() =>
      expect(within(dialog).getByRole('button', { name: 'Create key' })).toBeEnabled(),
    )
    await userEvent.click(within(dialog).getByRole('button', { name: 'Create key' }))
    await within(dialog).findByRole('textbox', { name: 'Your API key' })
    expect(dashboardDb().keys[0]).toMatchObject({ level: 'workspace', workspaceId: 'ws_sales' })
  })

  it('puts a missing name’s error on the name field', async () => {
    const { dialog } = renderDialog()
    await userEvent.click(within(dialog).getByRole('button', { name: 'Create key' }))
    expect(await within(dialog).findByText('Give the key a name')).toBeVisible()
  })
})
