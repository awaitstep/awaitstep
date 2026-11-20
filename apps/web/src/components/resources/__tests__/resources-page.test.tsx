import { useState } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {
  DANIEL,
  apiError,
  asOrgRole,
  installFakeApi,
  renderWithDashboardApi,
  reply,
  type FakeApi,
} from '../../../__tests__/fake-api'
import type { VariableRequest } from '../../variables/variable-requests'
import { ResourcesPage, resourcesTabFrom, type ResourcesTab } from '../resources-page'

const goTo = vi.fn()
vi.mock('../../navigation/router-shell-link', () => ({ useGoTo: () => goTo }))

beforeEach(() => {
  goTo.mockReset()
})

/** Node changes applied to the seed, as the API would, so the catalog's refetch shows them. */
function scriptNodes(api: FakeApi) {
  api.on('POST /marketplace/:change', (req) => {
    const node = api.data.seed.nodes.find(
      (n) => n.orgId === 'org_acme' && n.id === (req.body as { nodeId: string }).nodeId,
    )!
    node.installedVersion = req.params.change === 'uninstall' ? null : node.latestVersion
    return {}
  })
}

function render(ui: React.ReactElement, api: FakeApi = installFakeApi()) {
  scriptNodes(api)
  return { ...renderWithDashboardApi(ui, { api }), api }
}

/** Daniel, an ordinary member of Acme. */
function asMember(): FakeApi {
  const api = installFakeApi({ viewer: DANIEL })
  asOrgRole(api, 'acme', 'member')
  return api
}

/** The catalog's read refused, or kept waiting. */
function withCatalog(state: 'loading' | 'error'): FakeApi {
  const api = installFakeApi()
  if (state === 'loading') api.hang('GET /marketplace')
  else api.on('GET /marketplace', reply(503, { error: 'Unavailable' }))
  return api
}

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
  it('narrows the cards by Show, category and name', async () => {
    render(<Page />)
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
    render(<Page />)
    await screen.findByRole('article', { name: 'Slack' })
    await userEvent.click(screen.getByRole('button', { name: 'Category: All' }))
    const options = screen.getAllByRole('option').map((o) => o.textContent)
    expect(options[0]).toMatch(/^All\d+$/)
    await userEvent.type(screen.getByPlaceholderText('Search categories'), 'zzz')
    expect(screen.getByText('No category matches.')).toBeVisible()
    expect(screen.queryAllByRole('option')).toHaveLength(0)
  })

  it('installs a marketplace node for every project', async () => {
    render(<Page />)
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

  it('leaves a failed install to its toast, without the server’s text on the page', async () => {
    const api = installFakeApi()
    renderWithDashboardApi(<Page />, { api })
    api.on('POST /marketplace/:change', apiError(500, 'Checksum mismatch for anthropic@1.0.0'))
    const install = await screen.findByRole('button', {
      name: 'Install Anthropic for every project in Acme Inc',
    })
    await userEvent.click(install)
    await waitFor(() => expect(api.requestsTo('POST /marketplace/:change')).toHaveLength(1))
    await waitFor(() => expect(install).toBeEnabled())
    expect(screen.queryByText(/Checksum mismatch/)).toBeNull()
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('asks before uninstalling a node in use, and keeps it on Keep installed', async () => {
    render(<Page />)
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
    const { api } = render(<Page />)
    await screen.findByRole('article', { name: 'Resend' })
    await userEvent.click(within(card('Resend')).getByRole('button', { name: 'Uninstall' }))
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    await waitFor(() =>
      expect(api.lastRequest('POST /marketplace/:change')).toMatchObject({
        params: { change: 'uninstall' },
        body: { nodeId: 'resend' },
      }),
    )
  })

  it('updates Slack, clearing Update available', async () => {
    render(<Page />)
    await userEvent.click(await screen.findByRole('button', { name: 'Update Slack to v2.4.0' }))
    await waitFor(() => expect(card('Slack')).not.toHaveTextContent('Update available'))
    expect(card('Slack')).toHaveTextContent('Messaging · v2.4.0')
  })

  it('explains New custom node', async () => {
    render(<Page />)
    await screen.findByRole('article', { name: 'Slack' })
    await userEvent.click(within(topBar()).getByRole('button', { name: 'New custom node' }))
    const dialog = screen.getByRole('dialog', { name: 'New custom node' })
    expect(dialog).toHaveTextContent('every project’s palette')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Got it' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('shows members the catalog without actions, and says why', async () => {
    render(<Page />, asMember())
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
    const { rerender } = render(<OrgPage org="acme" />)
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
  it('adds a variable at the Acme Inc level', async () => {
    const api = installFakeApi()
    api.on('POST /env-vars', (req) => {
      const body = req.body as { name: string; value: string }
      api.data.seed.variables.push({
        level: 'organization',
        scopeId: 'org_acme',
        name: body.name,
        value: body.value,
        isSecret: false,
      })
      return { id: 'var_new', ...body, skipped: [] }
    })
    render(<Page start="variables" request={{ kind: 'new' }} />, api)
    const dialog = await screen.findByRole('dialog', { name: 'New variable' })
    await userEvent.type(within(dialog).getByRole('textbox', { name: /Name/ }), 'STATUS_URL')
    await userEvent.type(
      within(dialog).getByRole('textbox', { name: /Value/ }),
      'https://status.acme.test',
    )
    await userEvent.click(within(dialog).getByRole('button', { name: 'Add variable' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(api.lastRequest('POST /env-vars').body).toMatchObject({
      name: 'STATUS_URL',
      value: 'https://status.acme.test',
    })
    expect(api.lastRequest('POST /env-vars').query).toEqual({ org: 'acme' })
    expect(await screen.findByRole('cell', { name: 'STATUS_URL' })).toBeVisible()
  })

  it('edits REGION', async () => {
    const { api } = render(
      <Page start="variables" request={{ kind: 'variable', name: 'REGION' }} />,
    )
    const dialog = await screen.findByRole('dialog', { name: 'Edit REGION' })
    const value = within(dialog).getByRole('textbox', { name: /Value/ })
    expect(value).toHaveValue('eu')
    await userEvent.clear(value)
    await userEvent.type(value, 'us')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }))
    await waitFor(() =>
      expect(api.lastRequest('PATCH /env-vars/:id').body).toMatchObject({ value: 'us' }),
    )
  })

  it('is read-only for members, and opens no dialog from the URL', async () => {
    render(<Page start="variables" request={{ kind: 'new' }} />, asMember())
    const table = await screen.findByRole('table', { name: 'Variables in Acme Inc' })
    expect(within(table).queryByRole('link', { name: 'Edit' })).not.toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(within(topBar()).queryByRole('link', { name: 'New variable' })).toBeNull()
  })
})

describe('Resources states', () => {
  it('shows skeletons while loading and the error card when it fails', async () => {
    const { unmount } = render(<Page />, withCatalog('loading'))
    expect(await screen.findByText('Loading nodes')).toBeInTheDocument()
    unmount()
    render(<Page />, withCatalog('error'))
    expect(await screen.findByText(/We couldn’t load nodes/)).toBeVisible()
  })

  it('says each section is empty when the catalog has nothing', async () => {
    const api = installFakeApi()
    api.on('GET /marketplace', { nodes: [] })
    render(<Page />, api)
    expect(await screen.findByText('No nodes installed yet.')).toBeVisible()
    expect(screen.getByText('Nothing more to install.')).toBeVisible()
  })
})
