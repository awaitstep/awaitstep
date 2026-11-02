import { useState } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {
  PRIYA,
  dashboardDb,
  renderWithDashboardData,
  resetDashboardData,
} from '../../../data/dashboard/__tests__/fixtures/dashboard-data'
import { WorkspaceSettingsPage, tabFrom } from '../workspace-settings-page'

const goTo = vi.fn()
vi.mock('../../navigation/router-shell-link', () => ({ useGoTo: () => goTo }))

const sales = { org: 'acme', project: 'project-101', workspace: 'sales' }
const support = { ...sales, workspace: 'support' }

beforeEach(() => {
  resetDashboardData(new Date())
  goTo.mockReset()
})

function Page({ slugs, start }: { slugs: typeof sales; start?: string }) {
  const [tab, setTab] = useState(tabFrom(start))
  return <WorkspaceSettingsPage slugs={slugs} tab={tab} onTabChange={setTab} />
}

async function renderPage(options: { slugs?: typeof sales; tab?: string; userId?: string } = {}) {
  renderWithDashboardData(<Page slugs={options.slugs ?? sales} start={options.tab} />, {
    userId: options.userId,
  })
  await screen.findByRole('heading', { name: 'Workspace settings' })
}

const topBar = () => screen.getByRole('banner', { name: 'Top bar' })
const unlockProject = () => {
  dashboardDb().projects.find((p) => p.id === 'prj_101')!.lock = null
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

  it('reads as Access: details, the project’s lock, and Delete blocked by it', async () => {
    await renderPage()
    expect(screen.getByRole('textbox', { name: /Name/ })).toHaveValue('Sales')
    expect(screen.getByRole('radio', { name: 'Green' })).toBeChecked()
    expect(screen.getByText('From Project 101')).toBeVisible()
    expect(screen.getByRole('link', { name: 'Manage in project' })).toHaveAttribute(
      'href',
      '/acme/project-101/settings',
    )
    expect(screen.getByRole('button', { name: 'Delete Sales' })).toHaveAccessibleDescription(
      'Locked by Project 101',
    )
    const tabs = screen.getByRole('tablist')
    await waitFor(() =>
      expect(within(tabs).getByRole('tab', { name: /Members/ })).toHaveTextContent('4'),
    )
  })

  it('saves name and colour', async () => {
    await renderPage()
    const save = within(topBar()).getByRole('button', { name: 'Save changes' })
    expect(save).toBeDisabled()
    await userEvent.click(screen.getByRole('radio', { name: 'Rose' }))
    await userEvent.click(save)
    await waitFor(() =>
      expect(dashboardDb().workspaces.find((w) => w.id === 'ws_sales')!.colour).toBe('rose'),
    )
  })

  it('goes to the new URL when renaming the default workspace changes its slug', async () => {
    dashboardDb().workspaces.find((w) => w.id === 'ws_sales')!.slug = 'default'
    await renderPage({ slugs: { ...sales, workspace: 'default' } })
    const name = screen.getByRole('textbox', { name: /Name/ })
    await userEvent.clear(name)
    await userEvent.type(name, 'Revenue')
    await userEvent.click(within(topBar()).getByRole('button', { name: 'Save changes' }))
    await waitFor(() => expect(goTo).toHaveBeenCalledWith('/acme/project-101/revenue/settings'))
  })

  it('doesn’t rename, so doesn’t re-slug, when only the colour is saved', async () => {
    dashboardDb().workspaces.find((w) => w.id === 'ws_sales')!.slug = 'default'
    await renderPage({ slugs: { ...sales, workspace: 'default' } })
    await userEvent.click(screen.getByRole('radio', { name: 'Rose' }))
    await userEvent.click(within(topBar()).getByRole('button', { name: 'Save changes' }))
    await waitFor(() =>
      expect(dashboardDb().workspaces.find((w) => w.id === 'ws_sales')!.colour).toBe('rose'),
    )
    expect(dashboardDb().workspaces.find((w) => w.id === 'ws_sales')!.slug).toBe('default')
    expect(goTo).not.toHaveBeenCalled()
  })

  it('stays put when a rename leaves the slug as it was', async () => {
    await renderPage()
    const name = screen.getByRole('textbox', { name: /Name/ })
    await userEvent.type(name, ' Team')
    await userEvent.click(within(topBar()).getByRole('button', { name: 'Save changes' }))
    await waitFor(() =>
      expect(dashboardDb().workspaces.find((w) => w.id === 'ws_sales')!.name).toBe('Sales Team'),
    )
    expect(goTo).not.toHaveBeenCalled()
  })

  it('deletes Support after typing its name, landing on the project', async () => {
    unlockProject()
    await renderPage({ slugs: support })
    await userEvent.click(screen.getByRole('button', { name: 'Delete Support' }))
    const dialog = screen.getByRole('alertdialog', { name: 'Delete Support?' })
    await userEvent.type(within(dialog).getByRole('textbox'), 'Support')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Delete Support' }))
    await waitFor(() => expect(goTo).toHaveBeenCalledWith('/acme/project-101'))
    expect(dashboardDb().workspaces.some((w) => w.id === 'ws_support')).toBe(false)
  })

  it('keeps Sales undeletable after unlocking, while IT calls its shared workflow', async () => {
    unlockProject()
    await renderPage()
    expect(screen.getByRole('button', { name: 'Delete Sales' })).toHaveAttribute(
      'aria-disabled',
      'true',
    )
  })

  it('moves the picked workflows to another workspace', async () => {
    await renderPage()
    await userEvent.click(screen.getByRole('button', { name: 'Move workflows' }))
    const dialog = screen.getByRole('dialog', { name: 'Move workflows out of Sales' })
    await within(dialog).findByText('Inbound webhook triage')
    expect(
      within(dialog).getByRole('checkbox', { name: 'Lead enrichment' }),
    ).toHaveAccessibleDescription(/shared, called by IT/)
    await userEvent.click(within(dialog).getByRole('combobox'))
    await userEvent.click(await screen.findByRole('option', { name: 'Support' }))
    await userEvent.click(within(dialog).getByRole('checkbox', { name: 'Inbound webhook triage' }))
    await userEvent.click(within(dialog).getByRole('checkbox', { name: 'Weekly pipeline report' }))
    expect(dialog).toHaveTextContent('2 of 6 selected')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Move 2 workflows' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    const moved = dashboardDb().items.filter((i) =>
      ['Inbound webhook triage', 'Weekly pipeline report'].includes(i.name),
    )
    expect(moved.every((i) => i.workspaceId === 'ws_support')).toBe(true)
  })

  it('is read-only for a Viewer', async () => {
    await renderPage({ userId: PRIYA })
    expect(within(topBar()).queryByRole('button', { name: 'Save changes' })).not.toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: /Name/ })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Move workflows' })).toHaveAttribute(
      'aria-disabled',
      'true',
    )
  })
})

describe('workspace settings › Members', () => {
  it('splits own members from the project’s, with roles and last active', async () => {
    await renderPage({ tab: 'members' })
    const own = await screen.findByRole('list', { name: 'Only in Sales' })
    const rows = within(own).getAllByRole('listitem')
    expect(rows.map((r) => r.textContent)).toEqual([
      expect.stringMatching(/Daniel Kim.*Editor.*Active/),
      expect.stringMatching(/Priya Shah.*Viewer.*Active/),
    ])
    const inherited = screen.getByRole('list', { name: 'From Project 101' })
    const [ama, tom] = within(inherited).getAllByRole('listitem')
    // Ama's access comes from the org, Tom's from the project.
    expect(ama).toHaveTextContent(/Ama Mensah \(you\).*Owner · whole org/)
    expect(tom).toHaveTextContent(/Tom Becker.*Project admin/)
    expect(within(ama!).getByText('AM', { exact: true })).toBeInTheDocument()
    expect(within(inherited).queryByRole('button', { name: /Change role/ })).not.toBeInTheDocument()
  })

  it('changes a role and removes someone after confirming', async () => {
    await renderPage({ tab: 'members' })
    await userEvent.click(
      await screen.findByRole('button', { name: 'Change role or remove Priya Shah' }),
    )
    await userEvent.click(screen.getByRole('menuitem', { name: 'Make Editor' }))
    await waitFor(() =>
      expect(screen.getByRole('list', { name: 'Only in Sales' })).toHaveTextContent(
        /Priya Shah.*Editor/,
      ),
    )
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
    await renderPage({ tab: 'members' })
    await userEvent.click(within(topBar()).getByRole('button', { name: 'Add people' }))
    const dialog = screen.getByRole('dialog', { name: 'Add people to Sales' })
    const people = await within(dialog).findByRole('listbox', { name: 'People' })
    // Daniel already opens Sales: shown, not pickable.
    expect(await within(people).findByRole('option', { name: /Daniel Kim/ })).toHaveAttribute(
      'aria-disabled',
      'true',
    )
    await userEvent.click(within(people).getByRole('option', { name: /Lena Ortiz/ }))
    expect(within(people).getByRole('option', { name: /Tom Becker/ })).toHaveAttribute(
      'aria-disabled',
      'true',
    )
    // Jonas is in Acme but not Project 101: adding him here brings him in.
    const jonas = within(people).getByRole('option', { name: /Jonas/ })
    expect(jonas).toHaveTextContent('Joins the project too')
    await userEvent.click(jonas)
    expect(within(dialog).getByText('2 selected')).toBeVisible()
    expect(within(dialog).getByText(/2 people get Editor in Sales\./)).toBeVisible()
    await userEvent.click(within(dialog).getByRole('button', { name: 'Add 2 people' }))
    expect(await within(dialog).findByRole('heading', { name: 'Added 2 people' })).toBeVisible()
    const added = within(dialog).getByRole('list', { name: 'Who was added' })
    expect(added).toHaveTextContent(/Lena Ortiz.*Editor in Sales.*Added/)
    await userEvent.click(within(dialog).getByRole('button', { name: 'Done' }))
    await waitFor(() =>
      expect(screen.getByRole('list', { name: 'Only in Sales' })).toHaveTextContent(
        /Lena Ortiz.*Editor/,
      ),
    )
  })

  it('adds the rest when one pick is refused, with the backend’s reason on its row', async () => {
    await renderPage({ tab: 'members' })
    await userEvent.click(within(topBar()).getByRole('button', { name: 'Add people' }))
    const dialog = screen.getByRole('dialog', { name: 'Add people to Sales' })
    const people = await within(dialog).findByRole('listbox', { name: 'People' })
    await userEvent.click(await within(people).findByRole('option', { name: /Lena Ortiz/ }))
    await userEvent.click(within(people).getByRole('option', { name: /Jonas/ }))
    // Lena is given Sales elsewhere while the dialog is open.
    dashboardDb().workspaceMembers.push({
      workspaceId: 'ws_sales',
      userId: 'usr_lena',
      role: 'viewer',
    })
    await userEvent.click(within(dialog).getByRole('button', { name: 'Add 2 people' }))
    const added = await within(dialog).findByRole('list', { name: 'Who was added' })
    expect(within(dialog).getByRole('heading', { name: 'Added' })).toBeVisible()
    expect(added).toHaveTextContent(/Lena Ortiz.*Already in Sales.*Not added/)
    expect(added).toHaveTextContent(/Jonas.*Editor in Sales.*Added/)
  })

  it('invites a new address into Sales from the picker, listed as Pending', async () => {
    await renderPage({ tab: 'members' })
    await userEvent.click(within(topBar()).getByRole('button', { name: 'Add people' }))
    const dialog = screen.getByRole('dialog', { name: 'Add people to Sales' })
    const search = within(dialog).getByRole('searchbox', {
      name: 'Search Project 101 and Acme Inc, or type an email',
    })
    await userEvent.type(search, 'sam@newco.test')
    await userEvent.click(
      await within(dialog).findByRole('button', { name: /Invite sam@newco\.test/ }),
    )
    expect(within(dialog).getByRole('button', { name: 'Remove sam@newco.test' })).toBeVisible()
    expect(within(dialog).getByText(/sam@newco\.test is new to Acme Inc/)).toBeVisible()
    await userEvent.click(within(dialog).getByRole('button', { name: 'Send invite' }))
    expect(await within(dialog).findByRole('heading', { name: 'Invite sent' })).toBeVisible()
    expect(within(dialog).getByRole('list', { name: 'Who was added' })).toHaveTextContent(
      /sam@newco\.test.*Invite sent · expires in 7 days.*Pending/,
    )
    const invite = dashboardDb().invitations.find((i) => i.email === 'sam@newco.test')!
    expect(invite.role).toBe('member')
    expect(invite.places).toEqual([
      { projectId: 'prj_101', workspaceId: 'ws_sales', role: 'editor' },
    ])
  })

  it('offers a project member raised to Admin only Remove, saying what they keep', async () => {
    dashboardDb().projectMembers.push({ projectId: 'prj_101', userId: 'usr_lena', role: 'member' })
    dashboardDb().workspaceMembers.push({
      workspaceId: 'ws_sales',
      userId: 'usr_lena',
      role: 'admin',
    })
    await renderPage({ tab: 'members' })
    expect(await screen.findByRole('list', { name: 'Only in Sales' })).toHaveTextContent(
      /Lena Ortiz.*Admin.*Project member in every workspace/,
    )
    await userEvent.click(screen.getByRole('button', { name: 'Change role or remove Lena Ortiz' }))
    expect(screen.getByRole('menuitem', { name: 'Make Editor' })).toHaveAttribute(
      'aria-disabled',
      'true',
    )
    expect(screen.getByRole('menuitem', { name: 'Make Viewer' })).toHaveAttribute(
      'aria-disabled',
      'true',
    )
    await userEvent.click(screen.getByRole('menuitem', { name: 'Remove from Sales…' }))
    expect(screen.getByRole('alertdialog')).toHaveTextContent(
      'They keep Project member access through Project 101.',
    )
  })

  it('lands on the org home after removing your only way into the project', async () => {
    // Daniel is a workspace Admin of Sales and nothing more in Project 101.
    dashboardDb().workspaceMembers.find(
      (m) => m.workspaceId === 'ws_sales' && m.userId === 'usr_daniel',
    )!.role = 'admin'
    await renderPage({ tab: 'members', userId: 'usr_daniel' })
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
    const db = dashboardDb()
    db.workspaceMembers.find(
      (m) => m.workspaceId === 'ws_sales' && m.userId === 'usr_daniel',
    )!.role = 'admin'
    db.workspaceMembers.push({ workspaceId: 'ws_it', userId: 'usr_daniel', role: 'viewer' })
    await renderPage({ tab: 'members', userId: 'usr_daniel' })
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
    await renderPage({ tab: 'members' })
    await userEvent.click(
      await screen.findByRole('button', { name: 'Change role or remove Priya Shah' }),
    )
    // The menu was drawn before Priya joined the project, which already makes her an Editor.
    dashboardDb().projectMembers.push({ projectId: 'prj_101', userId: 'usr_priya', role: 'member' })
    await userEvent.click(screen.getByRole('menuitem', { name: 'Make Editor' }))
    expect(await screen.findByText(/already have editor access/)).toBeVisible()
    await userEvent.click(within(topBar()).getByRole('button', { name: 'Add people' }))
    expect(screen.queryByText(/already have editor access/)).not.toBeInTheDocument()
  })

  it('shows a Viewer the lists without actions', async () => {
    await renderPage({ tab: 'members', userId: PRIYA })
    await screen.findByRole('list', { name: 'Only in Sales' })
    expect(screen.queryByRole('button', { name: /Change role/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Add people' })).not.toBeInTheDocument()
  })
})

describe('workspace settings › API keys', () => {
  it('lists own keys with Revoke and project keys as inherited', async () => {
    await renderPage({ tab: 'keys' })
    const own = await screen.findByRole('table', { name: 'Keys for Sales only' })
    expect(own).toHaveTextContent('CRM webhook')
    const inherited = screen.getByRole('table', { name: 'Inherited from the project' })
    expect(inherited).toHaveTextContent('CI deploys')
    expect(within(inherited).getAllByText('Inherited').length).toBeGreaterThan(0)
    expect(within(inherited).queryByRole('button', { name: 'Revoke' })).not.toBeInTheDocument()
    expect(within(topBar()).getByRole('link', { name: 'New workspace key' })).toHaveAttribute(
      'href',
      '/acme/project-101/sales/settings?tab=keys&new=key',
    )
  })

  it('revokes a workspace key after the warning', async () => {
    await renderPage({ tab: 'keys' })
    const own = await screen.findByRole('table', { name: 'Keys for Sales only' })
    await userEvent.click(within(own).getByRole('button', { name: 'Revoke' }))
    const dialog = screen.getByRole('alertdialog', { name: 'Revoke CRM webhook?' })
    expect(dialog).toHaveTextContent('stops working in Sales immediately')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Revoke key' }))
    await waitFor(() => expect(screen.queryByText('CRM webhook')).not.toBeInTheDocument())
  })
})

describe('workspace settings › Variables', () => {
  it('resolves for the workspace, closest level first', async () => {
    await renderPage({ tab: 'variables' })
    const table = await screen.findByRole('table', { name: 'Variables in Sales' })
    const rows = within(table).getAllByRole('row').slice(1)
    expect(rows[0]).toHaveTextContent(
      /CRM_BASE_URL.*https:\/\/crm\.acme\.test.*Sales.*Overrides project/,
    )
    expect(rows[1]).toHaveTextContent(/SLACK_TOKEN.*••••••••.*Project 101.*Secret/)
    expect(rows[2]).toHaveTextContent(/REGION.*eu.*Acme Inc/)
  })
})
