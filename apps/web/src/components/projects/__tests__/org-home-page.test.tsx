import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { Project } from '../../../types/dashboard/projects'
import { OrgHomePage } from '../org-home-page'
import { MARKETING_SITE, PROJECT_101 } from '../parts/__tests__/fixtures/projects'

interface Query<T> {
  data?: T
  isError: boolean
  isFetching: boolean
  refetch: () => unknown
}

const ok = <T,>(data: T): Query<T> => ({
  data,
  isError: false,
  isFetching: false,
  refetch: vi.fn(),
})
const pending = <T,>(): Query<T> => ({ isError: false, isFetching: true, refetch: vi.fn() })

const state = vi.hoisted(() => ({
  projects: undefined as unknown,
  failing: undefined as unknown,
  activity: undefined as unknown,
  canCreate: true,
}))
const navigate = vi.hoisted(() => vi.fn())
const createProject = vi.hoisted(() => ({
  mutate: vi.fn(),
  reset: vi.fn(),
  isPending: false,
  error: null as Error | null,
}))

vi.mock('@tanstack/react-router', () => ({ useNavigate: () => navigate }))
vi.mock('../../../data/dashboard/workspaces', () => ({
  useScope: () => ({
    data: {
      found: true,
      org: {
        org: { name: 'Acme Inc', initial: 'A' },
        viewerCan: { createProject: { allowed: state.canCreate } },
      },
    },
  }),
}))
vi.mock('../../../data/dashboard/projects', () => ({
  useProjects: () => state.projects,
  useCreateProject: () => createProject,
}))
vi.mock('../../../data/dashboard/runs', () => ({ useFailingNow: () => state.failing }))
vi.mock('../../../data/dashboard/activity', () => ({ useOrgActivity: () => state.activity }))

const FAILING = {
  item: { id: 'i1', name: 'Lead enrichment', kind: 'workflow' },
  project: { slug: 'project-101', name: 'Project 101' },
  workspace: { slug: 'sales', name: 'Sales' },
  run: { id: 'r1', workflowId: 'i1', createdAt: new Date().toISOString() },
}

function settle(projects: Project[] = [PROJECT_101, MARKETING_SITE]) {
  state.projects = ok(projects)
  state.failing = ok([FAILING])
  state.activity = ok([])
}

function renderPage(dialog?: string, onCloseDialog = vi.fn(), then?: string) {
  render(<OrgHomePage org="acme" dialog={dialog} then={then} onCloseDialog={onCloseDialog} />)
  return { onCloseDialog }
}

afterEach(() => {
  state.canCreate = true
  navigate.mockReset()
  createProject.mutate.mockReset()
  createProject.error = null
})

describe('OrgHomePage', () => {
  it('shows skeletons while the page loads', () => {
    state.projects = pending()
    state.failing = pending()
    state.activity = pending()
    renderPage()
    expect(screen.getByRole('status')).toHaveTextContent('Loading projects')
  })

  it('offers a retry when something fails to load', () => {
    settle()
    state.activity = { isError: true, isFetching: false, refetch: vi.fn() }
    renderPage()
    expect(screen.getByRole('alert')).toHaveTextContent('We couldn’t load your projects')
  })

  it('shows tiles, a card per project, a New project card and recent activity', () => {
    settle()
    renderPage()
    expect(screen.getByRole('heading', { level: 1, name: 'Projects' })).toBeVisible()
    expect(screen.getByRole('link', { name: /Failing now/ })).toHaveAttribute(
      'href',
      '/acme/project-101/sales/runs',
    )
    const cards = within(screen.getByRole('list', { name: 'Projects' })).getAllByRole('link')
    expect(cards.map((card) => card.getAttribute('href'))).toEqual([
      '/acme/project-101',
      '/acme/marketing-site',
      '/acme/projects?new=project',
    ])
    expect(screen.getByRole('region', { name: 'Recent activity' })).toBeVisible()
  })

  it('lets each card shrink to its column instead of spilling into the next', () => {
    settle()
    renderPage()
    const cells = within(screen.getByRole('list', { name: 'Projects' })).getAllByRole('listitem')
    for (const cell of cells) expect(cell).toHaveClass('min-w-0')
  })

  it('filters the cards by project or workspace name', async () => {
    settle()
    renderPage()
    await userEvent.type(screen.getByRole('searchbox', { name: 'Search projects' }), 'sales')
    const cards = within(screen.getByRole('list', { name: 'Projects' })).getAllByRole('link')
    expect(cards.map((card) => card.getAttribute('href'))).toEqual(['/acme/project-101'])
    await userEvent.clear(screen.getByRole('searchbox', { name: 'Search projects' }))
    await userEvent.type(screen.getByRole('searchbox', { name: 'Search projects' }), 'zzz')
    expect(screen.getByText(/No project or workspace matches/)).toBeVisible()
  })

  it('welcomes an org with no project yet', () => {
    settle([])
    renderPage()
    expect(screen.getByRole('heading', { level: 1, name: /Start with a project/ })).toBeVisible()
    expect(screen.getByRole('progressbar', { name: 'Get Acme Inc ready' })).toHaveAttribute(
      'aria-valuetext',
      '0 of 3 done',
    )
    expect(screen.getByRole('link', { name: /Import a workflow/ })).toHaveAttribute(
      'href',
      '/acme/projects?new=project&then=import',
    )
  })

  it('hides New project from someone who can’t create one', () => {
    settle()
    state.canCreate = false
    renderPage('project')
    expect(screen.queryByRole('link', { name: /New project/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})

describe('New project dialog', () => {
  it('opens from ?new=project, shows the URL as you type, and lands in the new workspace', async () => {
    settle()
    createProject.mutate.mockImplementation((_input, { onSuccess }) =>
      onSuccess({ project: { slug: 'billing' }, workspace: { slug: 'default' } }),
    )
    renderPage('project')
    const dialog = screen.getByRole('dialog', { name: 'Create a project' })
    await userEvent.type(within(dialog).getByRole('textbox', { name: /Project name/ }), 'Billing')
    expect(within(dialog).getByText('URL: awaitstep.dev/acme/billing')).toBeVisible()
    await userEvent.click(within(dialog).getByRole('button', { name: 'Create project' }))
    expect(createProject.mutate).toHaveBeenCalledWith(
      { name: 'Billing', description: undefined },
      expect.anything(),
    )
    expect(navigate).toHaveBeenCalledWith(
      expect.objectContaining({ to: '/acme/billing/default/overview' }),
    )
  })

  it('lands on the new workspace’s Workflows with the import dialog open after Import a workflow', async () => {
    settle()
    createProject.mutate.mockImplementation((_input, { onSuccess }) =>
      onSuccess({ project: { slug: 'billing' }, workspace: { slug: 'default' } }),
    )
    renderPage('project', vi.fn(), 'import')
    const dialog = screen.getByRole('dialog', { name: 'Create a project' })
    await userEvent.type(within(dialog).getByRole('textbox', { name: /Project name/ }), 'Billing')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Create project' }))
    expect(navigate).toHaveBeenCalledWith(
      expect.objectContaining({
        to: '/acme/billing/default/workflows',
        search: { new: 'import' },
      }),
    )
  })

  it('shows the server’s reason on the name field', () => {
    settle()
    createProject.error = new Error('A project needs a name')
    renderPage('project')
    expect(screen.getByRole('textbox', { name: /Project name/ })).toHaveAccessibleDescription(
      'A project needs a name',
    )
  })

  it('drops ?new when it closes', async () => {
    settle()
    const { onCloseDialog } = renderPage('project')
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onCloseDialog).toHaveBeenCalled()
  })
})
