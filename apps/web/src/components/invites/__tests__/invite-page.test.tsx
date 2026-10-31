import { beforeEach, describe, expect, it, vi } from 'vitest'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {
  AMA,
  DANIEL,
  dashboardDb,
  renderWithDashboardData,
  resetDashboardData,
} from '../../../data/dashboard/__tests__/fixtures/dashboard-data'
import { InvitePage, landingPath } from '../invite-page'

const goTo = vi.fn()
vi.mock('../../navigation/router-shell-link', () => ({ useGoTo: () => goTo }))
const signOut = vi.hoisted(() => vi.fn())
vi.mock('../../../lib/auth-client', () => ({ handleSignOut: signOut }))

beforeEach(() => {
  resetDashboardData(new Date())
  goTo.mockReset()
  signOut.mockReset()
})

function renderInvite(token: string, userId = DANIEL) {
  renderWithDashboardData(<InvitePage token={token} />, { userId })
}

const facts = () => screen.getAllByRole('listitem').map((item) => item.textContent)

describe('accepting an invite', () => {
  it('reads as AcceptInvite: who invited you, where, the role, who’s signed in', async () => {
    renderInvite('inv_globex_daniel')
    expect(await screen.findByRole('heading', { name: 'Join Globex' })).toBeVisible()
    expect(screen.getByText('Lena Ortiz invited you to')).toBeVisible()
    expect(facts()).toEqual([
      expect.stringContaining('WorkspaceDefaultin Globex Ops'),
      expect.stringContaining('Your roleEditorBuild, run and deploy workflows'),
      expect.stringContaining('Signed in asdaniel@acme.test'),
    ])
    // Signing out comes back to this invite after signing in again.
    await userEvent.click(screen.getByRole('button', { name: 'Not you?' }))
    expect(signOut).toHaveBeenCalledWith('/invite/inv_globex_daniel')
    expect(screen.getByText(/The invite expires on/)).toBeVisible()
  })

  it('joins Globex and opens the workspace it names', async () => {
    renderInvite('inv_globex_daniel')
    await userEvent.click(await screen.findByRole('button', { name: 'Accept and open Default' }))
    await waitFor(() => expect(goTo).toHaveBeenCalledWith('/globex/globex-ops/default/overview'))
    expect(
      dashboardDb().orgMembers.some((m) => m.orgId === 'org_globex' && m.userId === DANIEL),
    ).toBe(true)
  })

  it('declines, says the inviter was told, and Undo reopens it', async () => {
    renderInvite('inv_globex_daniel')
    await userEvent.click(await screen.findByRole('button', { name: 'Decline' }))
    expect(await screen.findByRole('heading', { name: 'Invite declined' })).toBeVisible()
    expect(screen.getByText(/We let Lena Ortiz know/)).toBeVisible()
    await userEvent.click(screen.getByRole('button', { name: 'Undo' }))
    expect(await screen.findByRole('heading', { name: 'Join Globex' })).toBeVisible()
  })
})

describe('after answering', () => {
  it('leaves for the workspace without flashing “no longer open” first', async () => {
    renderInvite('inv_globex_daniel')
    await userEvent.click(await screen.findByRole('button', { name: 'Accept and open Default' }))
    await waitFor(() => expect(goTo).toHaveBeenCalled())
    // The invite is gone on the server, but the page isn't refetched as it leaves.
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(screen.queryByText('This invite is no longer open')).not.toBeInTheDocument()
  })

  it('says why Undo failed when the invite expired meanwhile', async () => {
    renderInvite('inv_globex_daniel')
    await userEvent.click(await screen.findByRole('button', { name: 'Decline' }))
    await screen.findByRole('heading', { name: 'Invite declined' })
    dashboardDb().invitations.find((i) => i.id === 'inv_globex_daniel')!.sentAt =
      '2026-01-01T00:00:00.000Z'
    await userEvent.click(screen.getByRole('button', { name: 'Undo' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('This invite has expired')
  })
})

describe('other invite states', () => {
  it('reads as InviteWrongAccount when someone else opens it', async () => {
    renderInvite('inv_sam')
    expect(
      await screen.findByRole('heading', { name: 'This invite is for another email' }),
    ).toBeVisible()
    expect(facts()).toEqual([
      expect.stringContaining('Invite sent tosam@acme.test'),
      expect.stringContaining('Signed in asdaniel@acme.test'),
    ])
    expect(screen.getByText('Doesn’t match')).toBeVisible()
    await userEvent.click(screen.getByRole('button', { name: 'Sign in as sam@acme.test' }))
    expect(signOut).toHaveBeenCalledWith('/invite/inv_sam')
    expect(screen.getByRole('link', { name: 'Not now' })).toHaveAttribute('href', '/dashboard')
  })

  it('reads as InviteExpired, and asks for a new one once', async () => {
    renderInvite('inv_bolt_daniel')
    expect(await screen.findByRole('heading', { name: 'This invite has expired' })).toBeVisible()
    expect(facts()[0]).toContain('Sent byTomás Barros')
    // The fact's label and its pill both say Expired.
    expect(within(screen.getAllByRole('listitem')[1]!).getAllByText('Expired')).toHaveLength(2)
    await userEvent.click(screen.getByRole('button', { name: 'Ask Tomás for a new invite' }))
    expect(await screen.findByRole('status')).toHaveTextContent(
      'Sent. Tomás gets an email and an inbox notification.',
    )
    expect(screen.queryByRole('button', { name: /Ask Tomás/ })).not.toBeInTheDocument()
  })

  it('says an invite is no longer open once it’s used', async () => {
    renderInvite('nope', AMA)
    expect(
      await screen.findByRole('heading', { name: 'This invite is no longer open' }),
    ).toBeVisible()
    expect(screen.getByRole('link', { name: 'Go to your organizations' })).toHaveAttribute(
      'href',
      '/dashboard',
    )
  })

  it('shows a loading state, and a retry when it can’t load', async () => {
    renderWithDashboardData(<InvitePage token="inv_globex_daniel" />, {
      userId: DANIEL,
      scenario: 'error',
    })
    expect(await screen.findByText('We couldn’t open this invite')).toBeVisible()
  })
})

describe('landingPath', () => {
  it('opens the first workspace, else the first project, else the org’s Projects', () => {
    expect(landingPath({ org: 'globex', project: 'globex-ops', workspace: 'default' })).toBe(
      '/globex/globex-ops/default/overview',
    )
    expect(landingPath({ org: 'bolt-labs', project: 'bolt-api' })).toBe('/bolt-labs/bolt-api')
    expect(landingPath({ org: 'bolt-labs' })).toBe('/bolt-labs/projects')
  })
})
