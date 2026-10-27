import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ScopeLookup, ScopeSlugs } from '../../../types/dashboard/scope'
import type { DashboardPage } from '../dashboard-page'
import { DashboardShell } from '../dashboard-shell'

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
  scope: { isPending: true, isError: false, isFetching: false } as ScopeQuery,
}))

vi.mock('@tanstack/react-router', () => ({
  useParams: () => state.params,
  useMatches: () => [
    { staticData: {} },
    { staticData: { dashboardPage: state.page ?? undefined } },
  ],
  useLocation: () => ({ pathname: state.pathname }),
  useNavigate: () => vi.fn(),
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
    project: { slug: 'project-101', name: 'Project 101', initial: 'P' },
    viewerRole: 'admin',
    viewerCan: {},
  }
  const workspace = {
    workspace: { slug: 'sales', name: 'Sales', initial: 'S', colour: 'green' },
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

function renderShell() {
  return render(
    <DashboardShell>
      <p>Page content</p>
    </DashboardShell>,
  )
}

afterEach(() => {
  projectRequests.length = 0
  state.params = {}
  state.page = null
  state.pathname = '/'
  state.scope = { isPending: true, isError: false, isFetching: false, refetch: vi.fn() }
})

describe('DashboardShell', () => {
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
    expect(screen.getByRole('link', { name: 'Project settings' })).toHaveAttribute(
      'href',
      '/acme/project-101/settings/workspaces',
    )
    expect(screen.getByRole('link', { name: 'Workflows', current: 'page' })).toBeVisible()
  })

  it('opens the project-settings panel with a way back to the workspace', () => {
    state.params = { org: 'acme', project: 'project-101' }
    state.page = { kind: 'project-settings', page: 'members' }
    settle(found('project'))
    renderShell()
    expect(screen.getByRole('link', { name: 'Back to workspace' })).toHaveAttribute(
      'href',
      '/acme/project-101',
    )
    expect(screen.getByRole('group', { name: 'Project settings' })).toBeVisible()
  })

  it('offers “Back to” the last project from org settings', () => {
    localStorage.setItem(
      'awaitstep:dashboard:recent-projects:acme',
      JSON.stringify(['gone', 'project-101']),
    )
    state.params = { org: 'acme' }
    state.page = { kind: 'org-settings', page: 'general' }
    settle(found('org'))
    renderShell()
    expect(screen.getByRole('link', { name: 'Back to Project 101' })).toHaveAttribute(
      'href',
      '/acme/project-101',
    )
    localStorage.clear()
  })

  it('asks for the project list only on org settings or with the switcher open', () => {
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
    expect(screen.queryByRole('link', { name: 'Project settings' })).not.toBeInTheDocument()
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
    expect(screen.queryByRole('link', { name: 'Project settings' })).not.toBeInTheDocument()
  })

  it('offers to choose another org when the org itself is unknown', () => {
    state.params = { org: 'nope' }
    state.pathname = '/nope/projects'
    settle({ found: false, notFound: { kind: 'organization', slug: 'nope', parent: null } })
    renderShell()
    expect(screen.getByRole('link', { name: 'Choose an organization' })).toHaveAttribute(
      'href',
      '/choose-org',
    )
  })

  it('gives phones a tab bar and, on workspace pages, a header with the project menu', async () => {
    state.params = { org: 'acme', project: 'project-101', workspace: 'sales' }
    state.page = { kind: 'workspace', page: 'runs' }
    settle(found('workspace'))
    renderShell()
    const tabBar = screen.getAllByRole('navigation', { name: 'Organization' })[1]!
    expect(
      within(tabBar)
        .getAllByRole('link')
        .map((link) => link.textContent),
    ).toEqual(['Projects', 'Resources', 'Audit log', 'Inbox', 'Settings'])
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
})
