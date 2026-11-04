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
    expect(dashboardDb().keys[0]!.projectScopes).toEqual([{ id: 'prj_101', revokedAt: null }])
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

  it('starts at the org with Read only, no Deploy & run, and offers specific projects', async () => {
    const { dialog } = renderDialog({ start: 'organization' })
    expect(within(dialog).getByRole('radio', { name: /Organization/ })).toBeChecked()
    expect(within(dialog).getByRole('radio', { name: /Specific projects/ })).toBeInTheDocument()
    expect(within(dialog).queryByRole('button', { name: 'Deploy & run' })).not.toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: 'Read only' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
  })

  it('makes a workspace key for the workspace it opened from', async () => {
    const { dialog } = renderDialog({ start: 'workspace' })
    // A workspace key reaches just that workspace, so there is no "where" choice.
    expect(within(dialog).queryByRole('radio')).not.toBeInTheDocument()
    await userEvent.type(within(dialog).getByRole('textbox', { name: /Name/ }), 'Sales hook')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Create key' }))
    await within(dialog).findByRole('textbox', { name: 'Your API key' })
    expect(dashboardDb().keys[0]).toMatchObject({ name: 'Sales hook', level: 'workspace' })
    expect(dashboardDb().keys[0]!.workspaceScopes).toEqual([{ id: 'ws_sales', revokedAt: null }])
  })

  it('disables the project choices the viewer can’t create keys at, saying why', async () => {
    const { dialog } = renderDialog({ start: 'project', userId: DANIEL })
    // The reason arrives once the viewer's project scope loads; both choices carry it.
    expect(
      (await within(dialog).findAllByText('Only project admins and org owners can do this')).length,
    ).toBeGreaterThan(0)
    expect(within(dialog).getByRole('radio', { name: /Project 101/ })).toBeDisabled()
    expect(within(dialog).getByRole('radio', { name: /Specific workspaces/ })).toBeDisabled()
  })

  it('lets a workspace admin create a key for their workspace', async () => {
    dashboardDb().workspaceMembers.find(
      (m) => m.workspaceId === 'ws_sales' && m.userId === DANIEL,
    )!.role = 'admin'
    const onClose = vi.fn()
    renderWithDashboardData(
      <CreateKeyDialog
        org={ORG}
        start="workspace"
        project={P101}
        workspace="sales"
        onClose={onClose}
      />,
      { userId: DANIEL },
    )
    const dialog = screen.getByRole('dialog', { name: 'Create an API key' })
    await userEvent.type(within(dialog).getByRole('textbox', { name: /Name/ }), 'Sales hook')
    await waitFor(() =>
      expect(within(dialog).getByRole('button', { name: 'Create key' })).toBeEnabled(),
    )
    await userEvent.click(within(dialog).getByRole('button', { name: 'Create key' }))
    await within(dialog).findByRole('textbox', { name: 'Your API key' })
    expect(dashboardDb().keys[0]).toMatchObject({ level: 'workspace' })
    expect(dashboardDb().keys[0]!.workspaceScopes).toEqual([{ id: 'ws_sales', revokedAt: null }])
  })

  it('puts a missing name’s error on the name field', async () => {
    const { dialog } = renderDialog()
    await userEvent.click(within(dialog).getByRole('button', { name: 'Create key' }))
    expect(await within(dialog).findByText('Give the key a name')).toBeVisible()
  })
})
