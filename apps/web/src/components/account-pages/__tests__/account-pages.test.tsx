import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {
  AMA,
  PRIYA,
  dashboardDb,
  dashboardServer,
  MockApiError,
  renderWithDashboardData,
  resetDashboardData,
} from '../../../data/dashboard/__tests__/fixtures/dashboard-data'
import { ProfilePage } from '../profile-page'
import { SessionsPage } from '../sessions-page'
import { PNG_SIGNATURE } from '../../../lib/__tests__/fixtures/image-bytes'

const goTo = vi.fn()
vi.mock('../../navigation/router-shell-link', () => ({ useGoTo: () => goTo }))
const signOut = vi.hoisted(() => vi.fn())
vi.mock('../../../lib/auth-client', () => ({ handleSignOut: signOut }))
const download = vi.hoisted(() => vi.fn())
vi.mock('../../../lib/download-file', () => ({ downloadJsonFile: download }))

beforeEach(() => {
  resetDashboardData(new Date())
  goTo.mockReset()
  signOut.mockReset()
  download.mockReset()
})

const ama = () => dashboardDb().people.find((p) => p.id === AMA)!
const topBar = () => within(screen.getByRole('banner', { name: 'Top bar' }))

function renderProfile(userId = AMA, scenario?: 'loading' | 'error') {
  return renderWithDashboardData(<ProfilePage org="acme" />, { userId, scenario })
}

describe('Profile', () => {
  it('reads as AccountProfile: tabs, name, email verified, Saved', async () => {
    renderProfile()
    expect(screen.getByRole('heading', { name: 'Your account', level: 1 })).toBeVisible()
    expect(screen.getByRole('link', { name: 'Profile' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('link', { name: 'Sessions and sign-in' })).toHaveAttribute(
      'href',
      '/acme/account/sessions',
    )
    expect(await screen.findByLabelText('Full name')).toHaveValue('Ama Mensah')
    expect(screen.getByLabelText('Email')).toHaveValue('ama@acme.test')
    expect(screen.getByText('Verified')).toBeVisible()
    expect(topBar().getByRole('button', { name: 'Saved' })).toBeDisabled()
  })

  it('saves a new name from the top bar, then reads Saved', async () => {
    renderProfile()
    const input = await screen.findByLabelText('Full name')
    await userEvent.clear(input)
    // An empty name is a change that can't be saved.
    expect(topBar().getByRole('button', { name: 'Save changes' })).toBeDisabled()
    expect(screen.getByText('Your name can’t be empty')).toBeVisible()
    await userEvent.type(input, 'Ama K. Mensah')
    await userEvent.click(topBar().getByRole('button', { name: 'Save changes' }))
    expect(await topBar().findByRole('button', { name: 'Saved' })).toBeDisabled()
    expect(ama()).toMatchObject({ name: 'Ama K. Mensah', initials: 'AK' })
  })

  it('uploads a photo and shows it in place of the initials', async () => {
    const { container } = renderProfile()
    await screen.findByLabelText('Full name')
    const file = new File([PNG_SIGNATURE], 'me.png', { type: 'image/png' })
    fireEvent.change(screen.getByTestId('photo-input'), { target: { files: [file] } })
    await waitFor(() => expect(ama().image).toMatch(/^data:image\/png/))
    await waitFor(() => expect(container.querySelector('img')).toHaveAttribute('src', ama().image))
    await userEvent.click(screen.getByRole('button', { name: 'Remove photo' }))
    await waitFor(() => expect(ama().image).toBeNull())
    // Back to the initials: nothing to clear, so the × on the avatar goes.
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Remove photo' })).toBeNull())
  })

  it('turns away a photo over 2 MB without sending it', async () => {
    const spy = vi.spyOn(dashboardServer.account, 'updateProfile')
    renderProfile()
    await screen.findByLabelText('Full name')
    const big = new File([new Uint8Array(2 * 1024 * 1024 + 1)], 'big.png', { type: 'image/png' })
    fireEvent.change(screen.getByTestId('photo-input'), { target: { files: [big] } })
    expect(await screen.findByRole('alert')).toHaveTextContent('Pick an image under 2 MB')
    expect(spy).not.toHaveBeenCalled()
    spy.mockRestore()
  })

  it('says a failed save below the form, not as a problem with the name', async () => {
    const spy = vi
      .spyOn(dashboardServer.account, 'updateProfile')
      .mockRejectedValue(new MockApiError(503, 'The service didn’t answer in time.'))
    renderProfile()
    const input = await screen.findByLabelText('Full name')
    await userEvent.type(input, ' K.')
    await userEvent.click(topBar().getByRole('button', { name: 'Save changes' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('The service didn’t answer in time.')
    expect(input).not.toHaveAttribute('aria-invalid', 'true')
    spy.mockRestore()
  })

  it('reads Saved after saving a name typed with a direction override, as the server keeps it', async () => {
    renderProfile()
    const input = await screen.findByLabelText('Full name')
    await userEvent.type(input, ' K.\u202e')
    await userEvent.click(topBar().getByRole('button', { name: 'Save changes' }))
    expect(await topBar().findByRole('button', { name: 'Saved' })).toBeDisabled()
    expect(ama().name).toBe('Ama Mensah K.')
  })

  it('says Verified only for a confirmed address', async () => {
    const real = dashboardServer.account.getAccount
    const spy = vi
      .spyOn(dashboardServer.account, 'getAccount')
      .mockImplementation(async (ctx) => ({ ...(await real(ctx)), emailVerified: false }))
    renderProfile()
    expect(await screen.findByLabelText('Email')).toHaveValue('ama@acme.test')
    expect(screen.queryByText('Verified')).not.toBeInTheDocument()
    spy.mockRestore()
  })

  it('shows the email as the account, with no way to change it', async () => {
    renderProfile()
    expect(await screen.findByLabelText('Email')).toHaveValue('ama@acme.test')
    expect(screen.getByLabelText('Email')).toHaveAttribute('readonly')
    expect(screen.queryByRole('button', { name: 'Change email' })).not.toBeInTheDocument()
    expect(screen.getByText(/Google and GitHub connect to this address only/)).toBeVisible()
  })
})

describe('Organizations', () => {
  it('says Ama is Acme’s only owner, with the way to Members', async () => {
    renderProfile()
    const list = within(await screen.findByRole('list', { name: 'Organizations' }))
    const acme = within(list.getByText('Acme Inc').closest('li')!)
    expect(acme.getByText(/^Owner · \d+ projects · the only owner$/)).toBeVisible()
    expect(acme.getByRole('link', { name: 'Members' })).toHaveAttribute(
      'href',
      '/acme/settings/members',
    )
    expect(acme.queryByRole('button')).not.toBeInTheDocument()
  })

  it('leaves Bolt Labs after asking, and it goes from the list', async () => {
    renderProfile()
    await userEvent.click(await screen.findByRole('button', { name: 'Leave Bolt Labs' }))
    const dialog = within(screen.getByRole('alertdialog', { name: 'Leave Bolt Labs?' }))
    await userEvent.click(dialog.getByRole('button', { name: 'Leave organization' }))
    await waitFor(() => expect(screen.queryByText('Bolt Labs')).not.toBeInTheDocument())
    expect(dashboardDb().orgMembers.some((m) => m.orgId === 'org_bolt' && m.userId === AMA)).toBe(
      false,
    )
    expect(goTo).not.toHaveBeenCalled()
  })

  it('lands on /dashboard after leaving the org in the URL', async () => {
    renderWithDashboardData(<ProfilePage org="bolt-labs" />)
    await userEvent.click(await screen.findByRole('button', { name: 'Leave Bolt Labs' }))
    await userEvent.click(screen.getByRole('button', { name: 'Leave organization' }))
    await waitFor(() => expect(goTo).toHaveBeenCalledWith('/dashboard'))
  })
})

describe('Your data', () => {
  it('downloads the export as JSON and says Downloaded', async () => {
    renderProfile()
    await userEvent.click(await screen.findByRole('button', { name: 'Download JSON' }))
    expect(await screen.findByRole('button', { name: 'Downloaded' })).toBeVisible()
    const [name, content] = download.mock.calls[0]!
    expect(name).toMatch(/^awaitstep-account-\d{4}-\d{2}-\d{2}\.json$/)
    expect(JSON.parse(content as string).profile.email).toBe('ama@acme.test')
  })

  it('blocks Delete account while Ama is Acme’s only owner', async () => {
    renderProfile()
    const button = await screen.findByRole('button', { name: 'Delete account' })
    expect(button).toHaveAttribute('aria-disabled', 'true')
    expect(screen.getByText('You’re the only owner of Acme Inc')).toBeVisible()
    await userEvent.click(button)
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
  })

  it('deletes Priya’s account once she types her email, and lands on /dashboard', async () => {
    renderProfile(PRIYA)
    await userEvent.click(await screen.findByRole('button', { name: 'Delete account' }))
    const dialog = within(screen.getByRole('alertdialog', { name: 'Delete your account?' }))
    const confirm = dialog.getByRole('button', { name: 'Delete account' })
    expect(confirm).toBeDisabled()
    await userEvent.type(dialog.getByRole('textbox'), 'priya@acme.test')
    await userEvent.click(confirm)
    await waitFor(() => expect(goTo).toHaveBeenCalledWith('/dashboard'))
    expect(dashboardDb().orgMembers.some((m) => m.userId === PRIYA)).toBe(false)
  })
})

describe('Profile layout', () => {
  it('caps every section at the settings width, About you on its card', async () => {
    renderProfile()
    const name = await screen.findByLabelText('Full name')
    expect(name.closest('.bg-card')).toHaveClass('settings-width')
    for (const title of ['About you', 'Organizations', 'Your data']) {
      expect(screen.getByRole('heading', { name: title }).closest('section')).toHaveClass(
        'settings-width',
      )
    }
  })
})

describe('Profile states', () => {
  it('shows the skeleton while loading and the error card when it fails', async () => {
    const { unmount } = renderProfile(AMA, 'loading')
    expect(screen.getByText('Loading your account')).toBeInTheDocument()
    unmount()
    renderProfile(AMA, 'error')
    expect(await screen.findByText('We couldn’t load your account')).toBeVisible()
  })
})

function renderSessions(linkError?: string) {
  renderWithDashboardData(<SessionsPage org="acme" linkError={linkError} />)
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
    const real = dashboardServer.account.listSignInMethods
    const spy = vi
      .spyOn(dashboardServer.account, 'listSignInMethods')
      .mockImplementation(async (ctx) => ({
        ...(await real(ctx)),
        providers: { github: true, google: true, emailLink: false },
      }))
    renderSessions()
    expect(await screen.findByRole('button', { name: 'Disconnect GitHub' })).toBeDisabled()
    expect(screen.getByText(/Your only way to sign in/)).toBeVisible()
    expect(screen.getByRole('link', { name: 'Your data' })).toHaveAttribute(
      'href',
      '/acme/account/profile',
    )
    spy.mockRestore()
  })

  it('disconnects GitHub and connects it again', async () => {
    renderSessions()
    await userEvent.click(await screen.findByRole('button', { name: 'Disconnect GitHub' }))
    await userEvent.click(await screen.findByRole('button', { name: 'Connect GitHub' }))
    expect(await screen.findByRole('button', { name: 'Disconnect GitHub' })).toBeVisible()
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
    renderSessions()
    await userEvent.click(
      await screen.findByRole('button', { name: 'Sign out Firefox on Windows' }),
    )
    const dialog = within(screen.getByRole('alertdialog', { name: 'Sign out Firefox on Windows?' }))
    await userEvent.click(dialog.getByRole('button', { name: 'Sign out' }))
    await waitFor(() => expect(screen.queryByText('Firefox on Windows')).not.toBeInTheDocument())
    expect(screen.getByText('3 sessions')).toBeVisible()
  })

  it('signs out every other session, leaving this device', async () => {
    renderSessions()
    await userEvent.click(
      await screen.findByRole('button', { name: 'Sign out all other sessions' }),
    )
    const dialog = within(screen.getByRole('alertdialog', { name: 'Sign out 3 other sessions?' }))
    await userEvent.click(dialog.getByRole('button', { name: 'Sign out others' }))
    await waitFor(() => expect(screen.getByText('1 session')).toBeVisible())
    expect(
      screen.queryByRole('button', { name: 'Sign out all other sessions' }),
    ).not.toBeInTheDocument()
  })

  it('signs out for real from this device’s row', async () => {
    renderSessions()
    await userEvent.click(await screen.findByRole('button', { name: 'Sign out of this device' }))
    expect(signOut).toHaveBeenCalled()
  })
})
