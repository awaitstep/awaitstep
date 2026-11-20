import { useState } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {
  DANIEL,
  LENA,
  PRIYA,
  apiError,
  asWorkspaceRole,
  installFakeApi,
  renderWithDashboardApi,
  type FakeApi,
} from '../../../__tests__/fake-api'
import { WorkspaceSettingsPage, tabFrom } from '../workspace-settings-page'

const goTo = vi.fn()
vi.mock('../../navigation/router-shell-link', () => ({ useGoTo: () => goTo }))

const sales = { org: 'acme', project: 'project-101', workspace: 'sales' }
const support = { ...sales, workspace: 'support' }
const SALES_KEY = 'acme/project-101/sales'

beforeEach(() => {
  goTo.mockReset()
})

function Page({ slugs, start }: { slugs: typeof sales; start?: string }) {
  const [tab, setTab] = useState(tabFrom(start))
  return <WorkspaceSettingsPage slugs={slugs} tab={tab} onTabChange={setTab} />
}

async function renderPage(
  options: { slugs?: typeof sales; tab?: string; api?: FakeApi } = {},
): Promise<FakeApi> {
  const api = options.api ?? installFakeApi()
  renderWithDashboardApi(<Page slugs={options.slugs ?? sales} start={options.tab} />, { api })
  await screen.findByRole('heading', { name: 'Workspace settings' })
  return api
}

const topBar = () => screen.getByRole('banner', { name: 'Top bar' })

/** Sales answered at `/default`, as a project's first workspace is addressed. */
function salesAtDefault(api: FakeApi) {
  const workspace = api.data.workspaces[SALES_KEY]!
  api.data.workspaces['acme/project-101/default'] = { ...workspace, slug: 'default' }
  api.data.seed.workspaces.find((w) => w.id === 'ws_sales')!.slug = 'default'
}

/** The API's answer to a workspace PATCH: the row as saved, with the slug it now has. */
function answerUpdate(api: FakeApi, slug: string) {
  api.on('PATCH /workspaces/:id', (req) => ({
    ...api.data.workspaces[SALES_KEY]!,
    ...(req.body as object),
    slug,
  }))
}

/** Daniel, a Sales admin with no project role of his own. */
function danielAsSalesAdmin(workspaces: string[]): FakeApi {
  const api = installFakeApi({ viewer: DANIEL })
  api.data.seed.workspaceMembers.find(
    (m) => m.workspaceId === 'ws_sales' && m.userId === DANIEL,
  )!.role = 'admin'
  asWorkspaceRole(api, SALES_KEY, 'admin')
  const project = api.data.projects['acme/project-101']!
  project.workspaces = project.workspaces.filter((w) => workspaces.includes(w.slug))
  return api
}

describe('tabFrom', () => {
  it('opens the tab the URL names, else General', () => {
    expect(tabFrom('keys')).toBe('keys')
    expect(tabFrom(undefined)).toBe('general')
    expect(tabFrom('nope')).toBe('general')
  })
})

describe('workspace settings › General', () => {
  it('doesn’t count spaces around the name as a change', async () => {
    await renderPage()
    await userEvent.type(screen.getByRole('textbox', { name: /Name/ }), '  ')
    expect(within(topBar()).getByRole('button', { name: 'Save changes' })).toBeDisabled()
  })

  it('saves name and colour', async () => {
    const api = await renderPage()
    const save = within(topBar()).getByRole('button', { name: 'Save changes' })
    expect(save).toBeDisabled()
    await userEvent.click(screen.getByRole('radio', { name: 'Rose' }))
    await userEvent.click(save)
    await waitFor(() =>
      expect(api.lastRequest('PATCH /workspaces/:id').body).toEqual({ colour: 'rose' }),
    )
  })

  it('goes to the new URL when renaming the default workspace changes its slug', async () => {
    const api = installFakeApi()
    salesAtDefault(api)
    answerUpdate(api, 'revenue')
    await renderPage({ slugs: { ...sales, workspace: 'default' }, api })
    const name = screen.getByRole('textbox', { name: /Name/ })
    await userEvent.clear(name)
    await userEvent.type(name, 'Revenue')
    await userEvent.click(within(topBar()).getByRole('button', { name: 'Save changes' }))
    await waitFor(() => expect(goTo).toHaveBeenCalledWith('/acme/project-101/revenue/settings'))
  })

  it('doesn’t rename, so doesn’t re-slug, when only the colour is saved', async () => {
    const api = installFakeApi()
    salesAtDefault(api)
    answerUpdate(api, 'default')
    await renderPage({ slugs: { ...sales, workspace: 'default' }, api })
    await userEvent.click(screen.getByRole('radio', { name: 'Rose' }))
    await userEvent.click(within(topBar()).getByRole('button', { name: 'Save changes' }))
    await waitFor(() =>
      expect(api.lastRequest('PATCH /workspaces/:id').body).toEqual({ colour: 'rose' }),
    )
    expect(goTo).not.toHaveBeenCalled()
  })

  it('stays put when a rename leaves the slug as it was', async () => {
    const api = installFakeApi()
    answerUpdate(api, 'sales')
    await renderPage({ api })
    const name = screen.getByRole('textbox', { name: /Name/ })
    await userEvent.type(name, ' Team')
    await userEvent.click(within(topBar()).getByRole('button', { name: 'Save changes' }))
    await waitFor(() =>
      expect(api.lastRequest('PATCH /workspaces/:id').body).toEqual({ name: 'Sales Team' }),
    )
    expect(goTo).not.toHaveBeenCalled()
  })

  it('deletes Support after typing its name, landing on the project', async () => {
    const api = installFakeApi()
    api.data.workspaces['acme/project-101/support']!.viewerCan.delete = { allowed: true }
    api.on('DELETE /workspaces/:id', { ok: true })
    await renderPage({ slugs: support, api })
    await userEvent.click(screen.getByRole('button', { name: 'Delete Support' }))
    const dialog = screen.getByRole('alertdialog', { name: 'Delete Support?' })
    await userEvent.type(within(dialog).getByRole('textbox'), 'Support')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Delete Support' }))
    await waitFor(() => expect(goTo).toHaveBeenCalledWith('/acme/project-101'))
    expect(api.requestsTo('DELETE /workspaces/:id')).toHaveLength(1)
  })

  it('moves the picked workflows to another workspace', async () => {
    const api = installFakeApi()
    api.on('POST /workspaces/:id/move-workflows', (req) => ({
      moved: (req.body as { workflowIds: string[] }).workflowIds,
    }))
    await renderPage({ api })
    await userEvent.click(screen.getByRole('button', { name: 'Move workflows' }))
    const dialog = screen.getByRole('dialog', { name: 'Move workflows out of Sales' })
    await within(dialog).findByText('Inbound webhook triage')
    await userEvent.click(within(dialog).getByRole('combobox'))
    await userEvent.click(await screen.findByRole('option', { name: 'Support' }))
    await userEvent.click(within(dialog).getByRole('checkbox', { name: 'Inbound webhook triage' }))
    await userEvent.click(within(dialog).getByRole('checkbox', { name: 'Weekly pipeline report' }))
    expect(dialog).toHaveTextContent('2 of 6 selected')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Move 2 workflows' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(api.lastRequest('POST /workspaces/:id/move-workflows').body).toMatchObject({
      workflowIds: ['itm_triage', 'itm_report'],
    })
  })

  it('offers no workspace the admin can only view to move into', async () => {
    // Lena runs IT, and is only a Viewer in Sales and Support: nowhere she can build.
    const api = installFakeApi({ viewer: LENA })
    for (const key of [SALES_KEY, 'acme/project-101/support']) {
      asWorkspaceRole(api, key, 'viewer')
    }
    await renderPage({ slugs: { ...sales, workspace: 'it' }, api })
    await userEvent.click(screen.getByRole('button', { name: 'Move workflows' }))
    const dialog = screen.getByRole('dialog', { name: 'Move workflows out of IT' })
    expect(
      await within(dialog).findByText(/There’s no other workspace in .+ you can edit\./),
    ).toBeVisible()
    expect(within(dialog).queryByRole('combobox')).toBeNull()
  })

  it('is read-only for a Viewer', async () => {
    const api = installFakeApi({ viewer: PRIYA })
    asWorkspaceRole(api, SALES_KEY, 'viewer')
    await renderPage({ api })
    expect(within(topBar()).queryByRole('button', { name: 'Save changes' })).not.toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: /Name/ })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Move workflows' })).toHaveAttribute(
      'aria-disabled',
      'true',
    )
  })
})

describe('workspace settings › Members', () => {
  it('changes a role and removes someone after confirming', async () => {
    const api = installFakeApi()
    const priya = () =>
      api.data.seed.workspaceMembers.find((m) => m.workspaceId === 'ws_sales' && m.userId === PRIYA)
    api.on('PATCH /workspaces/:id/members/:userId', (req) => {
      priya()!.role = (req.body as { role: 'editor' }).role
      return {}
    })
    api.on('DELETE /workspaces/:id/members/:userId', () => {
      api.data.seed.workspaceMembers = api.data.seed.workspaceMembers.filter((m) => m !== priya())
      return { ok: true }
    })
    await renderPage({ tab: 'members', api })
    await userEvent.click(
      await screen.findByRole('button', { name: 'Change role or remove Priya Shah' }),
    )
    await userEvent.click(screen.getByRole('menuitem', { name: 'Make Editor' }))
    await waitFor(() =>
      expect(screen.getByRole('list', { name: 'Only in Sales' })).toHaveTextContent(
        /Priya Shah.*Editor/,
      ),
    )
    expect(api.lastRequest('PATCH /workspaces/:id/members/:userId').body).toEqual({
      role: 'editor',
    })
    await userEvent.click(screen.getByRole('button', { name: 'Change role or remove Priya Shah' }))
    await userEvent.click(screen.getByRole('menuitem', { name: 'Remove from Sales…' }))
    await userEvent.click(
      within(screen.getByRole('alertdialog', { name: 'Remove Priya Shah from Sales?' })).getByRole(
        'button',
        { name: 'Remove' },
      ),
    )
    await waitFor(() => expect(screen.queryByText('Priya Shah')).not.toBeInTheDocument())
  })

  it('adds two people as Editors through AddToWorkspace, then lists who was added', async () => {
    const api = installFakeApi()
    api.on('POST /workspaces/:id/members', (req) => {
      const { userId, role } = req.body as { userId: string; role: 'editor' }
      api.data.seed.workspaceMembers.push({ workspaceId: 'ws_sales', userId, role })
      return {}
    })
    await renderPage({ tab: 'members', api })
    await userEvent.click(await within(topBar()).findByRole('button', { name: 'Add people' }))
    const dialog = screen.getByRole('dialog', { name: 'Add people to Sales' })
    const people = await within(dialog).findByRole('listbox', { name: 'People' })
    // Daniel already opens Sales: shown, not pickable.
    expect(await within(people).findByRole('option', { name: /Daniel Kim/ })).toHaveAttribute(
      'aria-disabled',
      'true',
    )
    await userEvent.click(within(people).getByRole('option', { name: /Lena Ortiz/ }))
    // Jonas is in Acme but not Project 101: adding him here brings him in.
    const jonas = within(people).getByRole('option', { name: /Jonas/ })
    expect(jonas).toHaveTextContent('Joins the project too')
    await userEvent.click(jonas)
    expect(within(dialog).getByText('2 selected')).toBeVisible()
    await userEvent.click(within(dialog).getByRole('button', { name: 'Add 2 people' }))
    expect(await within(dialog).findByRole('heading', { name: 'Added 2 people' })).toBeVisible()
    expect(within(dialog).getByRole('list', { name: 'Who was added' })).toHaveTextContent(
      /Lena Ortiz.*Editor in Sales.*Added/,
    )
    expect(api.requestsTo('POST /workspaces/:id/members').map((r) => r.body)).toEqual([
      { userId: LENA, role: 'editor' },
      { userId: 'usr_jonas', role: 'editor' },
    ])
    await userEvent.click(within(dialog).getByRole('button', { name: 'Done' }))
    await waitFor(() =>
      expect(screen.getByRole('list', { name: 'Only in Sales' })).toHaveTextContent(
        /Lena Ortiz.*Editor/,
      ),
    )
  })

  it('adds the rest when one pick is refused, with the backend’s reason on its row', async () => {
    const api = installFakeApi()
    api.on('POST /workspaces/:id/members', (req) =>
      (req.body as { userId: string }).userId === LENA ? apiError(409, 'Already in Sales') : {},
    )
    await renderPage({ tab: 'members', api })
    await userEvent.click(await within(topBar()).findByRole('button', { name: 'Add people' }))
    const dialog = screen.getByRole('dialog', { name: 'Add people to Sales' })
    const people = await within(dialog).findByRole('listbox', { name: 'People' })
    await userEvent.click(await within(people).findByRole('option', { name: /Lena Ortiz/ }))
    await userEvent.click(within(people).getByRole('option', { name: /Jonas/ }))
    await userEvent.click(within(dialog).getByRole('button', { name: 'Add 2 people' }))
    const added = await within(dialog).findByRole('list', { name: 'Who was added' })
    expect(within(dialog).getByRole('heading', { name: 'Added' })).toBeVisible()
    expect(added).toHaveTextContent(/Lena Ortiz.*Already in Sales.*Not added/)
    expect(added).toHaveTextContent(/Jonas.*Editor in Sales.*Added/)
  })

  it('invites a new address into Sales from the picker, listed as Pending', async () => {
    const api = installFakeApi()
    api.on('POST /workspaces/:id/invitations', (req) => ({
      data: (req.body as { emails: string[] }).emails.map((email) => ({
        email,
        id: 'inv_sam',
        expiresAt: new Date(api.now.getTime() + 7 * 86_400_000).toISOString(),
      })),
    }))
    await renderPage({ tab: 'members', api })
    await userEvent.click(await within(topBar()).findByRole('button', { name: 'Add people' }))
    const dialog = screen.getByRole('dialog', { name: 'Add people to Sales' })
    const search = within(dialog).getByRole('searchbox', {
      name: 'Search Project 101 and Acme Inc, or type an email',
    })
    await userEvent.type(search, 'sam@newco.test')
    await userEvent.click(
      await within(dialog).findByRole('button', { name: /Invite sam@newco\.test/ }),
    )
    expect(within(dialog).getByRole('button', { name: 'Remove sam@newco.test' })).toBeVisible()
    await userEvent.click(within(dialog).getByRole('button', { name: 'Send invite' }))
    expect(await within(dialog).findByRole('heading', { name: 'Invite sent' })).toBeVisible()
    expect(within(dialog).getByRole('list', { name: 'Who was added' })).toHaveTextContent(
      /sam@newco\.test.*Pending/,
    )
    expect(api.lastRequest('POST /workspaces/:id/invitations').body).toEqual({
      emails: ['sam@newco.test'],
      role: 'editor',
    })
  })

  it('lands on the org home after removing your only way into the project', async () => {
    const api = danielAsSalesAdmin(['sales'])
    api.on('DELETE /workspaces/:id/members/:userId', { ok: true })
    await renderPage({ tab: 'members', api })
    await userEvent.click(
      await screen.findByRole('button', { name: 'Change role or remove Daniel Kim' }),
    )
    await userEvent.click(screen.getByRole('menuitem', { name: 'Remove from Sales…' }))
    const dialog = screen.getByRole('alertdialog')
    expect(dialog).toHaveTextContent('You lose access to Sales right away.')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Remove' }))
    await waitFor(() => expect(goTo).toHaveBeenCalledWith('/acme/projects'))
  })

  it('lands on the project when you can still open another workspace in it', async () => {
    const api = danielAsSalesAdmin(['sales', 'it'])
    api.on('DELETE /workspaces/:id/members/:userId', { ok: true })
    await renderPage({ tab: 'members', api })
    await userEvent.click(
      await screen.findByRole('button', { name: 'Change role or remove Daniel Kim' }),
    )
    await userEvent.click(screen.getByRole('menuitem', { name: 'Remove from Sales…' }))
    await userEvent.click(
      within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Remove' }),
    )
    await waitFor(() => expect(goTo).toHaveBeenCalledWith('/acme/project-101'))
  })

  it('clears a refused role change once you move on', async () => {
    const api = installFakeApi()
    api.on(
      'PATCH /workspaces/:id/members/:userId',
      apiError(409, 'They already have editor access through Project 101'),
    )
    await renderPage({ tab: 'members', api })
    await userEvent.click(
      await screen.findByRole('button', { name: 'Change role or remove Priya Shah' }),
    )
    await userEvent.click(screen.getByRole('menuitem', { name: 'Make Editor' }))
    expect(await screen.findByText(/already have editor access/)).toBeVisible()
    await userEvent.click(within(topBar()).getByRole('button', { name: 'Add people' }))
    expect(screen.queryByText(/already have editor access/)).not.toBeInTheDocument()
  })

  it('shows a Viewer the lists without actions', async () => {
    const api = installFakeApi({ viewer: PRIYA })
    asWorkspaceRole(api, SALES_KEY, 'viewer')
    await renderPage({ tab: 'members', api })
    await screen.findByRole('list', { name: 'Only in Sales' })
    expect(screen.queryByRole('button', { name: /Change role/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Add people' })).not.toBeInTheDocument()
  })
})

describe('workspace settings › API keys', () => {
  it('revokes a workspace key after the warning', async () => {
    const api = installFakeApi()
    api.on('DELETE /api-keys/:id', (req) => {
      api.data.seed.keys = api.data.seed.keys.filter((k) => k.id !== req.params.id)
      return {}
    })
    await renderPage({ tab: 'keys', api })
    const own = await screen.findByRole('table', { name: 'Keys for Sales only' })
    await userEvent.click(within(own).getByRole('button', { name: 'Revoke' }))
    const dialog = screen.getByRole('alertdialog', { name: 'Revoke CRM webhook?' })
    expect(dialog).toHaveTextContent('stops working in Sales immediately')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Revoke key' }))
    await waitFor(() => expect(screen.queryByText('CRM webhook')).not.toBeInTheDocument())
    expect(api.lastRequest('DELETE /api-keys/:id').query).toMatchObject({ workspace: 'sales' })
  })
})
