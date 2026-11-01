import { beforeEach, describe, expect, it, onTestFinished, vi } from 'vitest'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {
  DANIEL,
  dashboardDb,
  renderWithDashboardData,
  resetDashboardData,
} from '../../../data/dashboard/__tests__/fixtures/dashboard-data'
import { rememberWorkspace } from '../../navigation/scope-memory'
import type * as WorkspaceHooks from '../../../data/dashboard/workspaces'
import { WorkspacesPage } from '../workspaces-page'

const goTo = vi.fn()
vi.mock('../../navigation/router-shell-link', () => ({ useGoTo: () => goTo }))

// Fails the workspace list on demand: it's frame data, which no `?mock=` scenario fails.
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
  resetDashboardData(new Date())
  localStorage.clear()
  goTo.mockReset()
  fail.workspaces = false
})

function renderPage(options: { dialogOpen?: boolean; userId?: string } = {}) {
  const onDialogChange = vi.fn()
  renderWithDashboardData(
    <WorkspacesPage
      slugs={p101}
      dialogOpen={options.dialogOpen ?? false}
      onDialogChange={onDialogChange}
    />,
    { userId: options.userId },
  )
  return { onDialogChange }
}

const poolCard = (title: string) =>
  screen.getByText(title, { selector: 'span' }).closest('a') as HTMLElement

describe('project Workspaces page', () => {
  it('reads as ProjectOverview: a card per workspace, the last one opened marked', async () => {
    // Support was made 90 minutes ago: pin the clock to midday so that's still "today".
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(2026, 9, 27, 12))
    resetDashboardData(new Date())
    onTestFinished(() => {
      vi.useRealTimers()
    })
    rememberWorkspace('acme', 'project-101', 'sales')
    renderPage()
    const sales = await screen.findByRole('link', { name: 'Sales' })
    expect(sales).toHaveAttribute('href', '/acme/project-101/sales/overview')
    expect(within(sales).getByText('You’re here')).toBeVisible()
    expect(within(sales).getByText('4 workflows')).toBeVisible()
    expect(within(screen.getByRole('link', { name: 'IT' })).getByText(/All passing/)).toBeVisible()
    const support = screen.getByRole('link', { name: 'Support' })
    expect(within(support).getByText('New')).toBeVisible()
    expect(within(support).getByText('Created today by Ama Mensah')).toBeVisible()
  })

  it('puts the workspace you were last in first', async () => {
    rememberWorkspace('acme', 'project-101', 'it')
    renderPage()
    await screen.findByRole('link', { name: 'IT' })
    const grid = screen.getByRole('link', { name: 'IT' }).parentElement!
    const names = [...grid.querySelectorAll(':scope > a')].map((card) => card.getAttribute('href'))
    expect(names[0]).toBe('/acme/project-101/it/overview')
  })

  it('counts the project-wide from its lists', async () => {
    renderPage()
    await screen.findByText('admins can open every workspace')
    const members = poolCard('Members & keys')
    expect(members).toHaveAttribute('href', '/acme/project-101/members')
    expect(members).toHaveTextContent('2admins can open every workspace')
    expect(members).toHaveTextContent('3 project keys')
    const variables = poolCard('Variables')
    expect(variables).toHaveTextContent('5')
    expect(variables).toHaveTextContent('2 project · 3 from Acme Inc')
    expect(within(variables).getByText('SLACK_TOKEN')).toBeVisible()
    expect(within(variables).getByText('+3')).toBeVisible()
    const shared = poolCard('Shared library')
    expect(shared).toHaveTextContent('3items any workspace can use')
    expect(within(shared).getByText('Lead enrichment · Sales')).toBeVisible()
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
    renderPage({ userId: DANIEL, dialogOpen: true })
    await screen.findByRole('link', { name: 'Sales' })
    expect(screen.queryByRole('button', { name: /New workspace/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})

describe('New workspace dialog', () => {
  it('shows what it inherits and creates the workspace with picked people as Editors', async () => {
    renderPage({ dialogOpen: true })
    const dialog = await screen.findByRole('dialog', { name: 'Create a workspace' })
    await waitFor(() => expect(dialog).toHaveTextContent('2 admins'))
    expect(dialog).toHaveTextContent('3 project keys')
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
    const db = dashboardDb()
    const billing = db.workspaces.find((w) => w.slug === 'billing')!
    expect(billing.colour).toBe('rose')
    expect(db.workspaceMembers.filter((m) => m.workspaceId === billing.id)).toEqual([
      { workspaceId: billing.id, userId: DANIEL, role: 'editor' },
    ])
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
