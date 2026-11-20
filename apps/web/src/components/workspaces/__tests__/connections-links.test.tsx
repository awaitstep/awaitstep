import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useInstanceStore } from '../../../stores/instance-store'
import type { Project } from '../../../types/dashboard/projects'
import type { Workspace } from '../../../types/dashboard/workspaces'
import { EmptyProject } from '../empty-project'
import { WorkspaceStart } from '../workspace-start'

// Where a workspace's start screens link to the project's Connections page.

vi.mock('../../../data/dashboard/project-connections', () => ({
  useProjectConnections: () => ({
    data: { connections: [], workspaces: [{ workspaceId: 'ws_1', connection: null }] },
    isError: false,
  }),
}))
vi.mock('../../../data/dashboard/session', () => ({ useViewer: () => ({ data: { id: 'u1' } }) }))
vi.mock('../../../data/dashboard/setup', () => ({
  useProjectSetup: () => ({
    data: { cloudflareConnected: false, projectVariables: 0, orgVariables: 0 },
  }),
}))
vi.mock('../../items/use-new-item', () => ({ useNewItem: () => ({ start: vi.fn() }) }))
vi.mock('../../items/new-item-dialog', () => ({ NewItemDialog: () => null }))

const SLUGS = { org: 'acme', project: 'project-101', workspace: 'sales' }
const WORKSPACE = {
  id: 'ws_1',
  projectId: 'p1',
  slug: 'sales',
  name: 'Sales',
  initial: 'S',
  description: null,
  colour: 'green',
  people: [{ id: 'u1', name: 'Ama' }],
  createdAt: '2026-01-01T00:00:00.000Z',
  createdBy: null,
  lock: { kind: 'admins' },
  counts: { workflows: 0, functions: 0, sharedOut: 0 },
  viewerCanEdit: true,
} as unknown as Workspace
const PROJECT = {
  slug: 'project-101',
  name: 'Project 101',
  createdAt: '2026-01-01T00:00:00.000Z',
  people: [{ id: 'u1', name: 'Ama' }],
} as unknown as Project

beforeEach(() => useInstanceStore.setState({ features: [], disabled: [] }))

function renderStart() {
  render(
    <WorkspaceStart
      slugs={SLUGS}
      workspace={WORKSPACE}
      projectName="Project 101"
      sharedIn={[]}
      readOnly={false}
      canManageConnections
    />,
  )
}

function renderEmptyProject() {
  render(
    <EmptyProject
      slugs={SLUGS}
      org={{ name: 'Acme' }}
      project={PROJECT}
      workspace={WORKSPACE}
      readOnly={false}
      canAddWorkspace
    />,
  )
}

describe('WorkspaceStart’s “Deploys to” row', () => {
  it('links to the project’s Connections page', () => {
    renderStart()
    const links = screen.getAllByRole('link').map((link) => link.getAttribute('href'))
    expect(links.some((href) => href?.startsWith('/acme/project-101/connections'))).toBe(true)
  })

  it('still says where it deploys, without the link, when the pages are switched off', () => {
    useInstanceStore.setState({ disabled: ['connections.ui'] })
    renderStart()
    expect(screen.getByText('Deploys to')).toBeInTheDocument()
    const links = screen.queryAllByRole('link').map((link) => link.getAttribute('href'))
    expect(links.some((href) => href?.includes('/connections'))).toBe(false)
  })
})

describe('EmptyProject’s setup steps', () => {
  it('starts with Connect Cloudflare', () => {
    renderEmptyProject()
    expect(screen.getByRole('link', { name: 'Connect Cloudflare' })).toHaveAttribute(
      'href',
      '/acme/project-101/connections?new=connection',
    )
  })

  it('leaves the step out when the instance switches the Connections pages off', () => {
    useInstanceStore.setState({ disabled: ['connections.ui'] })
    renderEmptyProject()
    expect(screen.queryByRole('link', { name: 'Connect Cloudflare' })).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Add project variables/ })).toBeInTheDocument()
  })
})
