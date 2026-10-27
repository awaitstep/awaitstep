import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ChooseOrgEntry } from '../choose-org-entry'

interface Query<T> {
  data?: T
  isError: boolean
  isFetching: boolean
  refetch: () => unknown
}

const queries = vi.hoisted(() => ({
  viewer: { isError: false, isFetching: false } as Query<{ lastOrgSlug: string | null }>,
  orgs: { isError: false, isFetching: false } as Query<
    {
      id: string
      slug: string
      name: string
      initial: string
      projectCount: number
      memberCount: number
    }[]
  >,
}))

vi.mock('../../../data/dashboard/session', () => ({
  useViewer: () => queries.viewer,
  useOrgs: () => queries.orgs,
}))

vi.mock('@tanstack/react-router', () => ({
  Navigate: ({ to }: { to: string }) => <span data-testid="navigate">{to}</span>,
}))

const ACME = {
  id: 'o1',
  slug: 'acme',
  name: 'Acme Inc',
  initial: 'A',
  projectCount: 3,
  memberCount: 6,
}
const BOLT = { id: 'o2', slug: 'bolt', name: 'Bolt', initial: 'B', projectCount: 1, memberCount: 2 }

afterEach(() => {
  queries.viewer = { isError: false, isFetching: false, refetch: vi.fn() }
  queries.orgs = { isError: false, isFetching: false, refetch: vi.fn() }
})

describe('ChooseOrgEntry', () => {
  it('goes straight to the org opened last', () => {
    queries.viewer = {
      data: { lastOrgSlug: 'acme' },
      isError: false,
      isFetching: false,
      refetch: vi.fn(),
    }
    queries.orgs = { data: [ACME, BOLT], isError: false, isFetching: false, refetch: vi.fn() }
    render(<ChooseOrgEntry />)
    expect(screen.getByTestId('navigate')).toHaveTextContent('/acme/projects')
  })

  it('lists the orgs when none was opened last', () => {
    queries.viewer = {
      data: { lastOrgSlug: null },
      isError: false,
      isFetching: false,
      refetch: vi.fn(),
    }
    queries.orgs = { data: [ACME, BOLT], isError: false, isFetching: false, refetch: vi.fn() }
    render(<ChooseOrgEntry />)
    expect(screen.getByRole('link', { name: 'Bolt' })).toHaveAttribute('href', '/bolt/projects')
  })

  it('offers a retry instead of loading forever when the orgs fail', async () => {
    const refetch = vi.fn()
    queries.viewer = {
      data: { lastOrgSlug: null },
      isError: false,
      isFetching: false,
      refetch: vi.fn(),
    }
    queries.orgs = { isError: true, isFetching: false, refetch }
    render(<ChooseOrgEntry />)
    expect(screen.getByRole('alert')).toHaveTextContent('We couldn’t load your organizations')
    await userEvent.click(screen.getByRole('button', { name: /Try again/ }))
    expect(refetch).toHaveBeenCalled()
  })
})
