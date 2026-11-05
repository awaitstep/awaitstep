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
}))

vi.mock('../use-workflow-overview', () => ({
  useWorkflowOverview: (_id: string, ready: boolean) => {
    overview.readyAsked.push(ready)
    return overview.current
  },
}))
vi.mock('../workflow-actions', () => ({ WorkflowActions: () => <p>actions</p> }))
vi.mock('../../overview/editable-field', () => ({
  EditableName: ({ initialValue }: { initialValue: string }) => <h1>{initialValue}</h1>,
  EditableDescription: () => null,
}))
vi.mock('@tanstack/react-router', () => ({
  useLocation: () => ({ pathname: '/acme/core/sales/workflows/wf_1/overview' }),
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
    <DataSourceProvider source={source}>
      <EditorScopeProvider value={SLUGS}>
        <ItemPage slugs={SLUGS} workflowId="wf_1" page={page}>
          {({ workflow }) => <p>body of {workflow.name}</p>}
        </ItemPage>
      </EditorScopeProvider>
    </DataSourceProvider>,
  )
}

afterEach(() => {
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
      ['Runs', `${BASE}/runs`],
      ['Deployments', `${BASE}/deployments`],
    ])
    expect(within(tabs).getByRole('link', { name: 'Runs' })).toHaveAttribute('aria-current', 'page')
  })

  it('marks the Runs tab on a single run', () => {
    enterScope()
    settled({ workflow: { id: 'wf_1', name: 'Lead enrichment', kind: 'workflow' } })
    renderPage('run')
    const tabs = screen.getByRole('navigation', { name: 'Workflow pages' })
    expect(within(tabs).getByRole('link', { name: 'Runs' })).toHaveAttribute('aria-current', 'page')
  })

  it('gives a function no Runs tab', () => {
    enterScope()
    settled({ workflow: { id: 'wf_1', name: 'CRM sync', kind: 'script' } })
    renderPage()
    const tabs = screen.getByRole('navigation', { name: 'Workflow pages' })
    expect(within(tabs).queryByRole('link', { name: 'Runs' })).not.toBeInTheDocument()
    expect(screen.getByText('Function')).toBeVisible()
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
