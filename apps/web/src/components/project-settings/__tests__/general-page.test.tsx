import { beforeEach, describe, expect, it, vi } from 'vitest'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {
  DANIEL,
  apiError,
  asProjectRole,
  installFakeApi,
  renderWithDashboardApi,
  type FakeApi,
} from '../../../__tests__/fake-api'
import type * as LockHooks from '../../../data/dashboard/locks'
import { GeneralPage } from '../general-page'

const goTo = vi.fn()
vi.mock('../../navigation/router-shell-link', () => ({ useGoTo: () => goTo }))

// Stands in for the lock call when a test needs it refused or kept waiting.
const lockCall: { send: ((on: boolean) => Promise<void>) | null } = { send: null }
vi.mock('../../../data/dashboard/locks', async (importOriginal) => {
  const real = await importOriginal<typeof LockHooks>()
  const { useMutation } = await import('@tanstack/react-query')
  return {
    ...real,
    useSetLock: (target: Parameters<typeof real.useSetLock>[0]) => {
      const stand = useMutation({ mutationFn: (on: boolean) => lockCall.send!(on) })
      const actual = real.useSetLock(target)
      return lockCall.send ? stand : actual
    },
  }
})

const p101 = { org: 'acme', project: 'project-101' }

beforeEach(() => {
  goTo.mockReset()
  lockCall.send = null
})

const P101_KEY = 'acme/project-101'

/** Ama, Acme's owner, with the capabilities the API's rules give her on Project 101. */
function asOwner(options: { locked?: boolean } = {}): FakeApi {
  const api = installFakeApi()
  if (options.locked === false) api.data.projects[P101_KEY]!.lock = null
  asProjectRole(api, P101_KEY, 'admin', 'owner')
  return api
}

/** The API's PATCH answer: the row as saved (a reserved or taken URL refused on its field). */
function scriptSave(api: FakeApi) {
  api.on('PATCH /projects/:id', (req) => {
    const body = req.body as { name?: string; slug?: string }
    if (body.slug === 'settings') {
      return apiError(400, 'That URL is used by a dashboard page', { field: 'slug' })
    }
    if (body.slug === 'marketing-site') {
      return apiError(409, 'Another project already uses that URL', { field: 'slug' })
    }
    if (body.name !== undefined && !body.name.trim()) {
      return apiError(400, 'A project needs a name', { field: 'name' })
    }
    const project = api.data.projects[P101_KEY]!
    return { ...project, ...body }
  })
}

const topBar = () => screen.getByRole('banner', { name: 'Top bar' })
const field = (name: RegExp) => screen.getByRole('textbox', { name })

async function renderPage(api: FakeApi = asOwner()) {
  scriptSave(api)
  renderWithDashboardApi(<GeneralPage slugs={p101} />, { api })
  await screen.findByRole('heading', { name: 'General' })
  return api
}

describe('project General', () => {
  it('doesn’t count spaces around a value as a change', async () => {
    await renderPage()
    await userEvent.type(field(/Project name/), '  ')
    expect(within(topBar()).getByRole('button', { name: 'Save changes' })).toBeDisabled()
  })

  it('saves a renamed project once something changed', async () => {
    const api = await renderPage()
    const save = within(topBar()).getByRole('button', { name: 'Save changes' })
    expect(save).toBeDisabled()
    await userEvent.clear(field(/Project name/))
    await userEvent.type(field(/Project name/), 'Project 102')
    expect(save).toBeEnabled()
    await userEvent.click(save)
    await waitFor(() =>
      expect(api.lastRequest('PATCH /projects/:id').body).toMatchObject({ name: 'Project 102' }),
    )
    expect(goTo).not.toHaveBeenCalled()
  })

  it('moves to the new address when the URL changes, and refuses a reserved one', async () => {
    await renderPage()
    await userEvent.clear(field(/URL/))
    await userEvent.type(field(/URL/), 'settings')
    await userEvent.click(within(topBar()).getByRole('button', { name: 'Save changes' }))
    expect(await screen.findByText(/is used by a dashboard page/)).toBeVisible()

    await userEvent.clear(field(/URL/))
    await userEvent.type(field(/URL/), 'p-101')
    await userEvent.click(within(topBar()).getByRole('button', { name: 'Save changes' }))
    await waitFor(() => expect(goTo).toHaveBeenCalledWith('/acme/p-101/settings'))
  })

  it('blocks Delete while the lock is on, and deletes after typing the name once it’s off', async () => {
    const api = asOwner()
    // Turning the lock off: the scope's next read has no lock, and Delete opens up.
    api.on('PUT /projects/:id/lock', () => {
      api.data.projects[P101_KEY]!.lock = null
      asProjectRole(api, P101_KEY, 'admin', 'owner')
      return { lock: null }
    })
    api.on('DELETE /projects/:id', { ok: true })
    await renderPage(api)
    expect(screen.getByText(/Set by Ama Mensah/)).toBeVisible()
    const remove = screen.getByRole('button', { name: 'Delete project' })
    expect(remove).toHaveAttribute('aria-disabled', 'true')
    expect(remove).toHaveAccessibleDescription(/Turn off the deletion lock first/)

    await userEvent.click(screen.getByRole('switch', { name: /Deletion lock/ }))
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Delete project' })).not.toHaveAttribute(
        'aria-disabled',
      ),
    )
    await userEvent.click(screen.getByRole('button', { name: 'Delete project' }))
    const dialog = screen.getByRole('alertdialog', { name: 'Delete Project 101?' })
    expect(dialog).toHaveTextContent('This removes Sales, IT and Support')
    const confirm = within(dialog).getByRole('button', { name: 'Delete project' })
    expect(confirm).toBeDisabled()
    await userEvent.type(within(dialog).getByRole('textbox'), 'Project 101')
    await userEvent.click(confirm)
    await waitFor(() => expect(goTo).toHaveBeenCalledWith('/acme/projects'))
    expect(api.requestsTo('DELETE /projects/:id')).toHaveLength(1)
  })

  it('moves the project to an org the viewer administers', async () => {
    const api = asOwner({ locked: false })
    api.on('POST /projects/:id/move', { ok: true })
    await renderPage(api)
    await userEvent.click(screen.getByRole('button', { name: 'Move project' }))
    const dialog = screen.getByRole('dialog', { name: 'Move Project 101' })
    await within(dialog).findByText('Bolt Labs')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Move project' }))
    await waitFor(() => expect(goTo).toHaveBeenCalledWith('/bolt-labs/project-101/settings'))
  })

  it('clears a refused move when another org is picked', async () => {
    const api = asOwner({ locked: false })
    const listing = api.data.orgListings.usr_ama!
    listing.push({ ...listing[1]!, id: 'org_globex', slug: 'globex', name: 'Globex' })
    // Ama loses admin of Bolt Labs after the dialog listed it.
    api.on('POST /projects/:id/move', (req) =>
      (req.body as { organizationId: string }).organizationId === 'org_bolt'
        ? apiError(403, 'Only owners and admins of Bolt Labs can move a project into it')
        : { ok: true },
    )
    await renderPage(api)
    await userEvent.click(screen.getByRole('button', { name: 'Move project' }))
    const dialog = screen.getByRole('dialog', { name: 'Move Project 101' })
    const select = await within(dialog).findByRole('combobox')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Move project' }))
    expect(await within(dialog).findByText(/Only owners and admins of Bolt Labs/)).toBeVisible()

    await userEvent.click(select)
    await userEvent.click(await screen.findByRole('option', { name: 'Globex' }))
    expect(
      within(dialog).queryByText(/Only owners and admins of Bolt Labs/),
    ).not.toBeInTheDocument()
  })

  it('offers New organization when there is nowhere to move to', async () => {
    const api = asOwner({ locked: false })
    api.data.orgListings.usr_ama![1]!.role = 'member'
    await renderPage(api)
    await userEvent.click(screen.getByRole('button', { name: 'Move project' }))
    const dialog = screen.getByRole('dialog', { name: 'Move Project 101' })
    expect(await within(dialog).findByRole('link', { name: 'New organization' })).toHaveAttribute(
      'href',
      '/dashboard?new=org',
    )
  })

  it('says why a lock change was refused, where the lock is described', async () => {
    lockCall.send = () => Promise.reject(new Error('Something changed meanwhile'))
    await renderPage()
    await userEvent.click(screen.getByRole('switch', { name: /Deletion lock/ }))
    expect(await screen.findByText('Something changed meanwhile')).toBeVisible()
    // The lock stays as it was.
    expect(screen.getByRole('button', { name: 'Delete project' })).toHaveAttribute(
      'aria-disabled',
      'true',
    )
  })

  it('holds the switch while a lock change is on its way', async () => {
    lockCall.send = () => new Promise<never>(() => {})
    await renderPage()
    await userEvent.click(screen.getByRole('switch', { name: /Deletion lock/ }))
    await waitFor(() =>
      expect(screen.getByRole('switch', { name: /Deletion lock/ })).toHaveAccessibleDescription(
        /Saving…/,
      ),
    )
  })

  it('puts each save error under the field it names', async () => {
    await renderPage()
    await userEvent.clear(field(/URL/))
    await userEvent.type(field(/URL/), 'marketing-site')
    await userEvent.click(within(topBar()).getByRole('button', { name: 'Save changes' }))
    await waitFor(() => expect(field(/URL/)).toHaveAccessibleDescription(/already uses that URL/))
    expect(field(/Project name/)).not.toHaveAccessibleDescription(/URL/)

    await userEvent.clear(field(/URL/))
    await userEvent.type(field(/URL/), 'project-101')
    await userEvent.clear(field(/Project name/))
    await userEvent.type(field(/Project name/), ' ')
    await userEvent.click(within(topBar()).getByRole('button', { name: 'Save changes' }))
    await waitFor(() =>
      expect(field(/Project name/)).toHaveAccessibleDescription('A project needs a name'),
    )
  })

  it('blocks Move while the deletion lock is on', async () => {
    await renderPage()
    expect(screen.getByRole('button', { name: 'Move project' })).toHaveAccessibleDescription(
      'Turn off the deletion lock first',
    )
  })

  it('is read-only for a project member, with the reasons', async () => {
    const api = installFakeApi({ viewer: DANIEL })
    asProjectRole(api, P101_KEY, 'member')
    await renderPage(api)
    expect(within(topBar()).queryByRole('button', { name: 'Save changes' })).not.toBeInTheDocument()
    expect(field(/Project name/)).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Move project' })).toHaveAttribute(
      'aria-disabled',
      'true',
    )
    expect(screen.getByRole('button', { name: 'Delete project' })).toHaveAccessibleDescription(
      /project admins/i,
    )
  })
})
