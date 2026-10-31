import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { PendingInvite } from '../../../types/dashboard/invites'
import type { OrgListing, Viewer } from '../../../types/dashboard/session'
import { DashboardPage } from '../dashboard-page'
import { ACME, DANIEL, GLOBEX_INVITE, SANDBOX } from './fixtures/dashboard'

interface Query<T> {
  data?: T
  isError: boolean
  isFetching: boolean
  isPending?: boolean
  refetch: () => unknown
}

interface Answer {
  mutate: (v: undefined, opts?: { onSuccess?: () => void; onError?: () => void }) => void
  isPending: boolean
  error: Error | null
}

const state = vi.hoisted(() => ({
  viewer: {} as Query<Viewer>,
  orgs: {} as Query<OrgListing[]>,
  invites: {} as Query<PendingInvite[]>,
  decline: { result: 'success' as 'success' | 'error' },
}))
const switchOrg = vi.hoisted(() => vi.fn())
const declineCalls = vi.hoisted(() => vi.fn())
const undoCalls = vi.hoisted(() => vi.fn())
const signOut = vi.hoisted(() => vi.fn())

vi.mock('../../../data/dashboard/session', () => ({
  useViewer: () => state.viewer,
  useOrgs: () => state.orgs,
  useSwitchOrg: () => ({ mutate: switchOrg }),
  useCreateOrg: () => ({ mutate: vi.fn(), reset: vi.fn(), isPending: false, error: null }),
}))

vi.mock('../../../data/dashboard/invites', () => ({
  useMyInvites: () => state.invites,
  useDeclineInvite: (token: string): Answer => ({
    mutate: (_, opts) => {
      declineCalls(token)
      if (state.decline.result === 'error') opts?.onError?.()
      else opts?.onSuccess?.()
    },
    isPending: false,
    error: null,
  }),
  useUndoDeclineInvite: (token: string): Answer => ({
    mutate: (_, opts) => {
      undoCalls(token)
      opts?.onSuccess?.()
    },
    isPending: false,
    error: null,
  }),
}))

vi.mock('../../../lib/auth-client', () => ({ handleSignOut: signOut }))
vi.mock('../../navigation/router-shell-link', () => ({ useGoTo: () => vi.fn() }))

function settled<T>(data: T): Query<T> {
  return { data, isError: false, isFetching: false, isPending: false, refetch: vi.fn() }
}

function settle({ orgs = [SANDBOX, ACME], invites = [] as PendingInvite[], viewer = DANIEL } = {}) {
  state.viewer = settled(viewer)
  state.orgs = settled(orgs)
  state.invites = settled(invites)
}

function renderPage(dialog?: string) {
  return render(<DashboardPage dialog={dialog} onCloseDialog={vi.fn()} />)
}

afterEach(() => {
  state.decline.result = 'success'
  switchOrg.mockReset()
  declineCalls.mockReset()
  undoCalls.mockReset()
  signOut.mockReset()
})

describe('DashboardPage', () => {
  it('greets you and lists your orgs most recently opened first, the last one marked', () => {
    settle()
    renderPage()
    expect(screen.getByRole('heading', { level: 1, name: 'Welcome back, Daniel' })).toBeVisible()
    expect(
      screen.getByText(
        'Signed in as daniel@acme.test. Pick an organization, or carry on where you left off.',
      ),
    ).toBeVisible()
    expect(screen.getByText('2 organizations · most recently opened first')).toBeVisible()
    const section = screen.getByRole('region', { name: 'Your organizations' })
    const links = within(section).getAllByRole('link')
    expect(links.map((link) => link.getAttribute('href'))).toEqual([
      '/acme/projects',
      '/daniels-sandbox/projects',
      '/dashboard?new=org',
    ])
    expect(links[0]).toHaveTextContent('Last used')
    expect(links[0]).toHaveTextContent('1 project you can open')
    expect(links[0]).toHaveTextContent('Sales · Editor')
    expect(links[0]).toHaveTextContent('1 failing')
    expect(links[1]).toHaveTextContent('2 projects')
    expect(links[1]).toHaveTextContent('Just you')
    expect(links[1]).not.toHaveTextContent('Last used')
  })

  it('records the org you open as the last one', async () => {
    settle()
    renderPage()
    await userEvent.click(screen.getByRole('link', { name: 'Daniel’s sandbox' }))
    expect(switchOrg).toHaveBeenCalledWith('daniels-sandbox')
  })

  it('filters by name and says when nothing matches, keeping Create', async () => {
    settle()
    renderPage()
    const search = screen.getByRole('searchbox', { name: 'Find an organization' })
    await userEvent.type(search, 'SAND')
    expect(screen.queryByRole('link', { name: 'Acme Inc' })).toBeNull()
    expect(screen.getByRole('link', { name: 'Daniel’s sandbox' })).toBeVisible()
    await userEvent.clear(search)
    await userEvent.type(search, 'globex')
    expect(screen.getByRole('status')).toHaveTextContent('No organization matches “globex”.')
    expect(screen.getByRole('link', { name: /Create an organization/ })).toBeVisible()
  })

  it('shows an invite waiting for you with where it leads, and Review and join', () => {
    settle({ invites: [GLOBEX_INVITE] })
    renderPage()
    const section = screen.getByRole('region', { name: 'Waiting for you' })
    expect(within(section).getByText('Lena Ortiz invited you to Globex')).toBeVisible()
    expect(within(section).getByText('Member · Platform workspace · expires 4 Nov')).toBeVisible()
    expect(within(section).getByRole('link', { name: 'Review and join' })).toHaveAttribute(
      'href',
      '/invite/inv-globex',
    )
  })

  it('keeps a declined invite on the page with Undo, even once the list drops it', async () => {
    settle({ invites: [GLOBEX_INVITE] })
    const { rerender } = renderPage()
    await userEvent.click(screen.getByRole('button', { name: 'Decline' }))
    expect(declineCalls).toHaveBeenCalledWith('inv-globex')
    // The decline's refetch: the invite is no longer open.
    state.invites = settled([])
    rerender(<DashboardPage dialog={undefined} onCloseDialog={vi.fn()} />)
    expect(screen.getByText('Declined. Lena Ortiz was told.')).toBeVisible()
    await userEvent.click(screen.getByRole('button', { name: 'Undo' }))
    expect(undoCalls).toHaveBeenCalledWith('inv-globex')
    state.invites = settled([GLOBEX_INVITE])
    rerender(<DashboardPage dialog={undefined} onCloseDialog={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'Decline' })).toBeVisible()
  })

  it('puts the invite back when the decline fails', async () => {
    state.decline.result = 'error'
    settle({ invites: [GLOBEX_INVITE] })
    renderPage()
    await userEvent.click(screen.getByRole('button', { name: 'Decline' }))
    expect(screen.getByRole('button', { name: 'Decline' })).toBeVisible()
    expect(screen.queryByText(/Declined\./)).toBeNull()
  })

  it('still lists your orgs when the invites fail to load', () => {
    settle()
    state.invites = { isError: true, isFetching: false, isPending: false, refetch: vi.fn() }
    renderPage()
    expect(screen.queryByRole('region', { name: 'Waiting for you' })).toBeNull()
    expect(screen.getByRole('link', { name: 'Acme Inc' })).toBeVisible()
  })

  it('welcomes someone in no org with 17b and Create an organization', () => {
    settle({ orgs: [], viewer: { ...DANIEL, lastOrgSlug: null } })
    renderPage()
    expect(
      screen.getByRole('heading', { level: 1, name: 'Welcome to AwaitStep, Daniel' }),
    ).toBeVisible()
    expect(screen.getByRole('heading', { name: 'You’re not in an organization yet' })).toBeVisible()
    expect(screen.getByText(/ask a teammate to invite daniel@acme.test/)).toBeVisible()
    expect(screen.getByRole('link', { name: 'Create an organization' })).toHaveAttribute(
      'href',
      '/dashboard?new=org',
    )
    // No org to show Your account in: the avatar isn't a link.
    expect(screen.queryByRole('link', { name: 'Your account' })).toBeNull()
  })

  it('links your avatar to Your account in the org opened last', () => {
    settle()
    renderPage()
    expect(screen.getByRole('link', { name: 'Your account' })).toHaveAttribute(
      'href',
      '/acme/account/profile',
    )
  })

  it('signs out from the footer, with no Status link (D-DB-6)', async () => {
    settle()
    renderPage()
    await userEvent.click(screen.getByRole('button', { name: 'Sign out' }))
    expect(signOut).toHaveBeenCalled()
    expect(screen.queryByRole('link', { name: 'Status' })).toBeNull()
  })

  it('shows placeholders while loading and a retry when the orgs fail', async () => {
    state.viewer = { isError: false, isFetching: true, isPending: true, refetch: vi.fn() }
    state.orgs = { isError: false, isFetching: true, isPending: true, refetch: vi.fn() }
    state.invites = { isError: false, isFetching: true, isPending: true, refetch: vi.fn() }
    const { unmount } = renderPage()
    expect(screen.getByRole('status')).toHaveTextContent('Loading your organizations')
    unmount()

    const refetch = vi.fn()
    settle()
    state.orgs = { isError: true, isFetching: false, refetch }
    renderPage()
    expect(screen.getByRole('alert')).toHaveTextContent('We couldn’t load your organizations')
    await userEvent.click(screen.getByRole('button', { name: /Try again/ }))
    expect(refetch).toHaveBeenCalled()
  })

  it('opens Create an organization on ?new=org', () => {
    settle()
    renderPage('org')
    expect(screen.getByRole('dialog', { name: 'Create an organization' })).toBeVisible()
  })

  it('marks Last used from your orgs, not a stale slug this browser entered last', () => {
    // `/nope/projects` was entered last: not an org you're in.
    settle({ viewer: { ...DANIEL, lastOrgSlug: 'nope' } })
    renderPage()
    expect(screen.getByRole('link', { name: 'Acme Inc' })).toHaveTextContent('Last used')
    expect(screen.getByRole('link', { name: 'Your account' })).toHaveAttribute(
      'href',
      '/acme/account/profile',
    )
  })

  it('keeps a declined invite where it stood once the list drops it', async () => {
    const second = { ...GLOBEX_INVITE, token: 'inv-bolt', org: { name: 'Bolt', initial: 'B' } }
    settle({ invites: [GLOBEX_INVITE, second] })
    const { rerender } = renderPage()
    await userEvent.click(screen.getAllByRole('button', { name: 'Decline' })[0]!)
    state.invites = settled([second])
    rerender(<DashboardPage dialog={undefined} onCloseDialog={vi.fn()} />)
    const rows = within(screen.getByRole('region', { name: 'Waiting for you' })).getAllByRole(
      'listitem',
    )
    expect(rows[0]).toHaveTextContent('Declined. Lena Ortiz was told.')
    expect(rows[1]).toHaveTextContent('invited you to Bolt')
  })

  it('opens Create an organization empty each time', async () => {
    settle()
    const { rerender } = renderPage('org')
    await userEvent.type(screen.getByRole('textbox', { name: /Organization name/ }), 'Half')
    rerender(<DashboardPage dialog={undefined} onCloseDialog={vi.fn()} />)
    rerender(<DashboardPage dialog="org" onCloseDialog={vi.fn()} />)
    expect(screen.getByRole('textbox', { name: /Organization name/ })).toHaveValue('')
  })
})
