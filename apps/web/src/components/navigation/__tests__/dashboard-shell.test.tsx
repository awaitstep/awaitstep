import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ScopeLookup, ScopeSlugs } from '../../../types/dashboard/scope'
import { DataSourceProvider, type DataSource } from '../../../data/dashboard/source'
import type { DashboardPage } from '../dashboard-page'
import { DashboardShell } from '../dashboard-shell'
import type * as ReactQuery from '@tanstack/react-query'

interface ScopeQuery {
  data?: ScopeLookup
  isPending: boolean
  isError: boolean
  isFetching: boolean
  refetch: () => Promise<unknown>
}

const state = vi.hoisted(() => ({
  params: {} as Partial<ScopeSlugs>,
  page: null as DashboardPage | null,
  pathname: '/',
  search: {} as Record<string, string>,
  navigate: vi.fn(),
  scope: { isPending: true, isError: false, isFetching: false } as ScopeQuery,
  workflow: undefined as
    { name: string; kind?: 'workflow' | 'script'; workspaceId?: string } | undefined,
  workflowAsked: [] as boolean[],
}))

vi.mock('@tanstack/react-router', () => ({
  useParams: () => state.params,
  useMatches: () => [
    { staticData: {} },
    { staticData: { dashboardPage: state.page ?? undefined } },
  ],
  useLocation: () => ({ pathname: state.pathname, href: state.pathname }),
  useNavigate: () => state.navigate,
  useSearch: () => state.search,
}))

// The frame's one query: the item it names.
vi.mock('@tanstack/react-query', async (actual) => ({
  ...(await actual<typeof ReactQuery>()),
  useQuery: ({ enabled }: { enabled?: boolean }) => {
    state.workflowAsked.push(!!enabled)
    return { data: enabled ? state.workflow : undefined }
  },
}))

vi.mock('../../inbox/dashboard-overlays', () => ({
  DashboardOverlays: ({ open, onClose }: { open?: string; onClose: () => void }) =>
    open ? (
      <button type="button" onClick={onClose}>
        Close {open}
      </button>
    ) : null,
}))

vi.mock('../../../data/dashboard/workspaces', () => ({
  useScope: () => state.scope,
  useWorkspaces: () => ({
    data: [
      {
        slug: 'sales',
        name: 'Sales',
        initial: 'S',
        colour: 'green',
        people: [],
        createdAt: '2026-01-01',
        counts: { workflows: 4, functions: 0 },
      },
      {
        slug: 'it',
        name: 'IT',
        initial: 'I',
        colour: 'blue',
        people: [],
        createdAt: '2026-01-01',
        counts: { workflows: 1, functions: 0 },
      },
    ],
  }),
}))

vi.mock('../../../data/dashboard/inbox', () => ({
  useNotifications: () => ({ data: { list: [], counts: { all: 3, unread: 2, action: 0 } } }),
  useReleases: () => ({ data: { releases: [{ fresh: true }], lastVisit: null } }),
}))

vi.mock('../../../data/dashboard/session', () => ({
  useViewer: () => ({ data: { name: 'Ama Mensah', email: 'ama@acme.test' } }),
  useOrgs: () => ({ data: [] }),
  useSwitchOrg: () => ({ mutate: vi.fn() }),
}))

const projectRequests = vi.hoisted(() => [] as boolean[])

vi.mock('../../../data/dashboard/projects', () => ({
  useProjects: (_org: string, { enabled = true }: { enabled?: boolean } = {}) => {
    projectRequests.push(enabled)
    return {
      data: enabled
        ? [{ slug: 'project-101', name: 'Project 101', initial: 'P', workspaces: [] }]
        : undefined,
    }
  },
}))

vi.mock('../../../data/dashboard/reset', () => ({
  useResetMockData: () => vi.fn(),
}))

vi.mock('../../../lib/auth-client', () => ({
  handleSignOut: vi.fn(),
}))

const ALLOWED = { allowed: true }

function found(level: 'org' | 'project' | 'workspace'): ScopeLookup {
  const org = {
    org: { id: 'o', slug: 'acme', name: 'Acme Inc', initial: 'A' },
    viewerRole: 'owner',
    viewerCan: {},
  }
  const project = {
    project: { id: 'p', slug: 'project-101', name: 'Project 101', initial: 'P' },
    viewerRole: 'admin',
    viewerCan: {},
  }
  const workspace = {
    workspace: { id: 'ws_sales', slug: 'sales', name: 'Sales', initial: 'S', colour: 'green' },
    viewerRole: 'admin',
    viewerCan: { edit: ALLOWED },
  }
  return {
    found: true,
    org,
    ...(level !== 'org' && { project }),
    ...(level === 'workspace' && { workspace }),
  } as unknown as ScopeLookup
}

function settle(lookup: ScopeLookup) {
  state.scope = {
    data: lookup,
    isPending: false,
    isError: false,
    isFetching: false,
    refetch: vi.fn(),
  }
}

/** The desktop rail; the phone tab bar repeats some of its links (CSS shows one or the other). */
function rail() {
  return screen.getAllByRole('navigation', { name: 'Organization' })[0]!
}

function renderShell(source: DataSource = 'mock') {
  return render(
    <DataSourceProvider source={source}>
      <DashboardShell>
        <p>Page content</p>
      </DashboardShell>
    </DataSourceProvider>,
  )
}

afterEach(() => {
  projectRequests.length = 0
  state.params = {}
  state.page = null
  state.pathname = '/'
  state.search = {}
  state.navigate.mockReset()
  state.scope = { isPending: true, isError: false, isFetching: false, refetch: vi.fn() }
  state.workflow = undefined
  state.workflowAsked.length = 0
})

describe('DashboardShell', () => {
  describe('around the editor', () => {
    const workspaceSlugs = { org: 'acme', project: 'project-101', workspace: 'sales' }

    it('draws no frame once the workspace is found: the editor fills the screen', () => {
      state.params = workspaceSlugs
      state.page = { kind: 'editor' }
      settle(found('workspace'))
      renderShell('api')
      expect(screen.getByText('Page content')).toBeVisible()
      expect(screen.queryByRole('navigation', { name: 'Organization' })).not.toBeInTheDocument()
    })

    it('keeps the frame while the workspace loads, so a missing one gets its not-found page', () => {
      state.params = workspaceSlugs
      state.page = { kind: 'editor' }
      renderShell('api')
      expect(screen.getByRole('status')).toHaveTextContent('Loading')
      expect(rail()).toBeInTheDocument()
    })

    it('frames the sample-data notice', () => {
      state.params = workspaceSlugs
      state.page = { kind: 'editor' }
      settle(found('workspace'))
      renderShell('mock')
      expect(screen.getByText('Page content')).toBeVisible()
      expect(rail()).toBeInTheDocument()
    })
  })

  describe('around a workflow’s own pages', () => {
    const itemParams = { org: 'acme', project: 'project-101', workspace: 'sales', id: 'wf_1' }

    it('frames them in the workspace, under Workflows, with the item in the breadcrumb', () => {
      state.params = itemParams
      state.page = { kind: 'item', page: 'runs' }
      state.workflow = { name: 'Lead enrichment', kind: 'workflow' }
      settle(found('workspace'))
      renderShell('api')
      expect(screen.getByText('Page content')).toBeVisible()
      const crumbs = screen.getByRole('navigation', { name: 'Breadcrumb' })
      expect(within(crumbs).getByRole('link', { name: 'Workflows' })).toHaveAttribute(
        'href',
        '/acme/project-101/sales/workflows',
      )
      expect(within(crumbs).getByRole('link', { name: 'Lead enrichment' })).toHaveAttribute(
        'href',
        '/acme/project-101/sales/workflows/wf_1/overview',
      )
      expect(within(crumbs).getByText('Runs')).toHaveAttribute('aria-current', 'page')
      expect(screen.getByRole('link', { name: 'Workflows', current: 'page' })).toBeVisible()
    })

    it('marks Functions for a function', () => {
      state.params = itemParams
      state.page = { kind: 'item', page: 'overview' }
      state.workflow = { name: 'CRM sync', kind: 'script' }
      settle(found('workspace'))
      renderShell('api')
      expect(screen.getByRole('link', { name: 'Functions', current: 'page' })).toBeVisible()
    })

    it('marks no list and names the item by id until it loads', () => {
      state.params = itemParams
      state.page = { kind: 'item', page: 'overview' }
      settle(found('workspace'))
      renderShell('api')
      const crumbs = screen.getByRole('navigation', { name: 'Breadcrumb' })
      expect(within(crumbs).getByRole('link', { name: 'wf_1' })).toBeVisible()
      for (const list of ['Workflows', 'Functions']) {
        expect(screen.queryByRole('link', { name: list, current: 'page' })).not.toBeInTheDocument()
      }
    })

    it('doesn’t name a workflow from another workspace in this one’s frame', () => {
      state.params = itemParams
      state.page = { kind: 'item', page: 'overview' }
      state.workflow = { name: 'Ops job', kind: 'workflow', workspaceId: 'ws_ops' }
      settle(found('workspace'))
      renderShell('api')
      const crumbs = screen.getByRole('navigation', { name: 'Breadcrumb' })
      expect(within(crumbs).queryByText('Ops job')).not.toBeInTheDocument()
      expect(within(crumbs).getByRole('link', { name: 'wf_1' })).toBeVisible()
    })

    it('reads no workflow on sample data or on other pages', () => {
      state.params = itemParams
      state.page = { kind: 'item', page: 'overview' }
      settle(found('workspace'))
      renderShell('mock')
      state.page = { kind: 'workspace', page: 'workflows' }
      renderShell('api')
      expect(state.workflowAsked.every((asked) => !asked)).toBe(true)
    })
  })

  it('keeps the frame while the scope loads, and holds the page back', () => {
    state.params = { org: 'acme', project: 'project-101', workspace: 'sales' }
    renderShell()
    expect(screen.getByRole('status')).toHaveTextContent('Loading')
    expect(screen.queryByText('Page content')).not.toBeInTheDocument()
    expect(within(rail()).getByRole('link', { name: 'Projects' })).toHaveAttribute(
      'href',
      '/acme/projects',
    )
  })

  it('shows a workspace page with the workspace panel and full breadcrumbs', () => {
    state.params = { org: 'acme', project: 'project-101', workspace: 'sales' }
    state.page = { kind: 'workspace', page: 'workflows' }
    settle(found('workspace'))
    renderShell()
    expect(screen.getByText('Page content')).toBeVisible()
    const crumbs = screen.getByRole('navigation', { name: 'Breadcrumb' })
    expect(within(crumbs).getByText('Workflows')).toHaveAttribute('aria-current', 'page')
    expect(within(crumbs).getByRole('link', { name: 'Sales' })).toHaveAttribute(
      'href',
      '/acme/project-101/sales/overview',
    )
    expect(screen.getByRole('link', { name: 'Project' })).toHaveAttribute(
      'href',
      '/acme/project-101/workspaces',
    )
    expect(screen.getByRole('link', { name: 'Workflows', current: 'page' })).toBeVisible()
  })

  it('opens the project’s menu on a project page: no heading, no way back to a workspace', () => {
    state.params = { org: 'acme', project: 'project-101' }
    state.page = { kind: 'project', page: 'members' }
    settle(found('project'))
    renderShell()
    expect(screen.queryByRole('link', { name: 'Back to workspace' })).toBeNull()
    expect(screen.queryByText('Project settings')).toBeNull()
    const menu = screen.getByRole('navigation', { name: 'Project' })
    expect(within(menu).getByRole('link', { name: 'Members', current: 'page' })).toHaveAttribute(
      'href',
      '/acme/project-101/members',
    )
    expect(within(menu).getByRole('link', { name: 'Settings' })).toHaveAttribute(
      'href',
      '/acme/project-101/settings',
    )
  })

  it('shows org settings without a second panel: its sections are tabs on the page', () => {
    state.params = { org: 'acme' }
    state.page = { kind: 'org-settings', page: 'general' }
    settle(found('org'))
    renderShell()
    expect(screen.queryByRole('navigation', { name: 'Organization settings' })).toBeNull()
    expect(projectRequests.every((enabled) => !enabled)).toBe(true)
  })

  it('asks for the project list only with the switcher open', () => {
    state.params = { org: 'acme', project: 'project-101', workspace: 'sales' }
    state.page = { kind: 'workspace', page: 'workflows' }
    settle(found('workspace'))
    renderShell()
    expect(projectRequests.every((enabled) => !enabled)).toBe(true)
  })

  it('opens the switchers from the rail avatar, project header and workspace card', async () => {
    state.params = { org: 'acme', project: 'project-101', workspace: 'sales' }
    state.page = { kind: 'workspace', page: 'runs' }
    settle(found('workspace'))
    renderShell()
    await userEvent.click(
      screen.getByRole('button', { name: 'Project: Project 101. Switch project' }),
    )
    expect(screen.getByRole('dialog', { name: 'Switch project' })).toBeVisible()
    await userEvent.keyboard('{Escape}')
    await userEvent.click(within(rail()).getByRole('button', { name: /Acme Inc/ }))
    expect(screen.getByRole('dialog', { name: 'Switch organization' })).toBeVisible()
    await userEvent.keyboard('{Escape}')
    await userEvent.click(
      screen.getByRole('button', { name: 'Workspace: Sales. Switch workspace' }),
    )
    expect(screen.getByRole('dialog', { name: 'Switch workspace' })).toBeVisible()
  })

  it('has no panel on an org page', () => {
    state.params = { org: 'acme' }
    state.page = { kind: 'org', page: 'audit' }
    settle(found('org'))
    renderShell()
    expect(screen.queryByRole('link', { name: 'Project' })).not.toBeInTheDocument()
    expect(within(rail()).getByRole('link', { name: 'Audit log', current: 'page' })).toBeVisible()
  })

  it('shows not found inside the frame for a workspace the viewer can’t open', () => {
    state.params = { org: 'acme', project: 'project-101', workspace: 'finance' }
    state.pathname = '/acme/project-101/finance/workflows'
    state.page = { kind: 'workspace', page: 'workflows' }
    settle({
      found: false,
      notFound: {
        kind: 'workspace',
        slug: 'finance',
        parent: { name: 'Project 101', slug: 'project-101' },
      },
    })
    renderShell()
    expect(screen.queryByText('Page content')).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(/workspace/i)
    expect(screen.getByText('/acme/project-101/finance/workflows')).toBeVisible()
    expect(screen.getByRole('link', { name: 'Open Project 101' })).toHaveAttribute(
      'href',
      '/acme/project-101',
    )
    expect(screen.queryByRole('link', { name: 'Project' })).not.toBeInTheDocument()
  })

  it('offers to choose another org when the org itself is unknown', () => {
    state.params = { org: 'nope' }
    state.pathname = '/nope/projects'
    settle({ found: false, notFound: { kind: 'organization', slug: 'nope', parent: null } })
    renderShell()
    expect(screen.getByRole('link', { name: 'Go to your organizations' })).toHaveAttribute(
      'href',
      '/dashboard',
    )
  })

  it('gives phones a tab bar and, on workspace pages, a header with the project menu', async () => {
    state.params = { org: 'acme', project: 'project-101', workspace: 'sales' }
    state.page = { kind: 'workspace', page: 'runs' }
    state.pathname = '/acme/project-101/sales/runs'
    settle(found('workspace'))
    renderShell()
    const tabBar = screen.getAllByRole('navigation', { name: 'Organization' })[1]!
    expect(
      within(tabBar)
        .getAllByRole('link')
        .map((link) => link.textContent),
    ).toEqual(['Projects', 'Resources', 'Audit log', '2Inbox', 'Settings'])
    // The unread count rides on Inbox, which opens over the page you're on.
    expect(
      within(tabBar).getByRole('link', { name: 'Inbox, 2 unread notifications' }),
    ).toHaveAttribute('href', '/acme/project-101/sales/runs?open=inbox')
    expect(within(tabBar).getByRole('link', { name: 'Projects' })).toHaveAttribute(
      'aria-current',
      'page',
    )
    expect(screen.getByRole('link', { name: 'Back to projects' })).toHaveAttribute(
      'href',
      '/acme/projects',
    )

    const trigger = screen.getByRole('button', {
      name: 'Project 101, Sales. Open the project menu',
    })
    await userEvent.click(trigger)
    const sheet = screen.getByRole('dialog', { name: 'Project menu' })
    const it = within(sheet).getByRole('link', { name: /^IT/ })
    expect(it).toHaveAttribute('href', '/acme/project-101/it/overview')
    await userEvent.click(it)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

    await userEvent.click(trigger)
    await userEvent.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(trigger).toHaveFocus()
  })

  it('gives a project page on a phone its project menu: every project page, no workspace open', async () => {
    state.params = { org: 'acme', project: 'project-101' }
    state.page = { kind: 'project', page: 'workspaces' }
    settle(found('project'))
    renderShell()
    expect(screen.getByRole('link', { name: 'Back to projects' })).toHaveAttribute(
      'href',
      '/acme/projects',
    )
    await userEvent.click(
      screen.getByRole('button', { name: 'Project 101. Open the project menu' }),
    )
    const sheet = screen.getByRole('dialog', { name: 'Project menu' })
    const pages = within(within(sheet).getByRole('navigation', { name: 'Project' }))
    expect(pages.getByRole('link', { name: 'API keys' })).toHaveAttribute(
      'href',
      '/acme/project-101/api-keys',
    )
    expect(pages.getByRole('link', { name: 'Settings' })).toHaveAttribute(
      'href',
      '/acme/project-101/settings',
    )
  })

  it('shows the org in the phone header outside a workspace', () => {
    state.params = { org: 'acme' }
    state.page = { kind: 'org', page: 'projects' }
    settle(found('org'))
    renderShell()
    expect(screen.getByRole('button', { name: 'Acme Inc, switch organization' })).toBeVisible()
    expect(screen.queryByRole('link', { name: 'Back to projects' })).not.toBeInTheDocument()
  })

  it('offers a retry when the scope can’t be looked up', async () => {
    const refetch = vi.fn()
    state.params = { org: 'acme' }
    state.scope = { isPending: false, isError: true, isFetching: false, refetch }
    renderShell()
    expect(screen.getByRole('alert')).toHaveTextContent('We couldn’t open this page')
    await userEvent.click(screen.getByRole('button', { name: /Try again/ }))
    expect(refetch).toHaveBeenCalled()
  })

  it('opens ?open= over the page and closes it as a new step in history', async () => {
    state.params = { org: 'acme' }
    state.page = { kind: 'org', page: 'resources' }
    state.pathname = '/acme/resources'
    state.search = { open: 'inbox' }
    settle(found('org'))
    renderShell()
    await userEvent.click(screen.getByRole('button', { name: 'Close inbox' }))
    // Not a replace: that would leave two identical entries, and Back would stand still.
    expect(state.navigate).toHaveBeenCalledWith({ href: '/acme/resources' })
  })
})
