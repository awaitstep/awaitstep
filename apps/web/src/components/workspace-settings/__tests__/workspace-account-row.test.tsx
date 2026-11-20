import { beforeEach, describe, expect, it, vi } from 'vitest'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {
  LENA,
  PRIYA,
  TOM,
  asOrgRole,
  asProjectRole,
  asWorkspaceRole,
  installFakeApi,
  renderWithDashboardApi,
  type FakeApi,
} from '../../../__tests__/fake-api'
import { useInstanceStore } from '../../../stores/instance-store'
import { WorkspaceSettingsPage } from '../workspace-settings-page'

// Workspace Settings → General's "Deploys to": Sales is set to Checkout
// staging; every other workspace follows Acme production, the default.

vi.mock('virtual:awaitstep/extensions', async () => {
  const { testExtension } = await import('../../../extensions/__tests__/fixtures/test-extension')
  return { default: [testExtension] }
})
vi.mock('../../navigation/router-shell-link', () => ({ useGoTo: () => vi.fn() }))

const sales = { org: 'acme', project: 'project-101', workspace: 'sales' }

beforeEach(() => {
  useInstanceStore.setState({ features: [], disabled: [] })
})

async function renderRow(options: { workspace?: string; api?: FakeApi } = {}) {
  const slugs = { ...sales, workspace: options.workspace ?? 'sales' }
  renderWithDashboardApi(
    <WorkspaceSettingsPage slugs={slugs} tab="general" onTabChange={vi.fn()} />,
    { api: options.api ?? installFakeApi() },
  )
  return screen.findByRole('region', { name: 'Deploys to' })
}

/** Tom runs Project 101 but is an ordinary org member. */
function asTom(): FakeApi {
  const api = installFakeApi({ viewer: TOM })
  asOrgRole(api, 'acme', 'member')
  asProjectRole(api, 'acme/project-101', 'admin')
  return api
}

async function openPicker(row: HTMLElement) {
  await userEvent.click(
    await within(row).findByRole('button', { name: 'Change where this workspace deploys' }),
  )
  return screen.getByRole('dialog', { name: 'Where Sales deploys' })
}

describe('workspace Settings › Deploys to', () => {
  it('reads the summary, and the project’s accounts only once the picker opens', async () => {
    const api = installFakeApi()
    const row = await renderRow({ api })
    expect(await within(row).findByText('Checkout staging')).toBeVisible()
    expect(api.requestsTo('GET /projects/:id/connections')).toHaveLength(0)
    const dialog = await openPicker(row)
    await waitFor(() => expect(api.requestsTo('GET /projects/:id/connections')).toHaveLength(1))
    expect(await within(dialog).findByRole('combobox')).toBeVisible()
  })

  it('sets the workspace back to the project default', async () => {
    const api = installFakeApi()
    api.on('PUT /projects/:id/workspaces/:workspaceId/connection', () => {
      api.data.seed.workspaceConnections = []
      return {}
    })
    const row = await renderRow({ api })
    const dialog = await openPicker(row)
    await userEvent.click(await within(dialog).findByRole('combobox'))
    await userEvent.click(await screen.findByRole('option', { name: /Project default/ }))
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }))
    await waitFor(() =>
      expect(api.lastRequest('PUT /projects/:id/workspaces/:workspaceId/connection').body).toEqual({
        connectionId: null,
      }),
    )
    expect(await within(row).findByText('Project default (Acme production)')).toBeVisible()
  })

  it('links to the extension’s page to connect a new account', async () => {
    useInstanceStore.setState({ features: ['test-ext'], disabled: ['connections.ui'] })
    const dialog = await openPicker(await renderRow())
    expect(within(dialog).getByRole('link', { name: 'Connect a new account' })).toHaveAttribute(
      'href',
      '/acme/integrations',
    )
    expect(within(dialog).queryByRole('button', { name: 'Connect a new account' })).toBeNull()
  })

  it('sends a project admin who isn’t an org admin to the project’s Connections', async () => {
    // Tom runs Project 101 but is an ordinary org member: the org's page has no Connect for him.
    const dialog = await openPicker(await renderRow({ api: asTom() }))
    expect(within(dialog).getByRole('link', { name: 'Connect a new account' })).toHaveAttribute(
      'href',
      '/acme/project-101/connections',
    )
  })

  it('tells a project admin on an extension’s connect page to ask an org admin', async () => {
    useInstanceStore.setState({ features: ['test-ext'], disabled: ['connections.ui'] })
    const dialog = await openPicker(await renderRow({ api: asTom() }))
    expect(within(dialog).queryByRole('link')).toBeNull()
    expect(
      within(dialog).getByText(
        'An org owner or admin can connect another on the Integrations page.',
      ),
    ).toBeVisible()
  })

  it('has no link with connections.ui off and no extension', async () => {
    useInstanceStore.setState({ disabled: ['connections.ui'] })
    const dialog = await openPicker(await renderRow())
    expect(within(dialog).queryByRole('link')).toBeNull()
  })

  it('is read-only for a workspace admin who isn’t a project admin', async () => {
    // Lena runs IT, but not Project 101.
    const api = installFakeApi({ viewer: LENA })
    asOrgRole(api, 'acme', 'member')
    asProjectRole(api, 'acme/project-101', null)
    asWorkspaceRole(api, 'acme/project-101/it', 'admin')
    const row = await renderRow({ workspace: 'it', api })
    expect(await within(row).findByText('Project default (Acme production)')).toBeVisible()
    expect(within(row).queryByRole('button')).toBeNull()
  })

  it('is read-only for a Viewer', async () => {
    const api = installFakeApi({ viewer: PRIYA })
    asOrgRole(api, 'acme', 'member')
    asProjectRole(api, 'acme/project-101', 'member')
    asWorkspaceRole(api, 'acme/project-101/sales', 'viewer')
    const row = await renderRow({ api })
    expect(await within(row).findByText('Checkout staging')).toBeVisible()
    expect(within(row).queryByRole('button')).toBeNull()
  })
})
