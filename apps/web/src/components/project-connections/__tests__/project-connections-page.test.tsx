import { beforeEach, describe, expect, it, vi } from 'vitest'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {
  DANIEL,
  TOM,
  apiError,
  asOrgRole,
  asProjectRole,
  installFakeApi,
  renderWithDashboardApi,
  type FakeApi,
} from '../../../__tests__/fake-api'
import { useCreateWorkspace } from '../../../data/dashboard/workspaces'
import { ProjectConnectionsPage } from '../project-connections-page'
import type { AddTab } from '../add-connection-dialog'

// A project's Connections page (`ProjectConnections`, `AttachConnection`,
// `ProjectConnectionsEmpty`): Project 101 deploys to Acme
// production (shared, its default) and Checkout staging (its own), and Sales
// is set to Checkout staging.

const p101 = { org: 'acme', project: 'project-101' }
const topBar = () => screen.getByRole('banner', { name: 'Top bar' })

beforeEach(() => {
  localStorage.clear()
})

function renderPage(
  adding: AddTab | null = null,
  api: FakeApi = installFakeApi(),
  onAddChange = vi.fn(),
) {
  renderWithDashboardApi(
    <ProjectConnectionsPage slugs={p101} adding={adding} onAddChange={onAddChange} />,
    { api },
  )
  return api
}

/** The account changes the page sends, applied to the seed as the API would. */
function scriptChanges(api: FakeApi) {
  const seed = api.data.seed
  api.on('PUT /projects/:id/default-connection', (req) => {
    const id = (req.body as { connectionId: string }).connectionId
    for (const pc of seed.projectConnections) {
      if (pc.projectId === 'prj_101') pc.isDefault = pc.connectionId === id
    }
    return {}
  })
  api.on('PUT /projects/:id/workspaces/:workspaceId/connection', (req) => {
    seed.workspaceConnections = seed.workspaceConnections.filter(
      (wc) => wc.workspaceId !== req.params.workspaceId,
    )
    return {}
  })
  api.on('PATCH /projects/:id/connections/:connectionId', (req) => {
    seed.connections.find((c) => c.id === req.params.connectionId)!.name = (
      req.body as { name: string }
    ).name
    return {}
  })
}

/** Project 101 with no account of its own, and two the org could lend it. */
function withNoAccount(api: FakeApi) {
  api.data.seed.projectConnections = api.data.seed.projectConnections.filter(
    (pc) => pc.projectId !== 'prj_101',
  )
  api.data.seed.connections.find((c) => c.id === 'conn_marketing')!.projects = 'all'
}

describe('the project’s accounts', () => {
  it('makes another account the default, and points a workspace back at it', async () => {
    const api = installFakeApi()
    scriptChanges(api)
    renderPage(null, api)
    const own = await screen.findByRole('listitem', { name: 'Checkout staging' })
    await userEvent.click(within(own).getByRole('button', { name: 'Make default' }))
    await waitFor(() =>
      expect(screen.getByRole('listitem', { name: 'Checkout staging' })).toHaveTextContent(
        'Default',
      ),
    )
    expect(api.lastRequest('PUT /projects/:id/default-connection').body).toEqual({
      connectionId: 'conn_checkout',
    })

    await userEvent.click(screen.getByRole('button', { name: 'Change where Sales deploys' }))
    const dialog = screen.getByRole('dialog', { name: 'Where Sales deploys' })
    await userEvent.click(within(dialog).getByRole('combobox'))
    await userEvent.click(await screen.findByRole('option', { name: /Project default/ }))
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }))
    await waitFor(() =>
      expect(api.lastRequest('PUT /projects/:id/workspaces/:workspaceId/connection').body).toEqual({
        connectionId: null,
      }),
    )
  })

  it('says what removing changes before it deletes an owned account', async () => {
    const api = installFakeApi()
    api.on('DELETE /projects/:id/connections/:connectionId', {})
    renderPage(null, api)
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
      expect(
        api.lastRequest('DELETE /projects/:id/connections/:connectionId').params,
      ).toMatchObject({ connectionId: 'conn_checkout' }),
    )
  })

  it('renames an account the project owns; a shared one has no Rename', async () => {
    const api = installFakeApi()
    scriptChanges(api)
    renderPage(null, api)
    const prod = await screen.findByRole('listitem', { name: 'Acme production' })
    await userEvent.click(
      within(prod).getByRole('button', { name: 'More actions for Acme production' }),
    )
    expect(await screen.findByRole('menuitem', { name: /Remove from project/ })).toBeVisible()
    expect(screen.queryByRole('menuitem', { name: 'Rename…' })).toBeNull()
    await userEvent.keyboard('{Escape}')

    const own = screen.getByRole('listitem', { name: 'Checkout staging' })
    await userEvent.click(
      within(own).getByRole('button', { name: 'More actions for Checkout staging' }),
    )
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Rename…' }))
    const dialog = screen.getByRole('dialog', { name: 'Rename Checkout staging' })
    const name = within(dialog).getByRole('textbox', { name: 'Name' })
    await userEvent.clear(name)
    await userEvent.type(name, 'Checkout prod')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Rename' }))
    expect(await screen.findByRole('listitem', { name: 'Checkout prod' })).toBeVisible()
    expect(api.lastRequest('PATCH /projects/:id/connections/:connectionId').body).toEqual({
      name: 'Checkout prod',
    })
  })

  it('is read-only for someone who isn’t a project admin', async () => {
    const api = installFakeApi({ viewer: DANIEL })
    asProjectRole(api, 'acme/project-101', 'member')
    renderPage(null, api)
    const prod = await screen.findByRole('listitem', { name: 'Acme production' })
    expect(within(prod).queryByRole('button', { name: /More actions/ })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Make default' })).toBeNull()
    expect(screen.queryByRole('button', { name: /Change where/ })).toBeNull()
    expect(within(topBar()).queryByRole('button', { name: 'Add connection' })).toBeNull()
  })
})

describe('a project with no account (ProjectConnectionsEmpty)', () => {
  it('says Deploy stays disabled and offers both ways in', async () => {
    const api = installFakeApi()
    withNoAccount(api)
    const onAddChange = vi.fn()
    renderPage(null, api, onAddChange)
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
    const api = installFakeApi()
    api.on('POST /projects/:id/connections', { added: [], defaultId: null })
    api.data.seed.connections.push({
      id: 'conn_data',
      orgId: api.data.seed.connections[0]!.orgId,
      name: 'Data platform prod',
      accountId: 'd'.repeat(32),
      addedBy: DANIEL,
      tokenExpiresAt: null,
      projects: ['prj_marketing'],
      deployments: 0,
      lastDeployAt: null,
    })
    api.data.seed.connections.find((c) => c.id === 'conn_marketing')!.projects = 'all'
    const onAddChange = vi.fn()
    renderPage('org', api, onAddChange)
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
      expect(api.lastRequest('POST /projects/:id/connections').body).toEqual({
        connectionIds: ['conn_marketing'],
      }),
    )
  })

  it('asks for the provider first, and goes back to it', async () => {
    renderPage('new')
    const dialog = await screen.findByRole('dialog', { name: 'Add a connection to Project 101' })
    // Nothing to submit before a provider is picked; no provider's fields yet.
    expect(within(dialog).queryByLabelText('API token')).toBeNull()
    expect(within(dialog).queryByRole('button', { name: /connect/i })).toBeNull()
    await userEvent.click(within(dialog).getByRole('button', { name: /Cloudflare.com/ }))
    expect(within(dialog).getByLabelText('API token')).toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: 'Check token and connect' })).toBeEnabled()
    await userEvent.click(within(dialog).getByRole('button', { name: 'Other providers' }))
    expect(within(dialog).queryByLabelText('API token')).toBeNull()
    expect(within(dialog).getByRole('button', { name: /Cloudflare.com/ })).toBeVisible()
  })

  it('connects an account for this project only, with no way to share it with the org', async () => {
    const api = installFakeApi({ viewer: TOM })
    asOrgRole(api, 'acme', 'member')
    asProjectRole(api, 'acme/project-101', 'admin')
    renderPage('new', api)
    const dialog = await screen.findByRole('dialog', { name: 'Add a connection to Project 101' })
    await userEvent.click(within(dialog).getByRole('button', { name: /Cloudflare.com/ }))
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
    const api = installFakeApi()
    api.on('POST /projects/:id/connections/new', (req) =>
      /^[a-f0-9]{32}$/.test((req.body as { accountId: string }).accountId)
        ? { id: 'conn_edge', name: 'Edge staging', scope: 'project', isDefault: false }
        : apiError(400, 'An account ID is 32 letters and digits (0–9, a–f)', {
            field: 'accountId',
          }),
    )
    renderPage('new', api)
    const dialog = await screen.findByRole('dialog', { name: 'Add a connection to Project 101' })
    await userEvent.click(within(dialog).getByRole('button', { name: /Cloudflare.com/ }))
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
      expect(api.requestsTo('POST /projects/:id/connections/new')).toHaveLength(2),
    )
    expect(api.lastRequest('POST /projects/:id/connections/new').body).toMatchObject({
      name: 'Edge staging',
      accountId: 'e'.repeat(32),
    })
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
    const api = installFakeApi()
    api.on('POST /workspaces', (req) => {
      const row = {
        id: 'ws_billing',
        projectId: 'prj_101',
        slug: 'billing',
        name: (req.body as { name: string }).name,
        description: null,
        colour: 'blue' as const,
        createdBy: 'usr_ama',
        createdAt: api.now.toISOString(),
        lock: null,
      }
      api.data.seed.workspaces.push(row)
      return { ...row, updatedAt: row.createdAt }
    })
    renderWithDashboardApi(
      <>
        <CreateBilling />
        <ProjectConnectionsPage slugs={p101} adding={null} onAddChange={vi.fn()} />
      </>,
      { api },
    )
    const table = await screen.findByRole('table', { name: 'Where each workspace deploys' })
    expect(within(table).queryByText('Billing')).toBeNull()
    await userEvent.click(screen.getByRole('button', { name: 'Create Billing' }))
    await waitFor(() => expect(within(table).getByText('Billing')).toBeInTheDocument())
  })
})
