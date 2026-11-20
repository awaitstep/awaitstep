import { beforeEach, describe, expect, it, vi } from 'vitest'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {
  DANIEL,
  apiError,
  asProjectRole,
  installFakeApi,
  renderWithDashboardApi,
  type FakeApi,
} from '../../../__tests__/fake-api'
import { useInstanceStore } from '../../../stores/instance-store'
import { GeneralPage } from '../general-page'

// Project Settings → General's Cloudflare account: Project 101 deploys to
// Acme production by default and owns Checkout staging.

vi.mock('../../navigation/router-shell-link', () => ({ useGoTo: () => vi.fn() }))

const p101 = { org: 'acme', project: 'project-101' }

beforeEach(() => {
  useInstanceStore.setState({ features: [], disabled: [] })
})

function addOrgAccount(api: FakeApi, projects: 'all' | string[] = 'all') {
  api.data.seed.connections.push({
    id: 'conn_data',
    orgId: api.data.seed.connections[0]!.orgId,
    name: 'Data platform prod',
    accountId: 'd'.repeat(32),
    addedBy: DANIEL,
    tokenExpiresAt: null,
    projects,
    deployments: 0,
    lastDeployAt: null,
  })
}

async function renderSection(api: FakeApi = installFakeApi()) {
  renderWithDashboardApi(<GeneralPage slugs={p101} />, { api })
  const section = await screen.findByRole('region', { name: 'Cloudflare account' })
  await within(section).findByText('Acme production')
  return section
}

/** The default the page last asked for, as the API received it. */
const chosenDefault = (api: FakeApi) =>
  (api.lastRequest('PUT /projects/:id/default-connection').body as { connectionId: string })
    .connectionId

/** Makes the picked account the default, as the API would, so the summary's refetch shows it. */
function scriptDefault(api: FakeApi) {
  api.on('PUT /projects/:id/default-connection', (req) => {
    const id = (req.body as { connectionId: string }).connectionId
    for (const pc of api.data.seed.projectConnections) {
      if (pc.projectId === 'prj_101') pc.isDefault = pc.connectionId === id
    }
    return {}
  })
  api.on('POST /projects/:id/connections', (req) => {
    for (const connectionId of (req.body as { connectionIds: string[] }).connectionIds) {
      api.data.seed.projectConnections.push({
        projectId: 'prj_101',
        connectionId,
        isDefault: false,
      })
    }
    return { added: [], defaultId: null }
  })
}

async function openPicker(section: HTMLElement) {
  await userEvent.click(
    within(section).getByRole('button', { name: 'Change the default Cloudflare account' }),
  )
  return screen.getByRole('dialog', { name: 'Project 101’s Cloudflare account' })
}

async function pick(dialog: HTMLElement, name: RegExp) {
  await userEvent.click(await within(dialog).findByRole('combobox'))
  await userEvent.click(await screen.findByRole('option', { name }))
}

describe('project Settings › Cloudflare account', () => {
  it('reads the summary, and the account lists only once the picker opens', async () => {
    const api = installFakeApi()
    const section = await renderSection(api)
    expect(api.requestsTo('GET /projects/:id/connections')).toHaveLength(0)
    expect(api.requestsTo('GET /projects/:id/connections/available')).toHaveLength(0)
    await openPicker(section)
    await waitFor(() => expect(api.requestsTo('GET /projects/:id/connections')).toHaveLength(1))
    expect(api.requestsTo('GET /projects/:id/connections/available')).toHaveLength(1)
  })

  it('makes another of the project’s accounts the default', async () => {
    const api = installFakeApi()
    scriptDefault(api)
    const section = await renderSection(api)
    const dialog = await openPicker(section)
    await pick(dialog, /Checkout staging/)
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(chosenDefault(api)).toBe('conn_checkout'))
    expect(await within(section).findByText('Checkout staging')).toBeVisible()
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('adds an org account the project hasn’t added yet, then makes it the default', async () => {
    const api = installFakeApi()
    addOrgAccount(api)
    scriptDefault(api)
    const section = await renderSection(api)
    const dialog = await openPicker(section)
    await userEvent.click(await within(dialog).findByRole('combobox'))
    const option = await screen.findByRole('option', { name: 'Data platform prod' })
    expect(option).toHaveTextContent('Not added yet')
    await userEvent.click(option)
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(chosenDefault(api)).toBe('conn_data'))
    expect(api.lastRequest('POST /projects/:id/connections').body).toEqual({
      connectionIds: ['conn_data'],
    })
  })

  it('offers no account restricted to other projects', async () => {
    const section = await renderSection()
    const dialog = await openPicker(section)
    await userEvent.click(await within(dialog).findByRole('combobox'))
    const options = await screen.findAllByRole('option')
    expect(options.map((o) => o.textContent)).toEqual([
      expect.stringContaining('Acme production'),
      expect.stringContaining('Checkout staging'),
    ])
  })

  it('shows the server’s refusal in the dialog', async () => {
    const api = installFakeApi()
    addOrgAccount(api)
    // Restricted to another project meanwhile: adding it is refused.
    api.on(
      'POST /projects/:id/connections',
      apiError(409, 'That account isn’t available to this project.'),
    )
    const section = await renderSection(api)
    const dialog = await openPicker(section)
    await pick(dialog, /Data platform prod/)
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }))
    expect(
      await within(dialog).findByText('That account isn’t available to this project.'),
    ).toBeVisible()
    expect(api.requestsTo('PUT /projects/:id/default-connection')).toHaveLength(0)
  })

  it('links to the org’s Connections page to connect a new account', async () => {
    const section = await renderSection()
    const dialog = await openPicker(section)
    expect(within(dialog).getByRole('link', { name: 'Connect a new account' })).toHaveAttribute(
      'href',
      '/acme/connections',
    )
  })

  it('has no link to a Connections page while connections.ui is off', async () => {
    useInstanceStore.setState({ disabled: ['connections.ui'] })
    const api = installFakeApi()
    addOrgAccount(api)
    scriptDefault(api)
    const section = await renderSection(api)
    const dialog = await openPicker(section)
    expect(within(dialog).queryByRole('link')).toBeNull()
    await pick(dialog, /Data platform prod/)
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(chosenDefault(api)).toBe('conn_data'))
  })

  it('is read-only for someone who isn’t a project admin', async () => {
    const api = installFakeApi({ viewer: DANIEL })
    asProjectRole(api, 'acme/project-101', 'member')
    const section = await renderSection(api)
    expect(within(section).queryByRole('button')).toBeNull()
    expect(section).toHaveTextContent('Acme production')
  })
})
