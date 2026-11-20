import { describe, expect, it } from 'vitest'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {
  DANIEL,
  TOM,
  asOrgRole,
  asProjectRole,
  installFakeApi,
  renderWithDashboardApi,
  type FakeApi,
} from '../../../__tests__/fake-api'
import { MembersPage } from '../members-page'
import { SharedLibraryPage } from '../shared-library-page'

const p101 = { org: 'acme', project: 'project-101' }

function render(ui: React.ReactElement, api: FakeApi = installFakeApi()) {
  renderWithDashboardApi(ui, { api })
  return api
}

/** Daniel: a member of Project 101, not one of its admins. */
function asMember(): FakeApi {
  const api = installFakeApi({ viewer: DANIEL })
  asOrgRole(api, 'acme', 'member')
  asProjectRole(api, 'acme/project-101', 'member')
  return api
}

/** What the API answers an add: the workspaces written, for "Only these workspaces". */
function scriptAdd(api: FakeApi) {
  api.on('POST /projects/:id/members', (req) => {
    const { userId, access } = req.body as {
      userId: string
      access: { scope: string; role: string; workspaceIds?: string[] }
    }
    return {
      userId,
      scope: access.scope,
      role: access.role,
      workspaces: access.workspaceIds?.map((id) => ({
        id,
        name: api.data.seed.workspaces.find((w) => w.id === id)?.name ?? id,
      })),
    }
  })
}

const rowOf = (name: string) => screen.getByRole('link', { name }).closest('tr') as HTMLElement

describe('project Workflows & functions', () => {
  it('opens each item in the workspace that shared it', async () => {
    render(<SharedLibraryPage slugs={p101} />)
    const provision = await screen.findByRole('link', { name: 'Provision account' })
    // On its Overview, as every item link opens.
    expect(provision.getAttribute('href')).toMatch(
      /^\/acme\/project-101\/it\/workflows\/[^/]+\/overview$/,
    )
    expect(screen.getByRole('link', { name: 'Lead enrichment' }).getAttribute('href')).toMatch(
      /^\/acme\/project-101\/sales\/workflows\/[^/]+\/overview$/,
    )
  })

  it('unshares an item nobody calls, and it leaves the list', async () => {
    const api = installFakeApi()
    api.on('PUT /workflows/:id/share', (req) => {
      api.data.seed.items.find((i) => i.id === req.params.id)!.sharing = null
      return { sharing: null }
    })
    render(<SharedLibraryPage slugs={p101} />, api)
    await screen.findByRole('link', { name: 'Send Slack alert' })
    await userEvent.click(
      within(rowOf('Send Slack alert')).getByRole('button', { name: 'Unshare' }),
    )
    await waitFor(() =>
      expect(screen.queryByRole('link', { name: 'Send Slack alert' })).not.toBeInTheDocument(),
    )
    expect(api.lastRequest('PUT /workflows/:id/share').body).toEqual({ shared: false })
  })

  it('leaves New project module to the project’s Library page', async () => {
    render(<SharedLibraryPage slugs={p101} />)
    await screen.findByRole('link', { name: 'Provision account' })
    expect(screen.queryByRole('button', { name: 'New project module' })).not.toBeInTheDocument()
  })
})

describe('project Members', () => {
  it('adds someone to only the workspaces picked through AddToProject', async () => {
    const api = installFakeApi()
    scriptAdd(api)
    render(<MembersPage slugs={p101} adding onCloseAdd={() => {}} />, api)
    const dialog = await screen.findByRole('dialog', { name: 'Add people to Project 101' })
    const people = within(dialog).getByRole('listbox', { name: 'People' })
    // Tom runs the project already: shown, not pickable.
    expect(await within(people).findByRole('option', { name: /Tom Becker/ })).toHaveAttribute(
      'aria-disabled',
      'true',
    )
    await userEvent.click(within(people).getByRole('option', { name: /Jonas/ }))
    expect(within(dialog).getByRole('radio', { name: /Only these workspaces/ })).toBeChecked()
    expect(within(dialog).getByRole('button', { name: 'Sales', pressed: true })).toBeVisible()
    expect(within(dialog).getByText('1 person gets Editor in Sales.')).toBeVisible()
    await userEvent.click(within(dialog).getByRole('button', { name: 'Add 1 person' }))
    expect(await within(dialog).findByRole('heading', { name: 'Added' })).toBeVisible()
    expect(api.lastRequest('POST /projects/:id/members').body).toEqual({
      userId: 'usr_jonas',
      access: { scope: 'workspaces', role: 'editor', workspaceIds: ['ws_sales'] },
    })
  })

  it('adds someone to the whole project as a Member', async () => {
    const api = installFakeApi()
    scriptAdd(api)
    render(<MembersPage slugs={p101} adding onCloseAdd={() => {}} />, api)
    const dialog = await screen.findByRole('dialog', { name: 'Add people to Project 101' })
    const people = within(dialog).getByRole('listbox', { name: 'People' })
    await userEvent.click(await within(people).findByRole('option', { name: /Jonas/ }))
    await userEvent.click(within(dialog).getByRole('radio', { name: /The whole project/ }))
    expect(within(dialog).queryByRole('group', { name: 'Workspaces' })).not.toBeInTheDocument()
    // Admin rights are a deliberate pick: the whole project starts on Member.
    expect(within(dialog).getByRole('radio', { name: 'Member' })).toBeChecked()
    expect(within(dialog).getByRole('radio', { name: 'Project admin' })).not.toBeChecked()
    expect(
      within(dialog).getByText('1 person gets Member in the whole of Project 101.'),
    ).toBeVisible()
    await userEvent.click(within(dialog).getByRole('button', { name: 'Add 1 person' }))
    expect(await within(dialog).findByRole('heading', { name: 'Added' })).toBeVisible()
    expect(api.lastRequest('POST /projects/:id/members').body).toEqual({
      userId: 'usr_jonas',
      access: { scope: 'project', role: 'member' },
    })
  })

  it('lets a project admin add people, but keeps the org’s access editor to org admins', async () => {
    // Tom is Project 101's admin but a plain member of Acme.
    const api = installFakeApi({ viewer: TOM })
    asOrgRole(api, 'acme', 'member')
    asProjectRole(api, 'acme/project-101', 'admin')
    render(<MembersPage slugs={p101} />, api)
    await screen.findByRole('table', { name: /every workspace/ })
    expect(screen.queryByRole('link', { name: 'Edit access' })).not.toBeInTheDocument()
    expect(
      within(screen.getByRole('banner', { name: 'Top bar' })).getByRole('link', {
        name: 'Add people',
      }),
    ).toHaveAttribute('href', '/acme/project-101/members?access=add')
  })

  it('never opens Add people for a project member', async () => {
    render(<MembersPage slugs={p101} adding onCloseAdd={() => {}} />, asMember())
    await screen.findByRole('table', { name: /every workspace/ })
    expect(screen.queryByRole('dialog', { name: /Add people/ })).not.toBeInTheDocument()
  })

  it('shows a project member the list without editing', async () => {
    render(<MembersPage slugs={p101} />, asMember())
    await screen.findByRole('table', { name: /every workspace/ })
    expect(screen.queryByRole('link', { name: 'Edit access' })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Add people' })).not.toBeInTheDocument()
  })
})
