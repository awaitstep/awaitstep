import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { LandInWorkspace, pickWorkspace } from '../land-in-workspace'
import { rememberWorkspace } from '../scope-memory'

const workspaces = vi.hoisted(() => ({
  data: undefined as { slug: string }[] | undefined,
  isError: false,
  isFetching: false,
  refetch: vi.fn(),
}))

vi.mock('../../../data/dashboard/workspaces', () => ({
  useWorkspaces: () => workspaces,
}))

vi.mock('@tanstack/react-router', () => ({
  Navigate: ({ to, replace }: { to: string; replace?: boolean }) => (
    <span data-testid="navigate" data-replace={String(Boolean(replace))}>
      {to}
    </span>
  ),
}))

const SLUGS = { org: 'acme', project: 'project-101' }

describe('pickWorkspace', () => {
  it('lands in the most recent workspace that can still be opened', () => {
    expect(pickWorkspace(['sales', 'it'], ['it', 'sales'])).toBe('it')
  })

  it('skips recent slugs that are gone or hidden', () => {
    expect(pickWorkspace(['sales', 'it'], ['old-ws', 'sales'])).toBe('sales')
    expect(pickWorkspace(['sales', 'it'], ['finance'])).toBe('sales')
  })

  it('takes the first when nothing is remembered, and none when there are none', () => {
    expect(pickWorkspace(['sales', 'it'], [])).toBe('sales')
    expect(pickWorkspace([], [])).toBeNull()
  })
})

describe('LandInWorkspace', () => {
  beforeEach(() => localStorage.clear())
  afterEach(() => {
    workspaces.data = undefined
    workspaces.isError = false
    workspaces.refetch.mockReset()
  })

  it('waits for the workspace list', () => {
    render(<LandInWorkspace slugs={SLUGS} />)
    expect(screen.getByRole('status')).toHaveTextContent('Opening the project')
  })

  it('replaces the URL with the remembered workspace', () => {
    rememberWorkspace('acme', 'project-101', 'it')
    workspaces.data = [{ slug: 'sales' }, { slug: 'it' }]
    render(<LandInWorkspace slugs={SLUGS} />)
    const navigate = screen.getByTestId('navigate')
    expect(navigate).toHaveTextContent('/acme/project-101/it/workflows')
    expect(navigate).toHaveAttribute('data-replace', 'true')
  })

  it('still lands in the last good workspace after a stale workspace link', () => {
    rememberWorkspace('acme', 'project-101', 'it')
    rememberWorkspace('acme', 'project-101', 'old-ws')
    workspaces.data = [{ slug: 'sales' }, { slug: 'it' }]
    render(<LandInWorkspace slugs={SLUGS} />)
    expect(screen.getByTestId('navigate')).toHaveTextContent('/acme/project-101/it/workflows')
  })

  it('goes to the project’s Workspaces page when there’s no workspace to open', () => {
    workspaces.data = []
    render(<LandInWorkspace slugs={SLUGS} />)
    expect(screen.getByTestId('navigate')).toHaveTextContent(
      '/acme/project-101/settings/workspaces',
    )
  })

  it('offers a retry instead of loading forever when the list fails', async () => {
    workspaces.isError = true
    render(<LandInWorkspace slugs={SLUGS} />)
    expect(screen.queryByRole('status', { name: /Opening/ })).not.toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveTextContent('We couldn’t open the project')
    await userEvent.click(screen.getByRole('button', { name: /Try again/ }))
    expect(workspaces.refetch).toHaveBeenCalled()
  })
})
