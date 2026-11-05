import type { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type * as ReactQuery from '@tanstack/react-query'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { EditorScopeProvider } from '../../../contexts/editor-scope-context'
import { DataSourceProvider, type DataSource } from '../../../data/dashboard/source'
import { ApiError } from '../../../lib/api-client'
import { routeScopeKey } from '../../../lib/workflows/route-scope'
import { useOrgStore } from '../../../stores/org-store'
import type { ItemDetailPage } from '../../navigation/dashboard-page'
import { ItemPage } from '../item-page'

const overview = vi.hoisted(() => ({
  current: {} as Record<string, unknown>,
  readyAsked: [] as boolean[],
  /** How many deployments the workflow has: none makes it a draft (24f). */
  deploys: 2,
  /** All its runs ever: a workflow that ran was deployed, even with its rows taken down. */
  runsEver: 128,
  /** The viewer's edit right in the workspace (a Viewer has none). */
  canEdit: true,
}))

vi.mock('../use-workflow-overview', () => ({
  useWorkflowOverview: (_id: string, ready: boolean) => {
    overview.readyAsked.push(ready)
    return overview.current
  },
}))
vi.mock('../item-actions-menu', () => ({ ItemActionsMenu: () => <p>actions</p> }))
vi.mock('../../overview/deploy-action', () => ({
  DeployButton: ({
    deployBlocked,
    label = 'Deploy',
  }: {
    deployBlocked?: boolean
    label?: string
  }) => <button disabled={deployBlocked}>{label}</button>,
}))
vi.mock('../../navigation/router-shell-link', () => ({
  RouterShellLink: ({ href, children, ...rest }: { href: string; children: ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}))
vi.mock('../../workspaces/use-workspace-scope', () => ({
  useWorkspaceScope: () => ({
    workspace: { viewerCan: { edit: { allowed: overview.canEdit } } },
  }),
}))
vi.mock('../use-deployment-accounts', () => ({ useDeploymentAccounts: () => new Map() }))
vi.mock('../../../data/dashboard/runs', () => ({
  useWorkflowRunCounts: (_s: unknown, _id: string, { period }: { period?: string } = {}) => ({
    data: {
      counts: period ? { all: 12, failed: 2 } : { all: overview.runsEver, failed: 3 },
      byHour: [],
    },
  }),
}))
vi.mock('@tanstack/react-router', () => ({
  useLocation: () => ({ pathname: '/acme/core/sales/workflows/wf_1/overview' }),
}))
vi.mock('@tanstack/react-query', async (actual) => ({
  ...(await actual<typeof ReactQuery>()),
  useInfiniteQuery: () => ({
    data: {
      pages: [{ data: Array.from({ length: overview.deploys }, () => ({})), nextCursor: null }],
    },
    hasNextPage: false,
  }),
}))

const SLUGS = { org: 'acme', project: 'core', workspace: 'sales' }
const BASE = '/acme/core/sales/workflows/wf_1'

function settled(extra: Record<string, unknown>) {
  overview.current = {
    isLoading: false,
    error: null,
    isFetching: false,
    refetch: vi.fn(),
    hasActiveDeployment: false,
    deployBlocked: false,
    ...extra,
  }
}

function enterScope() {
  useOrgStore.setState({
    appReady: true,
    routeScope: {
      key: routeScopeKey(SLUGS),
      organizationId: 'org_1',
      projectId: 'prj_2',
      workspaceId: 'ws_sales',
    },
  })
}

function renderPage(page: ItemDetailPage = 'overview', source: DataSource = 'api') {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <DataSourceProvider source={source}>
        <EditorScopeProvider value={SLUGS}>
          <ItemPage slugs={SLUGS} workflowId="wf_1" page={page}>
            {({ workflow }) => <p>body of {workflow.name}</p>}
          </ItemPage>
        </EditorScopeProvider>
      </DataSourceProvider>
    </QueryClientProvider>,
  )
}

afterEach(() => {
  overview.canEdit = true
  overview.deploys = 2
  overview.runsEver = 128
  useOrgStore.getState().clear()
  overview.readyAsked.length = 0
})

describe('ItemPage', () => {
  it('reads nothing until API calls follow the URL’s project', () => {
    settled({ isLoading: true })
    useOrgStore.setState({ appReady: true, routeScope: null })
    renderPage()
    expect(screen.getByRole('status')).toHaveTextContent('Loading')
    expect(overview.readyAsked.every((ready) => !ready)).toBe(true)
  })

  it('shows the workflow’s name, actions and tabs over the page, all in the workspace', () => {
    enterScope()
    settled({ workflow: { id: 'wf_1', name: 'Lead enrichment', kind: 'workflow' } })
    renderPage('runs')
    expect(screen.getByRole('heading', { name: 'Lead enrichment' })).toBeVisible()
    expect(screen.getByText('actions')).toBeVisible()
    expect(screen.getByText('body of Lead enrichment')).toBeVisible()
    const tabs = screen.getByRole('navigation', { name: 'Workflow pages' })
    expect(
      within(tabs)
        .getAllByRole('link')
        .map((a) => [a.textContent, a.getAttribute('href')]),
    ).toEqual([
      ['Overview', `${BASE}/overview`],
      ['Runs 128', `${BASE}/runs`],
      ['Deployments 2', `${BASE}/deployments`],
    ])
    expect(within(tabs).getByRole('link', { name: /^Runs/ })).toHaveAttribute(
      'aria-current',
      'page',
    )
    expect(screen.getByRole('link', { name: /Open editor/ })).toHaveAttribute(
      'href',
      `${BASE}?view=canvas`,
    )
    // Nothing live: there is nothing to trigger.
    expect(screen.getByRole('button', { name: 'Trigger a run' })).toBeDisabled()
    // It has been deployed before, so it isn't a draft.
    expect(screen.queryByText('Draft')).not.toBeInTheDocument()
  })

  it('lets an Editor rename in place, and shows a Viewer plain text', () => {
    enterScope()
    settled({ workflow: { id: 'wf_1', name: 'Lead enrichment', kind: 'workflow' } })
    const { unmount } = renderPage()
    const heading = screen.getByRole('heading', { name: 'Lead enrichment' })
    expect(within(heading).getByRole('button', { name: 'Lead enrichment' })).toBeVisible()
    unmount()
    overview.canEdit = false
    renderPage()
    expect(
      within(screen.getByRole('heading', { name: 'Lead enrichment' })).queryByRole('button'),
    ).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Add a description...' })).not.toBeInTheDocument()
  })

  it('isn’t a draft once it has run, though take down removed its deployments', () => {
    enterScope()
    overview.deploys = 0
    settled({ workflow: { id: 'wf_1', name: 'Lead enrichment', kind: 'workflow' } })
    renderPage()
    expect(screen.queryByText('Draft')).not.toBeInTheDocument()
    const tabs = screen.getByRole('navigation', { name: 'Workflow pages' })
    expect(within(tabs).getByRole('link', { name: 'Runs 128' })).toBeVisible()
  })

  it('reads as a draft when it has never been deployed: Draft pill, no tab counts (WorkflowDraft)', () => {
    enterScope()
    overview.deploys = 0
    overview.runsEver = 0
    settled({ workflow: { id: 'wf_1', name: 'Lead enrichment', kind: 'workflow' } })
    renderPage()
    expect(screen.getByText('Draft')).toBeVisible()
    const tabs = screen.getByRole('navigation', { name: 'Workflow pages' })
    expect(
      within(tabs)
        .getAllByRole('link')
        .map((a) => a.textContent),
    ).toEqual(['Overview', 'Runs', 'Deployments'])
  })

  it('says what is live, and when that version is locked, that deploying another is off', () => {
    enterScope()
    settled({
      workflow: { id: 'wf_1', name: 'Lead enrichment', kind: 'workflow', currentVersionId: 'v2' },
      hasActiveDeployment: true,
      deployBlocked: true,
      deployedVersion: { id: 'v2', version: 12, locked: 1 },
      activeDeployment: { id: 'd1', versionId: 'v2', status: 'success' },
    })
    renderPage()
    // What is live reads in the band now, not as a header pill (24a).
    expect(screen.queryByText('Deployed v12')).not.toBeInTheDocument()
    expect(screen.getByText('Locked')).toBeVisible()
    expect(screen.getByText('v12 is locked · deploying another version is off')).toBeVisible()
    expect(screen.getByRole('button', { name: 'Unlock' })).toBeVisible()
    expect(screen.getByRole('button', { name: 'Deploy' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Trigger a run' })).toBeEnabled()
    expect(screen.getByRole('link', { name: /Open editor/ })).toHaveAttribute(
      'href',
      `${BASE}?view=ide`,
    )
  })

  it('marks the Runs tab on a single run', () => {
    enterScope()
    settled({ workflow: { id: 'wf_1', name: 'Lead enrichment', kind: 'workflow' } })
    renderPage('run')
    const tabs = screen.getByRole('navigation', { name: 'Workflow pages' })
    expect(within(tabs).getByRole('link', { name: /^Runs/ })).toHaveAttribute(
      'aria-current',
      'page',
    )
  })

  it('gives a function no tabs and nothing to trigger (FunctionDetail)', () => {
    enterScope()
    settled({
      workflow: { id: 'wf_1', name: 'CRM sync', kind: 'script', sharedBy: 'u-ama' },
      currentVersion: 4,
    })
    renderPage()
    expect(screen.queryByRole('navigation', { name: 'Workflow pages' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Trigger a run' })).not.toBeInTheDocument()
    expect(screen.getByText('Function')).toBeVisible()
    expect(screen.getByText('Shared with the project')).toBeVisible()
    // A function's deploy publishes its latest version (24d).
    expect(screen.getByRole('button', { name: 'Publish v4' })).toBeVisible()
  })

  it('draws no Draft pill on a function, published or not (FunctionDraft)', () => {
    enterScope()
    overview.deploys = 0
    settled({ workflow: { id: 'wf_1', name: 'CRM sync', kind: 'script' }, currentVersion: 1 })
    renderPage()
    expect(screen.queryByText('Draft')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Publish v1' })).toBeVisible()
  })

  it.each(['deploy', 'run'] as const)('leaves the workflow’s actions off the %s page', (page) => {
    enterScope()
    settled({ workflow: { id: 'wf_1', name: 'Lead enrichment' } })
    renderPage(page)
    expect(screen.queryByText('actions')).not.toBeInTheDocument()
  })

  it('says a workflow the API doesn’t find isn’t here', () => {
    enterScope()
    settled({ error: new ApiError('Workflow not found', 404) })
    renderPage()
    expect(screen.getByRole('link', { name: 'Back to the workspace' })).toHaveAttribute(
      'href',
      '/acme/core/sales/overview',
    )
    expect(screen.queryByRole('button', { name: /Try again/ })).not.toBeInTheDocument()
  })

  it('says a workflow from another workspace isn’t here, under this one’s URL', () => {
    enterScope()
    settled({ workflow: { id: 'wf_1', name: 'Ops job', workspaceId: 'ws_ops' } })
    renderPage()
    expect(screen.queryByRole('heading', { name: 'Ops job' })).not.toBeInTheDocument()
    expect(screen.queryByText('actions')).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Back to the workspace' })).toBeVisible()
  })

  it('waits on a cached read from another workspace while a fresh one comes (after a move)', () => {
    enterScope()
    settled({
      workflow: { id: 'wf_1', name: 'Ops job', workspaceId: 'ws_ops' },
      isFetching: true,
    })
    renderPage()
    expect(screen.getByRole('status')).toHaveTextContent('Loading')
    expect(screen.queryByRole('link', { name: 'Back to the workspace' })).not.toBeInTheDocument()
  })

  it('offers a retry when the workflow can’t be loaded', () => {
    enterScope()
    settled({ error: new ApiError('Internal error', 500, { hasReason: false }) })
    renderPage()
    expect(screen.getByRole('button', { name: /Try again/ })).toBeVisible()
  })

  it('says sample items don’t open, on sample data', () => {
    settled({})
    renderPage('overview', 'mock')
    expect(screen.getByRole('heading', { name: 'This is sample data' })).toBeVisible()
  })
})
