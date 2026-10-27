import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { OrgSummary } from '../../../types/dashboard/session'
import { ChooseOrgPage } from '../choose-org-page'

interface Query<T> {
  data?: T
  isError: boolean
  isFetching: boolean
  refetch: () => unknown
}

const queries = vi.hoisted(() => ({
  viewer: { isError: false, isFetching: false } as Query<{
    email: string
    lastOrgSlug: string | null
  }>,
  orgs: { isError: false, isFetching: false } as Query<OrgSummary[]>,
}))
const switchOrg = vi.hoisted(() => vi.fn())
const signOut = vi.hoisted(() => vi.fn())

vi.mock('../../../data/dashboard/session', () => ({
  useViewer: () => queries.viewer,
  useOrgs: () => queries.orgs,
  useSwitchOrg: () => ({ mutate: switchOrg }),
}))

vi.mock('../../../lib/auth-client', () => ({ handleSignOut: signOut }))

vi.mock('@tanstack/react-router', () => ({
  Navigate: ({ to }: { to: string }) => <span data-testid="navigate">{to}</span>,
}))

function org(slug: string, name: string, role: OrgSummary['role'], projects: number): OrgSummary {
  return {
    id: slug,
    slug,
    name,
    initial: name.charAt(0),
    logo: null,
    role,
    projectCount: projects,
    memberCount: 2,
    lastOpenedAt: null,
  }
}

const ORGS = [
  org('acme', 'Acme Inc', 'member', 1),
  org('daniels-sandbox', 'Daniel’s sandbox', 'owner', 2),
]

function settle(lastOrgSlug: string | null, orgs: OrgSummary[] = ORGS) {
  queries.viewer = {
    data: { email: 'daniel@acme.test', lastOrgSlug },
    isError: false,
    isFetching: false,
    refetch: vi.fn(),
  }
  queries.orgs = { data: orgs, isError: false, isFetching: false, refetch: vi.fn() }
}

afterEach(() => {
  queries.viewer = { isError: false, isFetching: false, refetch: vi.fn() }
  queries.orgs = { isError: false, isFetching: false, refetch: vi.fn() }
  switchOrg.mockReset()
  signOut.mockReset()
})

describe('ChooseOrgPage', () => {
  it('goes straight to the org opened last', () => {
    settle('acme')
    render(<ChooseOrgPage />)
    expect(screen.getByTestId('navigate')).toHaveTextContent('/acme/projects')
  })

  it('lists your orgs when none was opened last, or the last one is gone', () => {
    settle('globex')
    render(<ChooseOrgPage />)
    expect(screen.getByRole('heading', { level: 1, name: 'Choose an organization' })).toBeVisible()
    expect(screen.getByText(/Signed in as daniel@acme.test/)).toBeVisible()
    const rows = within(screen.getByRole('list', { name: 'Your organizations' })).getAllByRole(
      'link',
    )
    expect(rows.map((row) => row.getAttribute('href'))).toEqual([
      '/acme/projects',
      '/daniels-sandbox/projects',
    ])
    expect(rows[0]).toHaveTextContent('Member · 1 project · 2 members')
  })

  it('records the org you choose as the last one', async () => {
    settle(null)
    render(<ChooseOrgPage />)
    await userEvent.click(screen.getByRole('link', { name: /Daniel’s sandbox/ }))
    expect(switchOrg).toHaveBeenCalledWith('daniels-sandbox')
  })

  it('offers Create an organization and a real Sign out', async () => {
    settle(null)
    render(<ChooseOrgPage />)
    expect(screen.getByRole('link', { name: 'Create an organization' })).toHaveAttribute(
      'href',
      '/choose-org?new=org',
    )
    await userEvent.click(screen.getByRole('button', { name: 'Sign out' }))
    expect(signOut).toHaveBeenCalled()
  })

  it('offers a retry instead of loading forever when the orgs fail', async () => {
    const refetch = vi.fn()
    settle(null)
    queries.orgs = { isError: true, isFetching: false, refetch }
    render(<ChooseOrgPage />)
    expect(screen.getByRole('alert')).toHaveTextContent('We couldn’t load your organizations')
    await userEvent.click(screen.getByRole('button', { name: /Try again/ }))
    expect(refetch).toHaveBeenCalled()
  })
})
