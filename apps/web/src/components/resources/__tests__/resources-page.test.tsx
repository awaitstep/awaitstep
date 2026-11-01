import { useState } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {
  DANIEL,
  dashboardDb,
  renderWithDashboardData,
  resetDashboardData,
} from '../../../data/dashboard/__tests__/fixtures/dashboard-data'
import type { VariableRequest } from '../../variables/variable-requests'
import { ResourcesPage, resourcesTabFrom, type ResourcesTab } from '../resources-page'

const goTo = vi.fn()
vi.mock('../../navigation/router-shell-link', () => ({ useGoTo: () => goTo }))

beforeEach(() => {
  resetDashboardData(new Date())
  goTo.mockReset()
})

function noop() {}

const topBar = () => screen.getByRole('banner', { name: 'Top bar' })
const card = (name: string) => screen.getByRole('article', { name })
const section = (name: string) => screen.getByRole('region', { name })

function Page({
  start = 'nodes',
  request = null,
}: {
  start?: ResourcesTab
  request?: VariableRequest | null
}) {
  const [tab, setTab] = useState<ResourcesTab>(start)
  const [open, setOpen] = useState(request)
  return (
    <ResourcesPage
      org="acme"
      tab={tab}
      onTabChange={setTab}
      variableRequest={open}
      onCloseDialog={() => setOpen(null)}
    />
  )
}

describe('resourcesTabFrom', () => {
  it('opens the tab the URL names, else Nodes', () => {
    expect(resourcesTabFrom('variables')).toBe('variables')
    expect(resourcesTabFrom(undefined)).toBe('nodes')
    expect(resourcesTabFrom('members')).toBe('nodes')
  })
})

describe('Resources › Nodes', () => {
  it('reads as OrgResources: tab counts, Show counts, installed and available cards', async () => {
    renderWithDashboardData(<Page />)
    await screen.findByRole('article', { name: 'Slack' })
    expect(screen.getByRole('tab', { name: 'Nodes 6' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('tab', { name: 'Variables 3' })).toBeVisible()
    const show = screen.getByRole('group', { name: 'Show' })
    expect(within(show).getByRole('button', { name: /All/ })).toHaveTextContent('14')
    expect(within(show).getByRole('button', { name: /Installed/ })).toHaveTextContent('6')
    expect(within(show).getByRole('button', { name: /Available/ })).toHaveTextContent('8')
    expect(within(section('Installed')).getAllByRole('article')).toHaveLength(6)
    expect(within(section('Available from the marketplace')).getAllByRole('article')).toHaveLength(
      8,
    )
    expect(card('Acme CRM lookup')).toHaveTextContent('Data · v4 · by Tom Becker')
    expect(card('Slack')).toHaveTextContent('Update available')
  })

  it('narrows the cards by Show, category and name', async () => {
    renderWithDashboardData(<Page />)
    await screen.findByRole('article', { name: 'Slack' })
    await userEvent.click(
      within(screen.getByRole('group', { name: 'Show' })).getByRole('button', {
        name: /Installed/,
      }),
    )
    expect(screen.queryByRole('region', { name: /Available/ })).not.toBeInTheDocument()
    // Category is a select with a search box: open it, type, pick.
    await userEvent.click(screen.getByRole('button', { name: 'Category: All' }))
    await userEvent.type(screen.getByPlaceholderText('Search categories'), 'mess')
    await userEvent.click(screen.getByRole('option', { name: /Messaging/ }))
    expect(screen.getByRole('button', { name: 'Category: Messaging' })).toBeInTheDocument()
    expect(
      within(section('Installed'))
        .getAllByRole('article')
        .map((a) => a.ariaLabel),
    ).toEqual(['Slack', 'Resend'])
    await userEvent.type(screen.getByRole('searchbox', { name: 'Search nodes' }), 'zzz')
    expect(within(section('Installed')).getByText('No nodes match “zzz”.')).toBeVisible()
  })

  it('searches the categories and says when none match', async () => {
    renderWithDashboardData(<Page />)
    await screen.findByRole('article', { name: 'Slack' })
    await userEvent.click(screen.getByRole('button', { name: 'Category: All' }))
    const options = screen.getAllByRole('option').map((o) => o.textContent)
    expect(options[0]).toMatch(/^All\d+$/)
    await userEvent.type(screen.getByPlaceholderText('Search categories'), 'zzz')
    expect(screen.getByText('No category matches.')).toBeVisible()
    expect(screen.queryAllByRole('option')).toHaveLength(0)
  })

  it('installs a marketplace node for every project', async () => {
    renderWithDashboardData(<Page />)
    await userEvent.click(
      await screen.findByRole('button', {
        name: 'Install Anthropic for every project in Acme Inc',
      }),
    )
    await waitFor(() =>
      expect(
        within(section('Installed')).getByRole('article', { name: 'Anthropic' }),
      ).toBeVisible(),
    )
    expect(card('Anthropic')).toHaveTextContent('Not used yet')
  })

  it('asks before uninstalling a node in use, and keeps it on Keep installed', async () => {
    renderWithDashboardData(<Page />)
    await screen.findByRole('article', { name: 'Slack' })
    await userEvent.click(within(card('Slack')).getByRole('button', { name: 'Uninstall' }))
    const dialog = screen.getByRole('alertdialog', { name: 'Uninstall Slack?' })
    expect(dialog).toHaveTextContent(
      'Used in 6 workflows. Deployed versions keep running, but the next deploy fails',
    )
    await userEvent.click(within(dialog).getByRole('button', { name: 'Keep installed' }))
    expect(within(section('Installed')).getByRole('article', { name: 'Slack' })).toBeVisible()
    await userEvent.click(within(card('Slack')).getByRole('button', { name: 'Uninstall' }))
    await userEvent.click(screen.getByRole('button', { name: 'Uninstall anyway' }))
    await waitFor(() =>
      expect(
        within(section('Available from the marketplace')).getByRole('article', { name: 'Slack' }),
      ).toBeVisible(),
    )
  })

  it('uninstalls a node nobody uses without asking', async () => {
    renderWithDashboardData(<Page />)
    await screen.findByRole('article', { name: 'Resend' })
    await userEvent.click(within(card('Resend')).getByRole('button', { name: 'Uninstall' }))
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    await waitFor(() =>
      expect(dashboardDb().nodes.find((n) => n.id === 'resend')!.installedVersion).toBeNull(),
    )
  })

  it('updates Slack, clearing Update available', async () => {
    renderWithDashboardData(<Page />)
    await userEvent.click(await screen.findByRole('button', { name: 'Update Slack to v2.4.0' }))
    await waitFor(() => expect(card('Slack')).not.toHaveTextContent('Update available'))
    expect(card('Slack')).toHaveTextContent('Messaging · v2.4.0')
  })

  it('explains New custom node', async () => {
    renderWithDashboardData(<Page />)
    await screen.findByRole('article', { name: 'Slack' })
    await userEvent.click(within(topBar()).getByRole('button', { name: 'New custom node' }))
    const dialog = screen.getByRole('dialog', { name: 'New custom node' })
    expect(dialog).toHaveTextContent('every project’s palette')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Got it' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('shows members the catalog without actions, and says why', async () => {
    renderWithDashboardData(<Page />, { userId: DANIEL })
    await screen.findByRole('article', { name: 'Slack' })
    expect(screen.getByText('Only org owners and admins can do this')).toBeVisible()
    expect(within(section('Installed')).queryByRole('button')).not.toBeInTheDocument()
    expect(
      within(section('Available from the marketplace')).queryByRole('button'),
    ).not.toBeInTheDocument()
    expect(within(topBar()).queryByRole('button', { name: 'New custom node' })).toBeNull()
  })
})

describe('Resources › Nodes across orgs', () => {
  function OrgPage({ org }: { org: string }) {
    return (
      <ResourcesPage
        org={org}
        tab="nodes"
        onTabChange={noop}
        variableRequest={null}
        onCloseDialog={noop}
      />
    )
  }

  it('starts the filters afresh in another org, even one already loaded', async () => {
    const { rerender } = renderWithDashboardData(<OrgPage org="acme" />)
    await screen.findByRole('article', { name: 'Slack' })
    rerender(<OrgPage org="bolt-labs" />)
    await screen.findByRole('article', { name: 'Anthropic' })
    await userEvent.type(screen.getByRole('searchbox', { name: 'Search nodes' }), 'zzz')
    // Acme's nodes are cached, so its page shows at once, without a loading step in between.
    rerender(<OrgPage org="acme" />)
    expect(await screen.findByRole('article', { name: 'Slack' })).toBeVisible()
    expect(screen.getByRole('searchbox', { name: 'Search nodes' })).toHaveValue('')
  })
})

describe('Resources › Variables', () => {
  it('lists Acme’s variables with secrets hidden and overrides counted', async () => {
    renderWithDashboardData(<Page start="variables" />)
    const table = await screen.findByRole('table', { name: 'Variables in Acme Inc' })
    const rows = within(table).getAllByRole('row').slice(1)
    expect(rows.map((r) => r.textContent)).toEqual([
      expect.stringContaining('REGIONeuOverridden in 1 project'),
      expect.stringContaining('SUPPORT_EMAILsupport@acme.test'),
      expect.stringContaining('SENTRY_DSN••••••••Secret'),
    ])
    expect(within(topBar()).getByRole('link', { name: 'New variable' })).toHaveAttribute(
      'href',
      '/acme/resources?tab=variables&new=variable',
    )
    expect(within(rows[0]!).getByRole('link', { name: 'Edit' })).toHaveAttribute(
      'href',
      '/acme/resources?tab=variables&variable=REGION',
    )
  })

  it('adds a variable at the Acme Inc level', async () => {
    renderWithDashboardData(<Page start="variables" request={{ kind: 'new' }} />)
    const dialog = await screen.findByRole('dialog', { name: 'New variable' })
    await userEvent.type(within(dialog).getByRole('textbox', { name: /Name/ }), 'STATUS_URL')
    await userEvent.type(
      within(dialog).getByRole('textbox', { name: /Value/ }),
      'https://status.acme.test',
    )
    await userEvent.click(within(dialog).getByRole('button', { name: 'Add variable' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(
      dashboardDb().variables.find((v) => v.name === 'STATUS_URL' && v.level === 'organization'),
    ).toMatchObject({ value: 'https://status.acme.test' })
    expect(await screen.findByRole('cell', { name: 'STATUS_URL' })).toBeVisible()
  })

  it('edits REGION', async () => {
    renderWithDashboardData(
      <Page start="variables" request={{ kind: 'variable', name: 'REGION' }} />,
    )
    const dialog = await screen.findByRole('dialog', { name: 'Edit REGION' })
    const value = within(dialog).getByRole('textbox', { name: /Value/ })
    expect(value).toHaveValue('eu')
    await userEvent.clear(value)
    await userEvent.type(value, 'us')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }))
    await waitFor(() =>
      expect(
        dashboardDb().variables.find((v) => v.name === 'REGION' && v.level === 'organization')!
          .value,
      ).toBe('us'),
    )
  })

  it('is read-only for members, and opens no dialog from the URL', async () => {
    renderWithDashboardData(<Page start="variables" request={{ kind: 'new' }} />, {
      userId: DANIEL,
    })
    const table = await screen.findByRole('table', { name: 'Variables in Acme Inc' })
    expect(within(table).queryByRole('link', { name: 'Edit' })).not.toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(within(topBar()).queryByRole('link', { name: 'New variable' })).toBeNull()
  })
})

describe('Resources states', () => {
  it('shows skeletons while loading and the error card when it fails', async () => {
    const { unmount } = renderWithDashboardData(<Page />, { scenario: 'loading' })
    expect(await screen.findByText('Loading nodes')).toBeInTheDocument()
    unmount()
    renderWithDashboardData(<Page />, { scenario: 'error' })
    expect(await screen.findByText(/We couldn’t load nodes/)).toBeVisible()
  })

  it('says each section is empty under the empty scenario', async () => {
    renderWithDashboardData(<Page />, { scenario: 'empty' })
    expect(await screen.findByText('No nodes installed yet.')).toBeVisible()
    expect(screen.getByText('Nothing more to install.')).toBeVisible()
  })
})
