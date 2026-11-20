import { beforeEach, describe, expect, it, vi } from 'vitest'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {
  LENA,
  PRIYA,
  TOM,
  dashboardDb,
  dashboardServer,
  renderWithDashboardData,
  resetDashboardData,
} from '../../../data/dashboard/__tests__/fixtures/dashboard-data'
import { useInstanceStore } from '../../../stores/instance-store'
import { WorkspaceSettingsPage } from '../workspace-settings-page'

// Workspace Settings → General's "Deploys to", on dummy data: Sales is set to
// Checkout staging; every other workspace follows Acme production, the default.

vi.mock('virtual:awaitstep/extensions', async () => {
  const { testExtension } = await import('../../../extensions/__tests__/fixtures/test-extension')
  return { default: [testExtension] }
})
vi.mock('../../navigation/router-shell-link', () => ({ useGoTo: () => vi.fn() }))

const sales = { org: 'acme', project: 'project-101', workspace: 'sales' }

beforeEach(() => {
  resetDashboardData(new Date())
  useInstanceStore.setState({ features: [], disabled: [] })
  vi.restoreAllMocks()
})

async function renderRow(options: { workspace?: string; userId?: string } = {}) {
  const slugs = { ...sales, workspace: options.workspace ?? 'sales' }
  renderWithDashboardData(
    <WorkspaceSettingsPage slugs={slugs} tab="general" onTabChange={vi.fn()} />,
    { userId: options.userId },
  )
  return screen.findByRole('region', { name: 'Deploys to' })
}

async function openPicker(row: HTMLElement) {
  await userEvent.click(
    await within(row).findByRole('button', { name: 'Change where this workspace deploys' }),
  )
  return screen.getByRole('dialog', { name: 'Where Sales deploys' })
}

describe('workspace Settings › Deploys to', () => {
  it('shows the workspace’s own account, or the project default', async () => {
    const row = await renderRow()
    expect(await within(row).findByText('Checkout staging')).toBeVisible()
  })

  it('reads the summary, and the project’s accounts only once the picker opens', async () => {
    const list = vi.spyOn(dashboardServer.projectConnections, 'listProjectConnections')
    const row = await renderRow()
    expect(await within(row).findByText('Checkout staging')).toBeVisible()
    expect(list).not.toHaveBeenCalled()
    const dialog = await openPicker(row)
    await waitFor(() => expect(list).toHaveBeenCalledOnce())
    expect(await within(dialog).findByRole('combobox')).toBeVisible()
  })

  it('names the project default for a workspace with no account of its own', async () => {
    const row = await renderRow({ workspace: 'support' })
    expect(await within(row).findByText('Project default (Acme production)')).toBeVisible()
  })

  it('sets the workspace back to the project default', async () => {
    const row = await renderRow()
    const dialog = await openPicker(row)
    await userEvent.click(await within(dialog).findByRole('combobox'))
    await userEvent.click(await screen.findByRole('option', { name: /Project default/ }))
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(dashboardDb().workspaceConnections).toEqual([]))
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
    const dialog = await openPicker(await renderRow({ userId: TOM }))
    expect(within(dialog).getByRole('link', { name: 'Connect a new account' })).toHaveAttribute(
      'href',
      '/acme/project-101/connections',
    )
  })

  it('tells a project admin on an extension’s connect page to ask an org admin', async () => {
    useInstanceStore.setState({ features: ['test-ext'], disabled: ['connections.ui'] })
    const dialog = await openPicker(await renderRow({ userId: TOM }))
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
    const row = await renderRow({ workspace: 'it', userId: LENA })
    expect(await within(row).findByText('Project default (Acme production)')).toBeVisible()
    expect(within(row).queryByRole('button')).toBeNull()
  })

  it('is read-only for a Viewer', async () => {
    const row = await renderRow({ userId: PRIYA })
    expect(await within(row).findByText('Checkout staging')).toBeVisible()
    expect(within(row).queryByRole('button')).toBeNull()
  })
})
