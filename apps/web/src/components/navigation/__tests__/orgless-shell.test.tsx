import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { useInstanceStore } from '../../../stores/instance-store'
import type { DashboardPage } from '../dashboard-page'
import { OrgLessShell } from '../orgless-shell'

const state = vi.hoisted(() => ({ page: null as DashboardPage | null }))

vi.mock('@tanstack/react-router', () => ({
  useParams: () => ({}),
  useMatches: () => [{ staticData: { dashboardPage: state.page ?? undefined } }],
  useLocation: () => ({ pathname: '/api-playground', href: '/api-playground' }),
  useNavigate: () => vi.fn(),
  useSearch: () => ({}),
}))

vi.mock('../current-org', () => ({
  useBorrowedOrg: () => ({ id: 'o', slug: 'acme', name: 'Acme Inc', logo: null }),
}))
vi.mock('../../inbox/dashboard-overlays', () => ({ DashboardOverlays: () => null }))
vi.mock('../../../data/dashboard/inbox', () => ({
  useNotificationCount: () => ({ data: 0 }),
  useReleases: () => ({ data: { releases: [], lastVisit: null } }),
}))
vi.mock('../../../data/dashboard/session', () => ({
  useViewer: () => ({ data: { name: 'Ama Mensah', email: 'ama@acme.test' } }),
  useOrgs: () => ({ data: [] }),
  useSwitchOrg: () => ({ mutate: vi.fn() }),
}))
vi.mock('../../../data/dashboard/projects', () => ({ useProjects: () => ({ data: undefined }) }))
vi.mock('../../../data/dashboard/reset', () => ({ useResetMockData: () => vi.fn() }))
vi.mock('../../../lib/auth-client', () => ({ handleSignOut: vi.fn() }))

function renderShell() {
  return render(
    <OrgLessShell>
      <p>Playground content</p>
    </OrgLessShell>,
  )
}

beforeEach(() => {
  state.page = { kind: 'playground' }
  useInstanceStore.setState({ features: [], disabled: [] })
})

describe('OrgLessShell', () => {
  it('shows the Playground when the instance leaves it on', () => {
    renderShell()
    expect(screen.getByText('Playground content')).toBeVisible()
  })

  it('answers page-not-found for the Playground when the instance switches it off', () => {
    useInstanceStore.setState({ disabled: ['playground'] })
    renderShell()
    expect(screen.queryByText('Playground content')).not.toBeInTheDocument()
    expect(screen.getByText('/api-playground')).toBeVisible()
    // The way back goes to the org the frame borrowed: the URL names none.
    expect(screen.getByRole('link', { name: 'Back to projects' })).toHaveAttribute(
      'href',
      '/acme/projects',
    )
    expect(screen.queryByRole('link', { name: 'Playground' })).not.toBeInTheDocument()
  })

  it('keeps your account pages when the Playground is switched off', () => {
    useInstanceStore.setState({ disabled: ['playground'] })
    state.page = { kind: 'account', page: 'profile' }
    renderShell()
    expect(screen.getByText('Playground content')).toBeVisible()
  })
})
