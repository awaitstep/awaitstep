import { beforeEach, describe, expect, it, vi } from 'vitest'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {
  PRIYA,
  renderWithDashboardData,
  dashboardDb,
  resetDashboardData,
} from '../../../data/dashboard/__tests__/fixtures/dashboard-data'
import { useCreateProject } from '../../../data/dashboard/projects'
import { WorkflowsPage } from '../../items/workflows-page'
import { WorkspaceOverviewPage } from '../workspace-overview-page'
import { WorkspacesPage } from '../../project-settings/workspaces-page'

const sales = { org: 'acme', project: 'project-101', workspace: 'sales' }
const support = { ...sales, workspace: 'support' }

beforeEach(() => resetDashboardData(new Date()))

const card = (title: string) =>
  screen.getByRole('heading', { name: title }).closest('section') as HTMLElement

describe('workspace Overview', () => {
  it('reads as WsOverview: intro, tiles, needs attention, recent runs, people, shared', async () => {
    renderWithDashboardData(<WorkspaceOverviewPage slugs={sales} />)
    expect(await screen.findByRole('heading', { level: 1, name: 'Sales' })).toBeVisible()
    expect(screen.getByText(/4 people can open this workspace/)).toBeInTheDocument()

    await screen.findByRole('heading', { name: 'Needs attention' })
    expect(screen.getByRole('link', { name: '4 Workflows' })).toHaveAttribute(
      'href',
      '/acme/project-101/sales/workflows',
    )
    expect(screen.getByRole('link', { name: '2 Functions' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '1 Failing now' })).toHaveAttribute(
      'href',
      '/acme/project-101/sales/runs',
    )

    const attention = card('Needs attention')
    expect(within(attention).getByText('1 failing')).toBeInTheDocument()
    expect(
      within(attention).getByText('Lead enrichment failed at “Fetch company”'),
    ).toBeInTheDocument()
    expect(
      within(attention).getByText('3 of the last 10 runs failed · CRM returned 429'),
    ).toBeInTheDocument()

    const runs = within(card('Recent runs')).getByRole('table')
    const rows = within(runs).getAllByRole('row').slice(1)
    expect(rows.map((row) => row.querySelector('a')?.textContent)).toEqual([
      'Lead enrichment',
      'Quote follow-up',
      'CRM sync',
      'Inbound webhook triage',
    ])
    expect(rows[2]).toHaveTextContent('200 OK')
    expect(rows[2]).toHaveTextContent('86ms')
    expect(within(card('Recent runs')).getByRole('link', { name: 'All runs' })).toBeVisible()
    expect(within(attention).getByRole('link', { name: 'See runs' })).toHaveAttribute(
      'href',
      '/acme/project-101/sales/runs',
    )

    const people = card('People')
    expect(within(people).getByText('4 can open Sales')).toBeInTheDocument()
    const roleOf = (name: string) =>
      within(people).getByText(name).closest('li')!.lastElementChild!.textContent
    expect(roleOf('Ama Mensah')).toBe('Project admin')
    expect(roleOf('Daniel Kim')).toBe('Editor')
    expect(roleOf('Priya Shah')).toBe('Viewer')

    const shared = card('Shared')
    expect(within(shared).getByText('1 out · 2 in')).toBeInTheDocument()
    expect(within(shared).getByText('Lead enrichment · used by IT')).toBeInTheDocument()
    expect(within(shared).getByText('Provision account · IT')).toBeInTheDocument()
    expect(within(shared).getByRole('link', { name: 'See all' })).toHaveAttribute(
      'href',
      '/acme/project-101/sales/library',
    )
  })

  it('draws the runs tile with % passed and a bar per hour, failures on top', async () => {
    renderWithDashboardData(<WorkspaceOverviewPage slugs={sales} />)
    const strip = await screen.findByRole('img', {
      name: 'Runs per hour over the last 24 hours, with failures marked',
    })
    const tile = strip.closest('a')!
    expect(tile).toHaveAttribute('href', '/acme/project-101/sales/runs')
    expect(tile).toHaveTextContent(/\d+(\.\d)?% passed/)
    expect(tile).toHaveTextContent('Runs in the last 24 hours')
    expect(strip.children).toHaveLength(24)
    expect(strip.querySelectorAll('[data-part="failed"]').length).toBeGreaterThan(0)
  })

  it('gives a Viewer the request instead of New workflow', async () => {
    renderWithDashboardData(<WorkspaceOverviewPage slugs={sales} />, { userId: PRIYA })
    const topBar = screen.getByRole('banner', { name: 'Top bar' })
    expect(await within(topBar).findByRole('button', { name: 'Ask for edit access' })).toBeVisible()
    expect(within(topBar).queryByRole('button', { name: 'New workflow' })).not.toBeInTheDocument()
  })

  it('shows the load error under ?mock=error', async () => {
    renderWithDashboardData(<WorkspaceOverviewPage slugs={sales} />, { scenario: 'error' })
    expect(
      await screen.findByRole('heading', { name: 'We couldn’t load this workspace' }),
    ).toBeVisible()
  })
})

describe('an empty workspace', () => {
  it('reads as EmptyWorkspace on Workflows, with what it inherits and what is shared in', async () => {
    renderWithDashboardData(
      <WorkflowsPage slugs={support} dialog={undefined} onCloseDialog={vi.fn()} />,
    )
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Nothing in Support yet' }),
    ).toBeVisible()
    const inherited = await screen.findByRole('link', { name: /Inherited from Project 101/ })
    await waitFor(() => expect(inherited).toHaveTextContent('2 project admins'))
    expect(inherited).toHaveTextContent('3 project keys')
    expect(inherited).toHaveTextContent('5 variables')
    expect(inherited).toHaveAttribute('href', '/acme/project-101/support/settings?tab=members')
    const sharedIn = screen.getByRole('link', { name: /Shared with Support/ })
    await waitFor(() => expect(sharedIn).toHaveTextContent('Lead enrichment · Sales'))
    expect(sharedIn).toHaveTextContent('Provision account · IT')
  })

  it('creates its first workflow from the hero, which ends the welcome', async () => {
    renderWithDashboardData(
      <WorkflowsPage slugs={support} dialog={undefined} onCloseDialog={vi.fn()} />,
    )
    await screen.findByRole('heading', { name: 'Nothing in Support yet' })
    await userEvent.click(screen.getByRole('button', { name: 'New workflow' }))
    expect(await screen.findByRole('heading', { level: 1, name: 'Workflows' })).toBeVisible()
    expect(screen.getAllByText('Untitled workflow').length).toBeGreaterThan(0)
  })

  it('shows on any workspace under ?mock=empty', async () => {
    renderWithDashboardData(<WorkspaceOverviewPage slugs={sales} />, { scenario: 'empty' })
    expect(await screen.findByRole('heading', { name: 'Start building in Sales' })).toBeVisible()
  })

  it('reads as WsOverview New on Overview: ways to start, then people, deploys and shared', async () => {
    renderWithDashboardData(<WorkspaceOverviewPage slugs={support} />)
    expect(await screen.findByRole('heading', { level: 1, name: 'Support' })).toBeVisible()
    const start = card('Start building in Support')
    expect(within(start).getByText('Nothing here yet')).toBeInTheDocument()
    expect(within(start).getByRole('button', { name: /Start from blank/ })).toBeVisible()
    const reuse = within(start).getByRole('link', { name: /Reuse what the project shares/ })
    expect(reuse).toHaveAttribute('href', '/acme/project-101/support/library')
    expect(reuse).toHaveTextContent(
      'Project 101 already shares 3 items with this workspace. Call them instead of rebuilding.',
    )

    const about = screen.getByRole('list', { name: 'About Support' })
    const row = (label: string) => within(about).getByText(label).closest('li')!
    await waitFor(() =>
      expect(row('People')).toHaveTextContent('2 can open Support — you and Tom Becker'),
    )
    expect(within(row('People')).getByRole('link', { name: 'Manage' })).toHaveAttribute(
      'href',
      '/acme/project-101/support/settings?tab=members',
    )
    await waitFor(() => expect(row('Deploys to')).toHaveTextContent('inherited from Project 101'))
    expect(within(row('Deploys to')).getByRole('link', { name: 'Change' })).toHaveAttribute(
      'href',
      '/acme/connections',
    )
    expect(row('Shared')).toHaveTextContent('3 shared in · 0 shared out')
    expect(within(row('Shared')).getByRole('link', { name: 'Library' })).toHaveAttribute(
      'href',
      '/acme/project-101/support/library',
    )
  })

  it('creates the first workflow from Start from blank: Built, nothing run yet', async () => {
    renderWithDashboardData(<WorkspaceOverviewPage slugs={support} />)
    await userEvent.click(await screen.findByRole('button', { name: /Start from blank/ }))
    expect(await screen.findByRole('link', { name: '1 Workflows' })).toBeVisible()
    expect(screen.queryByRole('heading', { name: 'Start building in Support' })).toBeNull()
    expect(
      screen.getByText(
        '1 workflow and 0 functions, none of them running yet · 2 people can open it',
      ),
    ).toBeVisible()
    // No runs tile or Failing now yet: a nudge to deploy instead.
    expect(screen.getByText('Nothing has run yet')).toBeVisible()
    expect(screen.getByRole('link', { name: 'Deploy one →' })).toHaveAttribute(
      'href',
      '/acme/project-101/support/workflows',
    )
    expect(screen.queryByRole('link', { name: /Failing now/ })).toBeNull()
    expect(within(card('Recent runs')).getByText('No runs yet')).toBeVisible()
    expect(
      within(card('Recent runs')).getByRole('link', { name: 'Deploy a workflow' }),
    ).toBeVisible()
    expect(within(card('Shared')).queryByText('Nothing shared yet')).toBeNull()
  })

  it('opens a new project’s Default workspace on WsOverview’s Empty state', async () => {
    const created = vi.fn()
    const first = renderWithDashboardData(<CreateBilling onCreated={created} />)
    await userEvent.click(screen.getByRole('button', { name: 'Create Billing' }))
    await waitFor(() => expect(created).toHaveBeenCalledWith('billing'))
    first.unmount()

    renderWithDashboardData(
      <WorkspaceOverviewPage slugs={{ org: 'acme', project: 'billing', workspace: 'default' }} />,
    )
    expect(await screen.findByRole('heading', { level: 1, name: 'Default' })).toBeVisible()
    expect(
      screen.getByText('The workspace Billing started with · 1 person can open it'),
    ).toBeVisible()
    expect(screen.getByRole('heading', { name: 'Start building in Default' })).toBeVisible()
    expect(screen.queryByRole('heading', { name: 'Billing is ready' })).toBeNull()
  })

  it('gives a Viewer only the library in the New state', async () => {
    dashboardDb().workspaceMembers.push({
      workspaceId: 'ws_support',
      userId: PRIYA,
      role: 'viewer',
    })
    renderWithDashboardData(<WorkspaceOverviewPage slugs={support} />, { userId: PRIYA })
    const start = await screen.findByRole('heading', { name: 'Nothing in Support yet' })
    const section = start.closest('section')!
    expect(within(section).queryByRole('button', { name: /Start from blank/ })).toBeNull()
    expect(
      within(section).getByRole('link', { name: /Reuse what the project shares/ }),
    ).toBeVisible()
    // Connections are the org owners' and admins': a Viewer reads where it deploys, with no link.
    const deploys = within(screen.getByRole('list', { name: 'About Support' }))
      .getByText('Deploys to')
      .closest('li')!
    expect(within(deploys).queryByRole('link')).not.toBeInTheDocument()
  })
})

function CreateBilling({ onCreated }: { onCreated: (slug: string) => void }) {
  const create = useCreateProject('acme')
  function handleClick() {
    create.mutate({ name: 'Billing' }, { onSuccess: ({ project }) => onCreated(project.slug) })
  }
  return <button onClick={handleClick}>Create Billing</button>
}

describe('a new project’s Workspaces page, /{org}/{project}/workspaces', () => {
  it('reads as EmptyProject: ready, three ways to start, 0 of 3 until an account covers it', async () => {
    const created = vi.fn()
    const first = renderWithDashboardData(<CreateBilling onCreated={created} />)
    await userEvent.click(screen.getByRole('button', { name: 'Create Billing' }))
    await waitFor(() => expect(created).toHaveBeenCalledWith('billing'))
    first.unmount()

    renderWithDashboardData(
      <WorkspacesPage
        slugs={{ org: 'acme', project: 'billing' }}
        dialogOpen={false}
        onDialogChange={vi.fn()}
      />,
    )
    expect(await screen.findByRole('heading', { level: 1, name: 'Billing is ready' })).toBeVisible()
    // Merged into the Workspaces page: the welcome takes the cards' place, the project pool stays.
    expect(screen.queryByRole('heading', { level: 1, name: 'Workspaces' })).toBeNull()
    expect(screen.getByRole('heading', { name: 'Project pool' })).toBeVisible()
    // The project's page: no workspace is open, so it never says "you're in" one.
    expect(screen.queryByText(/You’re in/)).toBeNull()
    expect(
      screen.getByText(/It goes in Default, the project’s only workspace so far\./),
    ).toBeVisible()
    expect(screen.getByText('New project')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'New workflow' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'New function' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Import' })).toHaveAttribute(
      'href',
      '/acme/billing/default/workflows?new=import',
    )
    expect(await screen.findByRole('progressbar', { name: 'Set up Billing' })).toHaveAttribute(
      'aria-valuetext',
      '0 of 3 done',
    )
    // Acme's accounts list their projects, and none lists Billing yet.
    expect(screen.getByRole('link', { name: /Connect Cloudflare/ })).toHaveAttribute(
      'href',
      '/acme/connections?new=connection',
    )
    expect(screen.getByText('3 inherited from Acme Inc')).toBeInTheDocument()
    expect(screen.getByText('Only you so far')).toBeInTheDocument()
    // Teammates join the project from its own Members page, Add people open.
    expect(screen.getByRole('link', { name: /Invite teammates/ })).toHaveAttribute(
      'href',
      '/acme/billing/members?access=add',
    )
    expect(screen.getByRole('link', { name: 'Add a workspace' })).toHaveAttribute(
      'href',
      '/acme/billing/workspaces?new=workspace',
    )
  })

  it('counts Cloudflare as connected once an account covers every project', async () => {
    dashboardDb().connections.find((c) => c.id === 'conn_production')!.projects = 'all'
    const created = vi.fn()
    const first = renderWithDashboardData(<CreateBilling onCreated={created} />)
    await userEvent.click(screen.getByRole('button', { name: 'Create Billing' }))
    await waitFor(() => expect(created).toHaveBeenCalledWith('billing'))
    first.unmount()

    renderWithDashboardData(
      <WorkspacesPage
        slugs={{ org: 'acme', project: 'billing' }}
        dialogOpen={false}
        onDialogChange={vi.fn()}
      />,
    )
    expect(await screen.findByRole('progressbar', { name: 'Set up Billing' })).toHaveAttribute(
      'aria-valuetext',
      '1 of 3 done',
    )
    expect(screen.getByText('Cloudflare connected')).toBeInTheDocument()
  })
})

describe('an established project’s own page', () => {
  it('keeps the welcome to those who run the project: a one-workspace viewer sees the cards', async () => {
    const created = vi.fn()
    const first = renderWithDashboardData(<CreateBilling onCreated={created} />)
    await userEvent.click(screen.getByRole('button', { name: 'Create Billing' }))
    await waitFor(() => expect(created).toHaveBeenCalledWith('billing'))
    first.unmount()
    const billing = dashboardDb().workspaces.find(
      (w) =>
        w.slug === 'default' &&
        w.projectId !== 'prj_101' &&
        dashboardDb().projects.find((p) => p.id === w.projectId)?.slug === 'billing',
    )!
    dashboardDb().workspaceMembers.push({ workspaceId: billing.id, userId: PRIYA, role: 'viewer' })

    renderWithDashboardData(
      <WorkspacesPage
        slugs={{ org: 'acme', project: 'billing' }}
        dialogOpen={false}
        onDialogChange={vi.fn()}
      />,
      { userId: PRIYA },
    )
    expect(await screen.findByRole('heading', { level: 1, name: 'Workspaces' })).toBeVisible()
    expect(screen.queryByRole('heading', { name: /is ready/ })).toBeNull()
  })

  it('is Project home: its workspaces and the project pool, not a redirect', async () => {
    renderWithDashboardData(
      <WorkspacesPage
        slugs={{ org: 'acme', project: 'project-101' }}
        dialogOpen={false}
        onDialogChange={vi.fn()}
      />,
    )
    expect(await screen.findByRole('heading', { level: 1, name: 'Workspaces' })).toBeVisible()
    expect(screen.queryByRole('heading', { name: /is ready/ })).toBeNull()
  })

  it('leaves the welcome to the project page: an empty only workspace shows its own', async () => {
    const created = vi.fn()
    const first = renderWithDashboardData(<CreateBilling onCreated={created} />)
    await userEvent.click(screen.getByRole('button', { name: 'Create Billing' }))
    await waitFor(() => expect(created).toHaveBeenCalledWith('billing'))
    first.unmount()

    renderWithDashboardData(
      <WorkflowsPage
        slugs={{ org: 'acme', project: 'billing', workspace: 'default' }}
        dialog={undefined}
        onCloseDialog={vi.fn()}
      />,
    )
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Nothing in Default yet' }),
    ).toBeVisible()
    expect(screen.queryByRole('heading', { name: 'Billing is ready' })).toBeNull()
  })
})
