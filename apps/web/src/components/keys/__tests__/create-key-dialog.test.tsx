import { describe, expect, it, vi } from 'vitest'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {
  DANIEL,
  apiError,
  asProjectRole,
  asWorkspaceRole,
  installFakeApi,
  renderWithDashboardApi,
  type FakeApi,
} from '../../../__tests__/fake-api'
import { CreateKeyDialog } from '../create-key-dialog'

const ORG = { slug: 'acme', name: 'Acme Inc' }
const P101 = { slug: 'project-101', name: 'Project 101' }
/** Daniel: a member of Project 101, not one of its admins. */
function asMember(): FakeApi {
  const api = installFakeApi({ viewer: DANIEL })
  asProjectRole(api, 'acme/project-101', 'member')
  asWorkspaceRole(api, 'acme/project-101/sales', 'editor')
  return api
}

function renderDialog(
  options: { start?: 'organization' | 'project' | 'workspace'; api?: FakeApi } = {},
) {
  const onClose = vi.fn()
  const api = options.api ?? installFakeApi()
  renderWithDashboardApi(
    <CreateKeyDialog
      org={ORG}
      start={options.start ?? 'project'}
      project={P101}
      workspace="sales"
      onClose={onClose}
    />,
    { api },
  )
  return { api, onClose, dialog: screen.getByRole('dialog', { name: 'Create an API key' }) }
}

describe('Create an API key', () => {
  it('starts at the project with Deploy & run, creates the key and reveals it once', async () => {
    const user = userEvent.setup()
    vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue()
    const { api, dialog, onClose } = renderDialog()
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
    const sent = api.lastRequest('POST /api-keys')
    expect(sent.query).toMatchObject({ org: 'acme', project: 'project-101' })
    expect(sent.body).toMatchObject({ name: 'Release bot', level: 'project' })
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
    const { api, dialog } = renderDialog({ start: 'workspace' })
    // A workspace key reaches just that workspace, so there is no "where" choice.
    expect(within(dialog).queryByRole('radio')).not.toBeInTheDocument()
    await userEvent.type(within(dialog).getByRole('textbox', { name: /Name/ }), 'Sales hook')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Create key' }))
    await within(dialog).findByRole('textbox', { name: 'Your API key' })
    const sent = api.lastRequest('POST /api-keys')
    expect(sent.query).toMatchObject({ org: 'acme', project: 'project-101', workspace: 'sales' })
    expect(sent.body).toMatchObject({ name: 'Sales hook', level: 'workspace' })
  })

  it('disables the project choices the viewer can’t create keys at, saying why', async () => {
    const { dialog } = renderDialog({ start: 'project', api: asMember() })
    // The reason arrives once the viewer's project scope loads; both choices carry it.
    expect(
      (await within(dialog).findAllByText('Only project admins and org owners can do this')).length,
    ).toBeGreaterThan(0)
    expect(within(dialog).getByRole('radio', { name: /Project 101/ })).toBeDisabled()
    expect(within(dialog).getByRole('radio', { name: /Specific workspaces/ })).toBeDisabled()
  })

  it('lets a workspace admin create a key for their workspace', async () => {
    const api = asMember()
    asWorkspaceRole(api, 'acme/project-101/sales', 'admin')
    const onClose = vi.fn()
    renderWithDashboardApi(
      <CreateKeyDialog
        org={ORG}
        start="workspace"
        project={P101}
        workspace="sales"
        onClose={onClose}
      />,
      { api },
    )
    const dialog = screen.getByRole('dialog', { name: 'Create an API key' })
    await userEvent.type(within(dialog).getByRole('textbox', { name: /Name/ }), 'Sales hook')
    await waitFor(() =>
      expect(within(dialog).getByRole('button', { name: 'Create key' })).toBeEnabled(),
    )
    await userEvent.click(within(dialog).getByRole('button', { name: 'Create key' }))
    await within(dialog).findByRole('textbox', { name: 'Your API key' })
    expect(api.lastRequest('POST /api-keys').body).toMatchObject({ level: 'workspace' })
    expect(api.lastRequest('POST /api-keys').query).toMatchObject({ workspace: 'sales' })
  })

  it('puts a missing name’s error on the name field', async () => {
    const api = installFakeApi()
    api.on('POST /api-keys', apiError(400, 'Give the key a name', { field: 'name' }))
    const { dialog } = renderDialog({ api })
    await userEvent.click(within(dialog).getByRole('button', { name: 'Create key' }))
    expect(await within(dialog).findByText('Give the key a name')).toBeVisible()
  })
})
