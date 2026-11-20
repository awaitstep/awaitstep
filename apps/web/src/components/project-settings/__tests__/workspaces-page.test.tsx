import { beforeEach, describe, expect, it, vi } from 'vitest'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {
  DANIEL,
  asOrgRole,
  asProjectRole,
  installFakeApi,
  renderWithDashboardApi,
  type FakeApi,
} from '../../../__tests__/fake-api'
import { rememberWorkspace } from '../../navigation/scope-memory'
import type * as WorkspaceHooks from '../../../data/dashboard/workspaces'
import { WorkspacesPage } from '../workspaces-page'

const goTo = vi.fn()
vi.mock('../../navigation/router-shell-link', () => ({ useGoTo: () => goTo }))

// Fails the workspace list on demand: it's frame data the scope also feeds, so the hook is stood in for.
const fail = { workspaces: false }
vi.mock('../../../data/dashboard/workspaces', async (importOriginal) => {
  const real = await importOriginal<typeof WorkspaceHooks>()
  return {
    ...real,
    useWorkspaces: (org: string, project: string) => {
      const query = real.useWorkspaces(org, project)
      return fail.workspaces
        ? { ...query, data: undefined, isError: true, error: new Error('down') }
        : query
    },
  }
})

const p101 = { org: 'acme', project: 'project-101' }

beforeEach(() => {
  localStorage.clear()
  goTo.mockReset()
  fail.workspaces = false
})

function renderPage(options: { dialogOpen?: boolean; api?: FakeApi } = {}) {
  const onDialogChange = vi.fn()
  const api = options.api ?? installFakeApi()
  renderWithDashboardApi(
    <WorkspacesPage
      slugs={p101}
      dialogOpen={options.dialogOpen ?? false}
      onDialogChange={onDialogChange}
    />,
    { api },
  )
  return { onDialogChange, api }
}

describe('project Workspaces page', () => {
  it('puts the workspace you were last in first', async () => {
    rememberWorkspace('acme', 'project-101', 'it')
    renderPage()
    await screen.findByRole('link', { name: 'IT' })
    const grid = screen.getByRole('link', { name: 'IT' }).parentElement!
    const names = [...grid.querySelectorAll(':scope > a')].map((card) => card.getAttribute('href'))
    expect(names[0]).toBe('/acme/project-101/it/overview')
  })

  it('opens the dialog from the top bar and the dashed card', async () => {
    const { onDialogChange } = renderPage()
    const topBar = screen.getByRole('banner', { name: 'Top bar' })
    await userEvent.click(await within(topBar).findByRole('button', { name: 'New workspace' }))
    expect(onDialogChange).toHaveBeenCalledTimes(1)
    const main = screen
      .getAllByRole('button', { name: /New workspace/ })
      .find((button) => !topBar.contains(button))!
    await userEvent.click(main)
    expect(onDialogChange).toHaveBeenCalledTimes(2)
    expect(onDialogChange).toHaveBeenLastCalledWith(true)
  })

  it('says so, with Try again, when the workspaces can’t load', async () => {
    fail.workspaces = true
    renderPage()
    expect(await screen.findByText('We couldn’t load the workspaces')).toBeVisible()
    expect(screen.getByRole('button', { name: /Try again/ })).toBeVisible()
  })

  it('offers no New workspace to someone who isn’t a project admin', async () => {
    const api = installFakeApi({ viewer: DANIEL })
    asOrgRole(api, 'acme', 'member')
    asProjectRole(api, 'acme/project-101', 'member')
    renderPage({ api, dialogOpen: true })
    await screen.findByRole('link', { name: 'Sales' })
    expect(screen.queryByRole('button', { name: /New workspace/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})

describe('New workspace dialog', () => {
  it('shows what it inherits and creates the workspace with picked people as Editors', async () => {
    const api = installFakeApi()
    api.on('POST /workspaces', (req) => {
      const body = req.body as { name: string; colour: 'rose' }
      return {
        id: 'ws_billing',
        projectId: 'prj_101',
        slug: body.name.toLowerCase(),
        name: body.name,
        description: null,
        colour: body.colour,
        createdBy: 'usr_ama',
        createdAt: api.now.toISOString(),
        updatedAt: api.now.toISOString(),
      }
    })
    renderPage({ dialogOpen: true, api })
    const dialog = await screen.findByRole('dialog', { name: 'Create a workspace' })
    await waitFor(() => expect(dialog).toHaveTextContent('2 admins'))
    expect(dialog).toHaveTextContent('4 project keys')
    expect(dialog).toHaveTextContent('5 variables')

    await userEvent.type(within(dialog).getByRole('textbox', { name: /Name/ }), 'Billing')
    await userEvent.click(within(dialog).getByRole('radio', { name: 'Rose' }))
    await userEvent.click(within(dialog).getByRole('radio', { name: /Choose people now/ }))
    expect(dialog).toHaveTextContent('They’ll see Billing and nothing else in Project 101')

    await userEvent.click(within(dialog).getByRole('button', { name: '+ Add person' }))
    const picker = await screen.findByRole('listbox')
    // Ama (owner) and Tom (project admin) already open every workspace.
    expect(within(picker).queryByRole('option', { name: /Ama Mensah/ })).not.toBeInTheDocument()
    expect(within(picker).queryByRole('option', { name: /Tom Becker/ })).not.toBeInTheDocument()
    await userEvent.click(within(picker).getByRole('option', { name: /Daniel Kim/ }))
    const people = within(dialog).getByRole('group', { name: 'People who can get in' })
    expect(within(people).getByText('Daniel Kim')).toBeVisible()

    await userEvent.click(within(dialog).getByRole('button', { name: 'Create workspace' }))
    await waitFor(() => expect(goTo).toHaveBeenCalledWith('/acme/project-101/billing/overview'))
    expect(api.lastRequest('POST /workspaces').body).toMatchObject({
      name: 'Billing',
      colour: 'rose',
      members: [{ userId: DANIEL, role: 'editor' }],
    })
  })

  it('removes a picked person', async () => {
    renderPage({ dialogOpen: true })
    const dialog = await screen.findByRole('dialog', { name: 'Create a workspace' })
    await userEvent.click(within(dialog).getByRole('radio', { name: /Choose people now/ }))
    await userEvent.click(within(dialog).getByRole('button', { name: '+ Add person' }))
    await userEvent.click(await screen.findByRole('option', { name: /Lena Ortiz/ }))
    await userEvent.click(within(dialog).getByRole('button', { name: 'Remove Lena Ortiz' }))
    expect(within(dialog).queryByText('Lena Ortiz')).not.toBeInTheDocument()
  })

  it('shows the error on the field for a name with no letters', async () => {
    renderPage({ dialogOpen: true })
    const dialog = await screen.findByRole('dialog', { name: 'Create a workspace' })
    await userEvent.type(within(dialog).getByRole('textbox', { name: /Name/ }), '!!!')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Create workspace' }))
    expect(
      await within(dialog).findByText('The workspace name needs at least one letter or number'),
    ).toBeVisible()
    expect(goTo).not.toHaveBeenCalled()
  })

  it('closes through onDialogChange', async () => {
    const { onDialogChange } = renderPage({ dialogOpen: true })
    const dialog = await screen.findByRole('dialog', { name: 'Create a workspace' })
    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }))
    expect(onDialogChange).toHaveBeenLastCalledWith(false)
  })
})
