import { beforeEach, describe, expect, it, vi } from 'vitest'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {
  PRIYA,
  apiError,
  asWorkspaceRole,
  installFakeApi,
  renderWithDashboardApi,
  type FakeApi,
} from '../../../__tests__/fake-api'
import { createdWorkflow } from '../../../__tests__/fixtures/api/workflows'
import { WorkflowsPage } from '../../items/workflows-page'
import { WorkspaceOverviewPage } from '../workspace-overview-page'
import { WorkspacesPage } from '../../project-settings/workspaces-page'

const goTo = vi.fn()
vi.mock('../../navigation/router-shell-link', () => ({ useGoTo: () => goTo }))

const sales = { org: 'acme', project: 'project-101', workspace: 'sales' }
const support = { ...sales, workspace: 'support' }

beforeEach(() => {
  goTo.mockReset()
})

const card = (title: string) =>
  screen.getByRole('heading', { name: title }).closest('section') as HTMLElement

/** Fills in the New workflow / New function dialog and creates it. */
async function nameAndCreate(kind: 'workflow' | 'function', name: string) {
  const dialog = await screen.findByRole('dialog', { name: `New ${kind}` })
  await userEvent.type(within(dialog).getByRole('textbox', { name: /Name/ }), name)
  await userEvent.click(within(dialog).getByRole('button', { name: `Create ${kind}` }))
}

/** Stores what the page creates in `workspaceId`, as the API would, so its reads show it. */
function scriptCreate(api: FakeApi, workspaceId: string) {
  api.on('POST /workflows', (req) => {
    const body = req.body as { name: string; kind?: 'workflow' | 'script' }
    const row = createdWorkflow(workspaceId, body, api.now)
    api.data.seed.items.push({
      id: row.id,
      workspaceId,
      kind: body.kind ?? 'workflow',
      name: body.name,
      description: null,
      status: 'draft',
      version: null,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      sharing: null,
    })
    return row
  })
}

/** Priya, a Viewer in `key`. */
function asViewer(key: string): FakeApi {
  const api = installFakeApi({ viewer: PRIYA })
  asWorkspaceRole(api, key, 'viewer')
  return api
}

/** A new project, Billing, with the one Default workspace it starts with. */
function withBilling(api: FakeApi) {
  const p101 = api.data.projects['acme/project-101']!
  const sales = api.data.workspaces['acme/project-101/sales']!
  const chip = {
    id: 'ws_billing_default',
    slug: 'default',
    name: 'Default',
    colour: 'green' as const,
  }
  api.data.projects['acme/billing'] = {
    ...p101,
    id: 'prj_billing',
    slug: 'billing',
    name: 'Billing',
    description: null,
    lock: null,
    workspaces: [chip],
    health: { workflows: 0, deployed: 0, failing: 0, lastRunAt: null },
  }
  api.data.projectSetup.prj_billing = {
    cloudflareConnected: false,
    orgVariables: 3,
    projectVariables: 0,
    projectKeys: 0,
  }
  api.data.workspaces['acme/billing/default'] = {
    ...sales,
    ...chip,
    projectId: 'prj_billing',
    createdAt: api.now.toISOString(),
    updatedAt: api.now.toISOString(),
    lock: null,
    inheritedLock: null,
  }
  api.data.seed.projects.push({
    id: 'prj_billing',
    orgId: 'org_acme',
    slug: 'billing',
    name: 'Billing',
    description: null,
    createdAt: api.now.toISOString(),
    updatedAt: api.now.toISOString(),
    lock: null,
  })
  api.data.seed.workspaces.push({
    ...chip,
    projectId: 'prj_billing',
    description: null,
    createdAt: api.now.toISOString(),
    createdBy: 'usr_ama',
    lock: null,
  })
}

describe('workspace Overview', () => {
  it('gives a Viewer the request instead of New workflow', async () => {
    renderWithDashboardApi(<WorkspaceOverviewPage slugs={sales} />, {
      api: asViewer('acme/project-101/sales'),
    })
    const topBar = screen.getByRole('banner', { name: 'Top bar' })
    expect(await within(topBar).findByRole('button', { name: 'Ask for edit access' })).toBeVisible()
    expect(within(topBar).queryByRole('button', { name: 'New workflow' })).not.toBeInTheDocument()
  })

  it('shows the load error when the overview can’t be read', async () => {
    const api = installFakeApi()
    api.on('GET /workspaces/:id/overview', apiError(503, 'Unavailable'))
    renderWithDashboardApi(<WorkspaceOverviewPage slugs={sales} />, { api })
    expect(
      await screen.findByRole('heading', { name: 'We couldn’t load the overview' }),
    ).toBeVisible()
  })
})

describe('an empty workspace', () => {
  it('creates its first workflow from the hero and opens it on the template picker', async () => {
    const api = installFakeApi()
    scriptCreate(api, 'ws_support')
    renderWithDashboardApi(
      <WorkflowsPage slugs={support} dialog={undefined} onCloseDialog={vi.fn()} />,
      { api },
    )
    await screen.findByRole('heading', { name: 'Nothing in Support yet' })
    await userEvent.click(screen.getByRole('button', { name: 'New workflow' }))
    await nameAndCreate('workflow', 'Ticket triage')
    expect(await screen.findByRole('heading', { level: 1, name: 'Workflows' })).toBeVisible()
    expect(screen.getAllByText('Ticket triage').length).toBeGreaterThan(0)
    expect(goTo).toHaveBeenCalledWith(
      expect.stringMatching(/^\/acme\/project-101\/support\/workflows\/[^/?]+\?template=1$/),
    )
  })

  it('asks for a name before creating anything, in one dialog for both buttons', async () => {
    const api = installFakeApi()
    renderWithDashboardApi(
      <WorkflowsPage slugs={support} dialog={undefined} onCloseDialog={vi.fn()} />,
      { api },
    )
    await screen.findByRole('heading', { name: 'Nothing in Support yet' })
    await userEvent.click(screen.getByRole('button', { name: 'New function' }))
    expect(screen.getAllByRole('dialog')).toHaveLength(1)
    expect(screen.getByRole('dialog', { name: 'New function' })).toBeVisible()
    expect(api.requestsTo('POST /workflows')).toHaveLength(0)
  })

  it('creates the first workflow from Start from blank: Built, nothing run yet', async () => {
    const api = installFakeApi()
    scriptCreate(api, 'ws_support')
    renderWithDashboardApi(<WorkspaceOverviewPage slugs={support} />, { api })
    await userEvent.click(await screen.findByRole('button', { name: /Start from blank/ }))
    // Opened from Start from blank, the dialog starts on Blank.
    expect(screen.getByRole('radio', { name: /Blank/ })).toBeChecked()
    await nameAndCreate('workflow', 'Ticket triage')
    expect(await screen.findByRole('link', { name: '1 Workflows' })).toBeVisible()
    // Blank means blank: its editor opens without the template picker.
    expect(goTo).toHaveBeenCalledWith(
      expect.stringMatching(/^\/acme\/project-101\/support\/workflows\/[^/?]+$/),
    )
    expect(screen.queryByRole('heading', { name: 'Start building in Support' })).toBeNull()
    // No runs tile or Failing now yet: a nudge to deploy instead.
    expect(screen.getByText('No runs in the last 24 hours')).toBeVisible()
    expect(screen.getByRole('link', { name: 'Deploy one' })).toHaveAttribute(
      'href',
      '/acme/project-101/support/workflows',
    )
    expect(screen.queryByRole('link', { name: /Failing now/ })).toBeNull()
    expect(within(card('Recent runs')).getByText('No runs yet')).toBeVisible()
  })

  it('gives a Viewer only the library in the New state', async () => {
    renderWithDashboardApi(<WorkspaceOverviewPage slugs={support} />, {
      api: asViewer('acme/project-101/support'),
    })
    const start = await screen.findByRole('heading', { name: 'Nothing in Support yet' })
    const section = start.closest('section')!
    expect(within(section).queryByRole('button', { name: /Start from blank/ })).toBeNull()
    expect(
      within(section).getByRole('link', { name: /Reuse what the project shares/ }),
    ).toBeVisible()
  })
})

describe('a project’s Workspaces page', () => {
  it('opens the editor of the function New function creates, in the project’s only workspace', async () => {
    const api = installFakeApi()
    withBilling(api)
    scriptCreate(api, 'ws_billing_default')
    renderWithDashboardApi(
      <WorkspacesPage
        slugs={{ org: 'acme', project: 'billing' }}
        dialogOpen={false}
        onDialogChange={vi.fn()}
      />,
      { api },
    )
    const newFunction = await screen.findByRole('button', { name: 'New function' })
    await userEvent.click(newFunction)
    await nameAndCreate('function', 'Invoice webhook')
    await waitFor(() =>
      expect(goTo).toHaveBeenCalledWith(
        expect.stringMatching(/^\/acme\/billing\/default\/workflows\/[^/?]+$/),
      ),
    )
  })

  it('is Project home: its workspaces and the project-wide, not a redirect', async () => {
    renderWithDashboardApi(
      <WorkspacesPage
        slugs={{ org: 'acme', project: 'project-101' }}
        dialogOpen={false}
        onDialogChange={vi.fn()}
      />,
    )
    expect(await screen.findByRole('heading', { level: 1, name: 'Workspaces' })).toBeVisible()
    expect(screen.queryByRole('heading', { name: /is ready/ })).toBeNull()
  })
})
