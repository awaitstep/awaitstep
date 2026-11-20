import { beforeEach, describe, expect, it, vi } from 'vitest'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {
  DANIEL,
  dashboardDb,
  dashboardServer,
  renderWithDashboardData,
  resetDashboardData,
} from '../../../data/dashboard/__tests__/fixtures/dashboard-data'
import { useInstanceStore } from '../../../stores/instance-store'
import { GeneralPage } from '../general-page'

// Project Settings → General's Cloudflare account, on dummy data: Project 101
// deploys to Acme production by default and owns Checkout staging.

vi.mock('../../navigation/router-shell-link', () => ({ useGoTo: () => vi.fn() }))

const p101 = { org: 'acme', project: 'project-101' }

beforeEach(() => {
  resetDashboardData(new Date())
  useInstanceStore.setState({ features: [], disabled: [] })
  vi.restoreAllMocks()
})

function addOrgAccount(projects: 'all' | string[] = 'all') {
  dashboardDb().connections.push({
    id: 'conn_data',
    orgId: dashboardDb().connections[0]!.orgId,
    name: 'Data platform prod',
    accountId: 'd'.repeat(32),
    addedBy: DANIEL,
    tokenExpiresAt: null,
    projects,
    deployments: 0,
    lastDeployAt: null,
  })
}

async function renderSection(userId?: string) {
  renderWithDashboardData(<GeneralPage slugs={p101} />, { userId })
  const section = await screen.findByRole('region', { name: 'Cloudflare account' })
  await within(section).findByText('Acme production')
  return section
}

const defaultOf = () =>
  dashboardDb().projectConnections.find((pc) => pc.projectId === 'prj_101' && pc.isDefault)
    ?.connectionId

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
  it('shows the default account', async () => {
    const section = await renderSection()
    expect(section).toHaveTextContent('Cloudflare account ••••7f2a')
  })

  it('reads the summary, and the account lists only once the picker opens', async () => {
    const list = vi.spyOn(dashboardServer.projectConnections, 'listProjectConnections')
    const available = vi.spyOn(
      dashboardServer.projectConnections,
      'listAvailableProjectConnections',
    )
    const section = await renderSection()
    expect(list).not.toHaveBeenCalled()
    expect(available).not.toHaveBeenCalled()
    await openPicker(section)
    await waitFor(() => expect(list).toHaveBeenCalledOnce())
    expect(available).toHaveBeenCalledOnce()
  })

  it('makes another of the project’s accounts the default', async () => {
    const section = await renderSection()
    const dialog = await openPicker(section)
    await pick(dialog, /Checkout staging/)
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(defaultOf()).toBe('conn_checkout'))
    expect(await within(section).findByText('Checkout staging')).toBeVisible()
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('adds an org account the project hasn’t added yet, then makes it the default', async () => {
    addOrgAccount()
    const section = await renderSection()
    const dialog = await openPicker(section)
    await userEvent.click(await within(dialog).findByRole('combobox'))
    const option = await screen.findByRole('option', { name: 'Data platform prod' })
    expect(option).toHaveTextContent('Not added yet')
    await userEvent.click(option)
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(defaultOf()).toBe('conn_data'))
    expect(
      dashboardDb().projectConnections.filter((pc) => pc.projectId === 'prj_101'),
    ).toHaveLength(3)
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
    addOrgAccount()
    const section = await renderSection()
    const dialog = await openPicker(section)
    await pick(dialog, /Data platform prod/)
    // Restricted to another project meanwhile: adding it is refused.
    dashboardDb().connections.find((c) => c.id === 'conn_data')!.projects = ['prj_marketing']
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }))
    expect(
      await within(dialog).findByText('That account isn’t available to this project.'),
    ).toBeVisible()
    expect(defaultOf()).toBe('conn_production')
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
    addOrgAccount()
    const section = await renderSection()
    const dialog = await openPicker(section)
    expect(within(dialog).queryByRole('link')).toBeNull()
    await pick(dialog, /Data platform prod/)
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(defaultOf()).toBe('conn_data'))
  })

  it('is read-only for someone who isn’t a project admin', async () => {
    const section = await renderSection(DANIEL)
    expect(within(section).queryByRole('button')).toBeNull()
    expect(section).toHaveTextContent('Acme production')
  })
})
