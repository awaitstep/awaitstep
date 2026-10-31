import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { OrgSwitcher } from '../org-switcher'
import { ProjectSwitcher } from '../project-switcher'
import { WorkspaceSwitcher } from '../workspace-switcher'

const navigate = vi.hoisted(() => vi.fn())
const switchOrg = vi.hoisted(() => vi.fn())

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => navigate,
}))

vi.mock('../../../data/dashboard/session', () => ({
  useOrgs: () => ({
    data: [
      {
        id: 'o1',
        slug: 'acme',
        name: 'Acme Inc',
        initial: 'A',
        role: 'owner',
        projectCount: 3,
        memberCount: 6,
      },
      {
        id: 'o2',
        slug: 'bolt-labs',
        name: 'Bolt Labs',
        initial: 'B',
        role: 'member',
        projectCount: 1,
        memberCount: 2,
      },
    ],
  }),
  useSwitchOrg: () => ({ mutate: switchOrg }),
}))

const PROJECTS = [
  {
    slug: 'project-101',
    name: 'Project 101',
    initial: 'P',
    workspaces: [
      { id: 's', slug: 'sales', name: 'Sales', colour: 'green' },
      { id: 'i', slug: 'it', name: 'IT', colour: 'blue' },
    ],
  },
  {
    slug: 'marketing-site',
    name: 'Marketing Site',
    initial: 'M',
    workspaces: [{ id: 'd', slug: 'default', name: 'Default', colour: 'amber' }],
  },
]

const projectsQuery = vi.hoisted(() => ({ pending: false }))

vi.mock('../../../data/dashboard/projects', () => ({
  useProjects: () =>
    projectsQuery.pending
      ? { data: undefined, isPending: true }
      : { data: PROJECTS, isPending: false },
}))

vi.mock('../../../data/dashboard/workspaces', () => ({
  useWorkspaces: () => ({
    data: [
      {
        slug: 'sales',
        name: 'Sales',
        initial: 'S',
        colour: 'green',
        people: [{}, {}, {}, {}],
        createdAt: '2026-01-01',
        counts: { workflows: 4, functions: 2 },
      },
      {
        slug: 'it',
        name: 'IT',
        initial: 'I',
        colour: 'blue',
        people: [{}, {}, {}],
        createdAt: '2026-01-01',
        counts: { workflows: 4, functions: 1 },
      },
    ],
  }),
}))

afterEach(() => {
  projectsQuery.pending = false
  navigate.mockReset()
  switchOrg.mockReset()
  localStorage.clear()
})

function lastNavigation() {
  return navigate.mock.calls[navigate.mock.calls.length - 1]![0]
}

async function open(name: string) {
  await userEvent.click(screen.getByRole('button', { name }))
}

describe('OrgSwitcher', () => {
  function renderOrgSwitcher() {
    render(
      <OrgSwitcher
        trigger={<button type="button">Acme Inc</button>}
        current={{ slug: 'acme', name: 'Acme Inc' }}
      />,
    )
  }

  it('lists the orgs with your role and size, the current one ticked', async () => {
    renderOrgSwitcher()
    await open('Acme Inc')
    const acme = screen.getByRole('option', { name: /Acme Inc/ })
    expect(acme).toHaveTextContent('Owner · 3 projects · 6 members')
    expect(within(acme).getByRole('img', { name: 'Current organization' })).toBeInTheDocument()
  })

  it('switches org and opens its projects', async () => {
    renderOrgSwitcher()
    await open('Acme Inc')
    await userEvent.click(screen.getByRole('option', { name: /Bolt Labs/ }))
    expect(switchOrg).toHaveBeenCalledWith('bolt-labs')
    expect(lastNavigation()).toMatchObject({ to: '/bolt-labs/projects' })
  })

  it('leads to the org’s settings and to New organization', async () => {
    renderOrgSwitcher()
    await open('Acme Inc')
    await userEvent.click(screen.getByRole('button', { name: 'Acme Inc settings' }))
    expect(lastNavigation()).toMatchObject({ to: '/acme/settings/general' })
    await open('Acme Inc')
    await userEvent.click(screen.getByRole('button', { name: 'New organization' }))
    expect(lastNavigation()).toMatchObject({ to: '/dashboard', search: { new: 'org' } })
  })
})

describe('ProjectSwitcher', () => {
  function renderProjectSwitcher(onDone?: () => void) {
    render(
      <ProjectSwitcher
        trigger={<button type="button">Project 101</button>}
        org={{ slug: 'acme', name: 'Acme Inc' }}
        currentProject="project-101"
        onDone={onDone}
      />,
    )
  }

  it('says where each project opens', async () => {
    localStorage.setItem(
      'awaitstep:dashboard:recent-workspaces:acme/project-101',
      JSON.stringify(['it']),
    )
    renderProjectSwitcher()
    await open('Project 101')
    expect(screen.getByRole('group', { name: 'Acme Inc projects' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: /Project 101/ })).toHaveTextContent(
      '2 workspaces · Sales, IT · opens in IT',
    )
    expect(screen.getByRole('option', { name: /Marketing Site/ })).toHaveTextContent('1 workspace')
  })

  it('opens the chosen project, which lands in its recent workspace', async () => {
    const onDone = vi.fn()
    renderProjectSwitcher(onDone)
    await open('Project 101')
    await userEvent.type(screen.getByRole('combobox'), 'mar')
    await userEvent.keyboard('{Enter}')
    expect(lastNavigation()).toMatchObject({ to: '/acme/marketing-site' })
    expect(onDone).toHaveBeenCalled()
  })

  it('does nothing but close when you pick the project you’re in', async () => {
    const onDone = vi.fn()
    renderProjectSwitcher(onDone)
    await open('Project 101')
    await userEvent.click(screen.getByRole('option', { name: /Project 101/ }))
    expect(navigate).not.toHaveBeenCalled()
    expect(onDone).toHaveBeenCalled()
  })

  it('says it’s loading on a cold open instead of “nothing matches”', async () => {
    projectsQuery.pending = true
    renderProjectSwitcher()
    await open('Project 101')
    expect(screen.getByText('Loading projects…')).toBeVisible()
    expect(screen.queryByText(/Nothing matches/)).not.toBeInTheDocument()
  })

  it('leads to New project and All projects', async () => {
    renderProjectSwitcher()
    await open('Project 101')
    await userEvent.click(screen.getByRole('button', { name: 'New project' }))
    expect(lastNavigation()).toMatchObject({ to: '/acme/projects', search: { new: 'project' } })
    await open('Project 101')
    await userEvent.click(screen.getByRole('button', { name: 'All projects' }))
    expect(lastNavigation()).toMatchObject({ to: '/acme/projects', search: undefined })
  })
})

describe('WorkspaceSwitcher', () => {
  function renderWorkspaceSwitcher() {
    render(
      <WorkspaceSwitcher
        trigger={<button type="button">Sales</button>}
        slugs={{ org: 'acme', project: 'project-101', workspace: 'sales' }}
        projectName="Project 101"
        page="runs"
      />,
    )
  }

  it('lists the project’s workspaces with their size', async () => {
    renderWorkspaceSwitcher()
    await open('Sales')
    expect(screen.getByRole('group', { name: 'Workspaces in Project 101' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: /^Sales/ })).toHaveTextContent(
      '4 workflows · 4 members',
    )
  })

  it('keeps the page you’re on in the other workspace', async () => {
    renderWorkspaceSwitcher()
    await open('Sales')
    await userEvent.click(screen.getByRole('option', { name: /^IT/ }))
    expect(lastNavigation()).toMatchObject({ to: '/acme/project-101/it/runs' })
  })

  it('leads to New workspace and Manage workspaces', async () => {
    renderWorkspaceSwitcher()
    await open('Sales')
    await userEvent.click(screen.getByRole('button', { name: 'New workspace' }))
    expect(lastNavigation()).toMatchObject({
      to: '/acme/project-101/settings/workspaces',
      search: { new: 'workspace' },
    })
  })
})
