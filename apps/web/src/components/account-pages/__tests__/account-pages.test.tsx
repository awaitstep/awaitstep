import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type * as AuthClient from '../../../lib/auth-client'
import {
  AMA,
  BOLT,
  PRIYA,
  apiError,
  authError,
  installFakeApi,
  pending,
  renderWithDashboardApi,
  type FakeApi,
  type PersonId,
} from '../../../__tests__/fake-api'
import { ProfilePage } from '../profile-page'
import { PNG_SIGNATURE } from '../../../lib/__tests__/fixtures/image-bytes'

// The Profile page on the API: `GET /account` for the page, better-auth for
// the name and deletion, `/account/photo`, leave and export for the rest.
// Sessions and sign-in are in `sessions-page.test.tsx`.

const goTo = vi.fn()
vi.mock('../../navigation/router-shell-link', () => ({ useGoTo: () => goTo }))
const signOut = vi.hoisted(() => vi.fn())
vi.mock('../../../lib/auth-client', async (importOriginal) => ({
  ...(await importOriginal<typeof AuthClient>()),
  handleSignOut: signOut,
}))
const download = vi.hoisted(() => vi.fn())
vi.mock('../../../lib/download-file', () => ({ downloadJsonFile: download }))

beforeEach(() => {
  goTo.mockReset()
  signOut.mockReset()
  download.mockReset()
})

const topBar = () => within(screen.getByRole('banner', { name: 'Top bar' }))

function renderProfile(viewer: PersonId = AMA) {
  return renderWithDashboardApi(<ProfilePage currentOrg="acme" />, { viewer }).api
}

/** Ama's account as the API answers it from now on. */
const amaAccount = (api: FakeApi) => api.data.accounts[AMA]!

/** Saving the name, as the API answers it: the next read has the new name. */
function scriptNameSave(api: FakeApi) {
  api.on('POST /auth/update-user', (req) => {
    amaAccount(api).person.name = (req.body as { name: string }).name
    return { status: true }
  })
}

/** The photo's upload and removal, as the API answers them: the next read has it, then not. */
function scriptPhoto(api: FakeApi, path: string) {
  api.on('PUT /account/photo', () => {
    amaAccount(api).person.image = path
    return { image: path }
  })
  api.on('DELETE /account/photo', () => {
    amaAccount(api).person.image = null
    return { image: null }
  })
}

describe('Profile', () => {
  it('reads as AccountProfile: tabs, name, email verified, Saved', async () => {
    renderProfile()
    expect(screen.getByRole('heading', { name: 'Your account', level: 1 })).toBeVisible()
    expect(screen.getByRole('link', { name: 'Profile' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('link', { name: 'Sessions and sign-in' })).toHaveAttribute(
      'href',
      '/account/sessions',
    )
    expect(await screen.findByLabelText('Full name')).toHaveValue('Ama Mensah')
    expect(screen.getByLabelText('Email')).toHaveValue('ama@acme.test')
    expect(screen.getByText('Verified')).toBeVisible()
    expect(topBar().getByRole('button', { name: 'Saved' })).toBeDisabled()
  })

  it('saves a new name from the top bar, then reads Saved', async () => {
    const api = renderProfile()
    scriptNameSave(api)
    const input = await screen.findByLabelText('Full name')
    await userEvent.clear(input)
    // An empty name is a change that can't be saved.
    expect(topBar().getByRole('button', { name: 'Save changes' })).toBeDisabled()
    expect(screen.getByText('Your name can’t be empty')).toBeVisible()
    await userEvent.type(input, 'Ama K. Mensah')
    await userEvent.click(topBar().getByRole('button', { name: 'Save changes' }))
    expect(await topBar().findByRole('button', { name: 'Saved' })).toBeDisabled()
    expect(api.lastRequest('POST /auth/update-user').body).toEqual({ name: 'Ama K. Mensah' })
    // The account menu draws the person from the session, so it is read again.
    expect(api.requestsTo('GET /auth/get-session')).toHaveLength(1)
  })

  it('uploads a photo and shows it in place of the initials', async () => {
    const api = renderProfile()
    scriptPhoto(api, '/api/images/ama.webp')
    await screen.findByLabelText('Full name')
    const file = new File([PNG_SIGNATURE], 'me.png', { type: 'image/png' })
    fireEvent.change(screen.getByTestId('photo-input'), { target: { files: [file] } })
    await waitFor(() =>
      expect(document.querySelector('img')).toHaveAttribute('src', '/api/images/ama.webp'),
    )
    const upload = api.lastRequest('PUT /account/photo')
    expect(upload.body).toBeInstanceOf(Blob)
    expect(upload.headers['content-type']).toMatch(/^image\//)
    await userEvent.click(screen.getByRole('button', { name: 'Remove photo' }))
    // Back to the initials: nothing to clear, so the × on the avatar goes.
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Remove photo' })).toBeNull())
    expect(api.requestsTo('DELETE /account/photo')).toHaveLength(1)
  })

  it('turns away a photo over 2 MB without sending it', async () => {
    const api = renderProfile()
    await screen.findByLabelText('Full name')
    const big = new File([new Uint8Array(2 * 1024 * 1024 + 1)], 'big.png', { type: 'image/png' })
    fireEvent.change(screen.getByTestId('photo-input'), { target: { files: [big] } })
    expect(await screen.findByRole('alert')).toHaveTextContent('Pick an image under 2 MB')
    expect(api.requestsTo('PUT /account/photo')).toHaveLength(0)
  })

  // Known gap: `useUpdateProfile` tags every refused `updateUser` with field
  // `name`, so a 503 lands under the name. Fixed in the next commit.
  it.fails('says a failed save below the form, not as a problem with the name', async () => {
    const api = renderProfile()
    api.on('POST /auth/update-user', authError(503, 'The service didn’t answer in time.'))
    const input = await screen.findByLabelText('Full name')
    await userEvent.type(input, ' K.')
    await userEvent.click(topBar().getByRole('button', { name: 'Save changes' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('The service didn’t answer in time.')
    expect(input).not.toHaveAttribute('aria-invalid', 'true')
  })

  it('reads Saved after saving a name typed with a direction override, as the server keeps it', async () => {
    const api = renderProfile()
    scriptNameSave(api)
    const input = await screen.findByLabelText('Full name')
    await userEvent.type(input, ' K.\u202e')
    await userEvent.click(topBar().getByRole('button', { name: 'Save changes' }))
    expect(await topBar().findByRole('button', { name: 'Saved' })).toBeDisabled()
    expect(api.lastRequest('POST /auth/update-user').body).toEqual({ name: 'Ama Mensah K.' })
  })

  it('says Verified only for a confirmed address', async () => {
    const api = installFakeApi()
    amaAccount(api).person.emailVerified = false
    renderWithDashboardApi(<ProfilePage currentOrg="acme" />, { api })
    expect(await screen.findByLabelText('Email')).toHaveValue('ama@acme.test')
    expect(screen.queryByText('Verified')).not.toBeInTheDocument()
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
    expect(acme.getByText(/^Owner, \d+ projects, the only owner$/)).toBeVisible()
    expect(acme.getByRole('link', { name: 'Members' })).toHaveAttribute(
      'href',
      '/acme/settings/members',
    )
    expect(acme.queryByRole('button')).not.toBeInTheDocument()
  })

  it('leaves Bolt Labs after asking, and it goes from the list', async () => {
    const api = renderProfile()
    api.on('POST /account/orgs/:orgId/leave', () => {
      amaAccount(api).orgs = amaAccount(api).orgs.filter((org) => org.id !== BOLT)
      return { ok: true }
    })
    await userEvent.click(await screen.findByRole('button', { name: 'Leave Bolt Labs' }))
    const dialog = within(screen.getByRole('alertdialog', { name: 'Leave Bolt Labs?' }))
    await userEvent.click(dialog.getByRole('button', { name: 'Leave organization' }))
    await waitFor(() => expect(screen.queryByText('Bolt Labs')).not.toBeInTheDocument())
    expect(api.requestsTo(`POST /account/orgs/${BOLT}/leave`)).toHaveLength(1)
    expect(goTo).not.toHaveBeenCalled()
  })

  it('lands on /dashboard after leaving the org in the URL', async () => {
    renderWithDashboardApi(<ProfilePage currentOrg="bolt-labs" />)
    await userEvent.click(await screen.findByRole('button', { name: 'Leave Bolt Labs' }))
    await userEvent.click(screen.getByRole('button', { name: 'Leave organization' }))
    await waitFor(() => expect(goTo).toHaveBeenCalledWith('/dashboard'))
  })
})

describe('Your data', () => {
  it('downloads the export as JSON and says Downloaded', async () => {
    const api = renderProfile()
    await userEvent.click(await screen.findByRole('button', { name: 'Download JSON' }))
    expect(await screen.findByRole('button', { name: 'Downloaded' })).toBeVisible()
    const [name, content] = download.mock.calls[0]!
    expect(name).toMatch(/^awaitstep-account-\d{4}-\d{2}-\d{2}\.json$/)
    expect(JSON.parse(content as string).profile.email).toBe('ama@acme.test')
    expect(api.requestsTo('POST /account/export')).toHaveLength(1)
  })

  it('blocks Delete account while Ama is Acme’s only owner', async () => {
    renderProfile()
    const button = await screen.findByRole('button', { name: 'Delete account' })
    expect(button).toHaveAttribute('aria-disabled', 'true')
    // The API's own wording (`deleteBlockedReason` in @awaitstep/ir).
    expect(screen.getByText("You're the only owner of Acme Inc")).toBeVisible()
    await userEvent.click(button)
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
  })

  it('deletes Priya’s account once she types her email, and lands on /dashboard', async () => {
    const api = renderProfile(PRIYA)
    await userEvent.click(await screen.findByRole('button', { name: 'Delete account' }))
    const dialog = within(screen.getByRole('alertdialog', { name: 'Delete your account?' }))
    const confirm = dialog.getByRole('button', { name: 'Delete account' })
    expect(confirm).toBeDisabled()
    await userEvent.type(dialog.getByRole('textbox'), 'priya@acme.test')
    await userEvent.click(confirm)
    await waitFor(() => expect(goTo).toHaveBeenCalledWith('/dashboard'))
    expect(api.requestsTo('POST /auth/delete-user')).toHaveLength(1)
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
  it('shows the skeleton while loading', () => {
    renderWithDashboardApi(<ProfilePage currentOrg="acme" />, {
      routes: { 'GET /account': () => pending() },
    })
    expect(screen.getByText('Loading your account')).toBeInTheDocument()
  })

  it('shows the error card when it fails', async () => {
    renderWithDashboardApi(<ProfilePage currentOrg="acme" />, {
      routes: { 'GET /account': apiError(500, 'Something went wrong') },
    })
    expect(await screen.findByText('We couldn’t load your account')).toBeVisible()
  })
})
