import { beforeEach, describe, expect, it, vi } from 'vitest'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {
  PRIYA,
  renderWithDashboardData,
  resetDashboardData,
} from '../../../data/dashboard/__tests__/fixtures/dashboard-data'
import { useCreateProject } from '../../../data/dashboard/projects'
import { WorkflowsPage } from '../../items/workflows-page'
import { WorkspaceOverviewPage } from '../workspace-overview-page'

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
    expect(within(card('Recent runs')).getByRole('link', { name: 'All runs →' })).toBeVisible()

    const people = card('People')
    expect(within(people).getByText('4 can open Sales')).toBeInTheDocument()
    expect(within(people).getByText('Ama Mensah · Project admin')).toBeInTheDocument()
    expect(within(people).getByText('Daniel Kim · Editor')).toBeInTheDocument()
    expect(within(people).getByText('Priya Shah · Viewer')).toBeInTheDocument()

    const shared = card('Shared')
    expect(within(shared).getByText('1 out · 2 in')).toBeInTheDocument()
    expect(within(shared).getByText('Lead enrichment · used by IT')).toBeInTheDocument()
    expect(within(shared).getByText('Provision account · IT')).toBeInTheDocument()
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
    expect(inherited).toHaveTextContent('1 project key')
    expect(inherited).toHaveTextContent('5 variables')
    expect(inherited).toHaveAttribute('href', '/acme/project-101/support/settings')
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
    expect(await screen.findByRole('heading', { name: 'Nothing in Sales yet' })).toBeVisible()
  })
})

function CreateBilling({ onCreated }: { onCreated: (slug: string) => void }) {
  const create = useCreateProject('acme')
  function handleClick() {
    create.mutate({ name: 'Billing' }, { onSuccess: ({ project }) => onCreated(project.slug) })
  }
  return <button onClick={handleClick}>Create Billing</button>
}

describe('a new project', () => {
  it('reads as EmptyProject: ready, three ways to start, 1 of 3 set up', async () => {
    const created = vi.fn()
    const first = renderWithDashboardData(<CreateBilling onCreated={created} />)
    await userEvent.click(screen.getByRole('button', { name: 'Create Billing' }))
    await waitFor(() => expect(created).toHaveBeenCalledWith('billing'))
    first.unmount()

    renderWithDashboardData(
      <WorkspaceOverviewPage slugs={{ org: 'acme', project: 'billing', workspace: 'default' }} />,
    )
    expect(await screen.findByRole('heading', { level: 1, name: 'Billing is ready' })).toBeVisible()
    expect(screen.getByText('New project')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'New workflow' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'New function' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Import' })).toHaveAttribute(
      'href',
      '/acme/billing/default/workflows?new=import',
    )
    expect(await screen.findByRole('progressbar', { name: 'Set up Billing' })).toHaveAttribute(
      'aria-valuetext',
      '1 of 3 done',
    )
    expect(screen.getByText('Cloudflare connected')).toBeInTheDocument()
    expect(screen.getByText('3 inherited from Acme Inc')).toBeInTheDocument()
    expect(screen.getByText('Only you so far')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Add a workspace' })).toHaveAttribute(
      'href',
      '/acme/billing/settings/workspaces?new=workspace',
    )
  })
})
