import { beforeEach, describe, expect, it, vi } from 'vitest'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type * as AuthClient from '../../../lib/auth-client'
import {
  AMA,
  installFakeApi,
  renderWithDashboardApi,
  type FakeApi,
} from '../../../__tests__/fake-api'
import { SessionsPage } from '../sessions-page'

// Sessions and sign-in on the API: the ways in from `GET /account`, providers
// through better-auth, the sessions from `/account/sessions`.

const goTo = vi.fn()
vi.mock('../../navigation/router-shell-link', () => ({ useGoTo: () => goTo }))
const signOut = vi.hoisted(() => vi.fn())
vi.mock('../../../lib/auth-client', async (importOriginal) => ({
  ...(await importOriginal<typeof AuthClient>()),
  handleSignOut: signOut,
}))

beforeEach(() => {
  goTo.mockReset()
  signOut.mockReset()
})

function renderSessions(linkError?: string) {
  return renderWithDashboardApi(<SessionsPage linkError={linkError} />).api
}

/** Ama's sessions as the API answers them from now on. */
function keepSessions(api: FakeApi, keep: (id: string, current: boolean) => boolean) {
  api.data.sessions[AMA] = api.data.sessions[AMA]!.filter((s) => keep(s.id, s.current))
}

describe('Sessions and sign-in', () => {
  it('reads as AccountSessions: GitHub connected, Google not, the email link always on', async () => {
    renderSessions()
    const list = within(await screen.findByRole('list', { name: 'Sign-in methods' }))
    expect(list.getByText(/^Connected \d+ \w+$/)).toBeVisible()
    expect(list.getByText('Connected')).toBeVisible()
    expect(list.getByRole('button', { name: 'Connect Google' })).toBeVisible()
    expect(list.getByText('Always on')).toBeVisible()
    expect(screen.getByRole('link', { name: 'Sessions and sign-in' })).toHaveAttribute(
      'aria-current',
      'page',
    )
  })

  it('says Google and GitHub join only the account’s own address', async () => {
    renderSessions()
    expect(
      await screen.findByText(/connect only with an account that uses ama@acme\.test/),
    ).toBeVisible()
  })

  it('says why a Connect came back refused', async () => {
    renderSessions('email_does_not_match')
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'That account uses another email. Google and GitHub connect only with an account that uses ama@acme.test.',
    )
  })

  it('keeps the last way in without email links, pointing at deleting the account', async () => {
    const api = installFakeApi()
    api.data.accounts[AMA]!.providers = { github: true, google: true, emailLink: false }
    renderWithDashboardApi(<SessionsPage />, { api })
    expect(await screen.findByRole('button', { name: 'Disconnect GitHub' })).toBeDisabled()
    expect(screen.getByText(/Your only way to sign in/)).toBeVisible()
    expect(screen.getByRole('link', { name: 'Your data' })).toHaveAttribute(
      'href',
      '/account/profile',
    )
  })

  it('disconnects GitHub, then Connect sends the browser to GitHub and back here', async () => {
    const api = renderSessions()
    api.on('POST /auth/unlink-account', () => {
      const github = api.data.accounts[AMA]!.signInMethods.find((m) => m.provider === 'github')!
      Object.assign(github, { connected: false, connectedAt: null, accountId: null })
      return { status: true }
    })
    // Without a URL to follow, so jsdom isn't asked to navigate.
    api.on('POST /auth/link-social', { url: '', redirect: false })
    await userEvent.click(await screen.findByRole('button', { name: 'Disconnect GitHub' }))
    expect(api.lastRequest('POST /auth/unlink-account').body).toEqual({
      accountId: 'acc_ama_github',
    })
    await userEvent.click(await screen.findByRole('button', { name: 'Connect GitHub' }))
    const here = `${window.location.origin}${window.location.pathname}`
    await waitFor(() =>
      expect(api.lastRequest('POST /auth/link-social').body).toEqual({
        provider: 'github',
        callbackURL: here,
        errorCallbackURL: here,
      }),
    )
  })

  it('lists four sessions, this device first', async () => {
    renderSessions()
    const list = within(await screen.findByRole('list', { name: 'Active sessions' }))
    const rows = list.getAllByRole('listitem')
    expect(rows).toHaveLength(4)
    expect(rows[0]).toHaveTextContent('Chrome on macOS')
    expect(rows[0]).toHaveTextContent('This device')
    expect(rows[0]).toHaveTextContent('Active now')
    expect(screen.getByText('4 sessions')).toBeVisible()
  })

  it('signs Firefox out after asking', async () => {
    const api = renderSessions()
    api.on('DELETE /account/sessions/:id', (req) => {
      keepSessions(api, (id) => id !== req.params.id)
      return { ok: true }
    })
    await userEvent.click(
      await screen.findByRole('button', { name: 'Sign out Firefox on Windows' }),
    )
    const dialog = within(screen.getByRole('alertdialog', { name: 'Sign out Firefox on Windows?' }))
    await userEvent.click(dialog.getByRole('button', { name: 'Sign out' }))
    await waitFor(() => expect(screen.queryByText('Firefox on Windows')).not.toBeInTheDocument())
    expect(screen.getByText('3 sessions')).toBeVisible()
    expect(api.requestsTo('DELETE /account/sessions/ses_ama_firefox')).toHaveLength(1)
  })

  it('signs out every other session, leaving this device', async () => {
    const api = renderSessions()
    api.on('DELETE /account/sessions', () => {
      keepSessions(api, (_, current) => current)
      return { count: 3 }
    })
    await userEvent.click(
      await screen.findByRole('button', { name: 'Sign out all other sessions' }),
    )
    const dialog = within(screen.getByRole('alertdialog', { name: 'Sign out 3 other sessions?' }))
    await userEvent.click(dialog.getByRole('button', { name: 'Sign out others' }))
    await waitFor(() => expect(screen.getByText('1 session')).toBeVisible())
    expect(
      screen.queryByRole('button', { name: 'Sign out all other sessions' }),
    ).not.toBeInTheDocument()
    expect(api.lastRequest('DELETE /account/sessions').query).toEqual({ scope: 'others' })
  })

  it('signs out for real from this device’s row', async () => {
    renderSessions()
    await userEvent.click(await screen.findByRole('button', { name: 'Sign out of this device' }))
    expect(signOut).toHaveBeenCalled()
  })
})
