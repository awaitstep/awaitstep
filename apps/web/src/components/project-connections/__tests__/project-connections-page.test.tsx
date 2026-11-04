import { beforeEach, describe, expect, it, vi } from 'vitest'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {
  DANIEL,
  TOM,
  dashboardDb,
  renderWithDashboardData,
  resetDashboardData,
} from '../../../data/dashboard/__tests__/fixtures/dashboard-data'
import { useCreateWorkspace } from '../../../data/dashboard/workspaces'
import { ProjectConnectionsPage } from '../project-connections-page'
import type { AddTab } from '../add-connection-dialog'

// A project's Connections page (`ProjectConnections`, `AttachConnection`,
// `ProjectConnectionsEmpty`) on dummy data: Project 101 deploys to Acme
// production (shared, its default) and Checkout staging (its own), and Sales
// is set to Checkout staging.

const p101 = { org: 'acme', project: 'project-101' }
const topBar = () => screen.getByRole('banner', { name: 'Top bar' })

beforeEach(() => {
  resetDashboardData(new Date())
  localStorage.clear()
})

function renderPage(
  adding: AddTab | null = null,
  options: { userId?: string } = {},
  onAddChange = vi.fn(),
) {
  return renderWithDashboardData(
    <ProjectConnectionsPage slugs={p101} adding={adding} onAddChange={onAddChange} />,
    options,
  )
}

describe('the project’s accounts', () => {
  it('reads as ProjectConnections: accounts with scope, default and usage, and each workspace', async () => {
    renderPage()
    const prod = await screen.findByRole('listitem', { name: 'Acme production' })
    expect(prod).toHaveTextContent('Default')
    expect(prod).toHaveTextContent('Shared by Acme Inc')
    expect(prod).toHaveTextContent('Cloudflare account ••••7f2a · added by Ama Mensah')
    expect(prod).toHaveTextContent('Token valid')
    expect(prod).toHaveTextContent('18 deployments')
    expect(within(prod).queryByRole('button', { name: 'Make default' })).toBeNull()

    const own = screen.getByRole('listitem', { name: 'Checkout staging' })
    expect(own).toHaveTextContent('This project only')
    expect(own).toHaveTextContent('Deployed from Sales')
    expect(within(own).getByRole('button', { name: 'Make default' })).toBeEnabled()
    expect(screen.getByText('One available, one it owns')).toBeInTheDocument()

    const table = screen.getByRole('table', { name: 'Where each workspace deploys' })
    const salesRow = within(table).getByText('Sales').closest('[role="row"]') as HTMLElement
    expect(salesRow).toHaveTextContent('Checkout staging')
    expect(salesRow).toHaveTextContent('Set for this workspace')
    const itRow = within(table).getByText('IT').closest('[role="row"]') as HTMLElement
    expect(itRow).toHaveTextContent('Acme production')
    expect(itRow).toHaveTextContent('Project default')
    expect(within(topBar()).getByRole('button', { name: 'Add connection' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Acme Inc connections →' })).toHaveAttribute(
      'href',
      '/acme/connections',
    )
  })

  it('makes another account the default, and points a workspace back at it', async () => {
    renderPage()
    const own = await screen.findByRole('listitem', { name: 'Checkout staging' })
    await userEvent.click(within(own).getByRole('button', { name: 'Make default' }))
    await waitFor(() =>
      expect(screen.getByRole('listitem', { name: 'Checkout staging' })).toHaveTextContent(
        'Default',
      ),
    )
    expect(
      dashboardDb().projectConnections.find((pc) => pc.connectionId === 'conn_checkout')?.isDefault,
    ).toBe(true)

    await userEvent.click(screen.getByRole('button', { name: 'Change where Sales deploys' }))
    const dialog = screen.getByRole('dialog', { name: 'Where Sales deploys' })
    await userEvent.click(within(dialog).getByRole('combobox'))
    await userEvent.click(await screen.findByRole('option', { name: /Project default/ }))
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(dashboardDb().workspaceConnections).toEqual([]))
  })

  it('says what removing changes before it deletes an owned account', async () => {
    renderPage()
    const own = await screen.findByRole('listitem', { name: 'Checkout staging' })
    await userEvent.click(
      within(own).getByRole('button', { name: 'More actions for Checkout staging' }),
    )
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Delete account…' }))
    const confirm = screen.getByRole('alertdialog', { name: 'Delete Checkout staging?' })
    expect(confirm).toHaveTextContent('belongs to Project 101, so removing it deletes it')
    expect(confirm).toHaveTextContent('Sales goes back to the project default')
    await userEvent.click(within(confirm).getByRole('button', { name: 'Delete account' }))
    await waitFor(() =>
      expect(dashboardDb().connections.some((c) => c.id === 'conn_checkout')).toBe(false),
    )
  })

  it('is read-only for someone who isn’t a project admin', async () => {
    renderPage(null, { userId: DANIEL })
    const prod = await screen.findByRole('listitem', { name: 'Acme production' })
    expect(within(prod).queryByRole('button', { name: /More actions/ })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Make default' })).toBeNull()
    expect(screen.queryByRole('button', { name: /Change where/ })).toBeNull()
    expect(within(topBar()).queryByRole('button', { name: 'Add connection' })).toBeNull()
  })
})

describe('a project with no account (ProjectConnectionsEmpty)', () => {
  beforeEach(() => {
    dashboardDb().projectConnections = dashboardDb().projectConnections.filter(
      (pc) => pc.projectId !== 'prj_101',
    )
    dashboardDb().connections.find((c) => c.id === 'conn_marketing')!.projects = 'all'
  })

  it('says Deploy stays disabled and offers both ways in', async () => {
    const onAddChange = vi.fn()
    renderPage(null, {}, onAddChange)
    expect(await screen.findByText('No account connected yet')).toBeInTheDocument()
    expect(screen.getByText('Deploy stays disabled')).toBeInTheDocument()
    await waitFor(() =>
      expect(screen.getByText(/Acme Inc already has two you can use/)).toBeInTheDocument(),
    )
    expect(screen.getByRole('button', { name: 'Use an account in Acme Inc' })).toBeInTheDocument()
    expect(screen.queryByRole('table', { name: 'Where each workspace deploys' })).toBeNull()
    await userEvent.click(screen.getByRole('button', { name: 'Connect a new account' }))
    expect(onAddChange).toHaveBeenCalledWith(true, 'new')
  })
})

describe('Add connection (AttachConnection)', () => {
  it('adds an available account; added and restricted ones can’t be picked', async () => {
    dashboardDb().connections.push({
      id: 'conn_data',
      orgId: dashboardDb().connections[0]!.orgId,
      name: 'Data platform prod',
      accountId: 'd'.repeat(32),
      addedBy: DANIEL,
      tokenExpiresAt: null,
      projects: ['prj_marketing'],
      deployments: 0,
      lastDeployAt: null,
    })
    dashboardDb().connections.find((c) => c.id === 'conn_marketing')!.projects = 'all'
    const onAddChange = vi.fn()
    renderPage('org', {}, onAddChange)
    const dialog = await screen.findByRole('dialog', { name: 'Add a connection to Project 101' })
    const added = await within(dialog).findByRole('checkbox', { name: /Acme production/ })
    expect(added).toBeChecked()
    expect(added).toBeDisabled()
    const restricted = within(dialog).getByRole('checkbox', { name: /Data platform prod/ })
    expect(restricted).toBeDisabled()
    expect(within(dialog).getByText('Ask an org admin')).toBeInTheDocument()
    expect(within(dialog).getByText('Restricted to Marketing Site')).toBeInTheDocument()

    await userEvent.click(within(dialog).getByRole('checkbox', { name: /Marketing sandbox/ }))
    await userEvent.click(within(dialog).getByRole('button', { name: 'Add 1 account' }))
    await waitFor(() =>
      expect(
        dashboardDb().projectConnections.some(
          (pc) => pc.projectId === 'prj_101' && pc.connectionId === 'conn_marketing',
        ),
      ).toBe(true),
    )
  })

  it('connects an account for this project only, with no way to share it with the org', async () => {
    renderPage('new', { userId: TOM })
    const dialog = await screen.findByRole('dialog', { name: 'Add a connection to Project 101' })
    expect(
      within(dialog).getByText(/Only Project 101 can see it or deploy with it/),
    ).toBeInTheDocument()
    expect(within(dialog).queryByRole('radio', { name: /Project 101 only/ })).toBeNull()
    expect(within(dialog).queryByText(/Everyone in Acme Inc/)).toBeNull()
    expect(
      within(dialog).getByRole('checkbox', { name: /Make it Project 101’s default/ }),
    ).toBeChecked()
  })

  it('connects a new account as the project’s own, and shows the field’s refusal', async () => {
    renderPage('new')
    const dialog = await screen.findByRole('dialog', { name: 'Add a connection to Project 101' })
    // Not for an org owner either: the org's page connects accounts for everyone.
    expect(within(dialog).queryByText(/Everyone in Acme Inc/)).toBeNull()
    await userEvent.type(within(dialog).getByLabelText('Name'), 'Edge staging')
    await userEvent.type(within(dialog).getByLabelText('Account ID'), 'nope')
    await userEvent.type(within(dialog).getByLabelText('API token'), 'cf-token')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Check token and connect' }))
    expect(await within(dialog).findByText(/An account ID is 32 letters/)).toBeInTheDocument()

    await userEvent.clear(within(dialog).getByLabelText('Account ID'))
    await userEvent.type(within(dialog).getByLabelText('Account ID'), 'e'.repeat(32))
    await userEvent.click(within(dialog).getByRole('button', { name: 'Check token and connect' }))
    await waitFor(() =>
      expect(dashboardDb().connections.find((c) => c.name === 'Edge staging')?.projectId).toBe(
        'prj_101',
      ),
    )
  })
})

describe('review round (2026-11-01)', () => {
  function CreateBilling() {
    const create = useCreateWorkspace('acme', 'project-101')
    function handleCreate() {
      create.mutate({ name: 'Billing', colour: 'blue', access: { kind: 'admins' } })
    }
    return (
      <button type="button" onClick={handleCreate}>
        Create Billing
      </button>
    )
  }

  it('lists a workspace created meanwhile under Where each workspace deploys', async () => {
    renderWithDashboardData(
      <>
        <CreateBilling />
        <ProjectConnectionsPage slugs={p101} adding={null} onAddChange={vi.fn()} />
      </>,
    )
    const table = await screen.findByRole('table', { name: 'Where each workspace deploys' })
    expect(within(table).queryByText('Billing')).toBeNull()
    await userEvent.click(screen.getByRole('button', { name: 'Create Billing' }))
    await waitFor(() => expect(within(table).getByText('Billing')).toBeInTheDocument())
  })
})
