import { beforeEach, describe, expect, it, vi } from 'vitest'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {
  DANIEL,
  dashboardDb,
  renderWithDashboardData,
  resetDashboardData,
} from '../../../data/dashboard/__tests__/fixtures/dashboard-data'
import type * as WorkspaceHooks from '../../../data/dashboard/workspaces'
import { GeneralPage } from '../general-page'

const goTo = vi.fn()
vi.mock('../../navigation/router-shell-link', () => ({ useGoTo: () => goTo }))

// Holds the workspace list back, to check Delete waits for the counts it quotes.
const hold = { workspaces: false }
vi.mock('../../../data/dashboard/workspaces', async (importOriginal) => {
  const real = await importOriginal<typeof WorkspaceHooks>()
  return {
    ...real,
    useWorkspaces: (org: string, project: string) => {
      const query = real.useWorkspaces(org, project)
      return hold.workspaces ? { ...query, data: undefined } : query
    },
  }
})

const p101 = { org: 'acme', project: 'project-101' }

beforeEach(() => {
  resetDashboardData(new Date())
  goTo.mockReset()
  hold.workspaces = false
})

const topBar = () => screen.getByRole('banner', { name: 'Top bar' })
const field = (name: RegExp) => screen.getByRole('textbox', { name })

async function renderPage(userId?: string) {
  renderWithDashboardData(<GeneralPage slugs={p101} />, { userId })
  await screen.findByRole('heading', { name: 'General' })
}

describe('project General', () => {
  it('doesn’t count spaces around a value as a change', async () => {
    await renderPage()
    await userEvent.type(field(/Project name/), '  ')
    expect(within(topBar()).getByRole('button', { name: 'Save changes' })).toBeDisabled()
  })

  it('saves a renamed project once something changed', async () => {
    await renderPage()
    const save = within(topBar()).getByRole('button', { name: 'Save changes' })
    expect(save).toBeDisabled()
    await userEvent.clear(field(/Project name/))
    await userEvent.type(field(/Project name/), 'Project 102')
    expect(save).toBeEnabled()
    await userEvent.click(save)
    await waitFor(() =>
      expect(dashboardDb().projects.find((p) => p.id === 'prj_101')!.name).toBe('Project 102'),
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
    await waitFor(() => expect(goTo).toHaveBeenCalledWith('/acme/p-101/settings/general'))
  })

  it('blocks Delete while the lock is on, and deletes after typing the name once it’s off', async () => {
    await renderPage()
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
    expect(dialog).toHaveTextContent('This removes Sales, IT and Support, 8 workflows')
    const confirm = within(dialog).getByRole('button', { name: 'Delete project' })
    expect(confirm).toBeDisabled()
    await userEvent.type(within(dialog).getByRole('textbox'), 'Project 101')
    await userEvent.click(confirm)
    await waitFor(() => expect(goTo).toHaveBeenCalledWith('/acme/projects'))
    expect(dashboardDb().projects.some((p) => p.id === 'prj_101')).toBe(false)
  })

  it('moves the project to an org the viewer administers', async () => {
    dashboardDb().projects.find((p) => p.id === 'prj_101')!.lock = null
    await renderPage()
    await userEvent.click(screen.getByRole('button', { name: 'Move project' }))
    const dialog = screen.getByRole('dialog', { name: 'Move Project 101' })
    await within(dialog).findByText('Bolt Labs')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Move project' }))
    await waitFor(() =>
      expect(goTo).toHaveBeenCalledWith('/bolt-labs/project-101/settings/general'),
    )
  })

  it('clears a refused move when another org is picked', async () => {
    const db = dashboardDb()
    db.projects.find((p) => p.id === 'prj_101')!.lock = null
    db.orgMembers.push({
      orgId: 'org_globex',
      userId: 'usr_ama',
      role: 'admin',
      joinedAt: new Date().toISOString(),
      lastOpenedAt: null,
    })
    await renderPage()
    await userEvent.click(screen.getByRole('button', { name: 'Move project' }))
    const dialog = screen.getByRole('dialog', { name: 'Move Project 101' })
    const select = await within(dialog).findByRole('combobox')
    // Ama loses admin of Bolt Labs after the dialog listed it.
    db.orgMembers.find((m) => m.orgId === 'org_bolt' && m.userId === 'usr_ama')!.role = 'member'
    await userEvent.click(within(dialog).getByRole('button', { name: 'Move project' }))
    expect(await within(dialog).findByText(/Only owners and admins of Bolt Labs/)).toBeVisible()

    await userEvent.click(select)
    await userEvent.click(await screen.findByRole('option', { name: 'Globex' }))
    expect(
      within(dialog).queryByText(/Only owners and admins of Bolt Labs/),
    ).not.toBeInTheDocument()
  })

  it('offers New organization when there is nowhere to move to', async () => {
    dashboardDb().orgMembers.find((m) => m.orgId === 'org_bolt' && m.userId === 'usr_ama')!.role =
      'member'
    dashboardDb().projects.find((p) => p.id === 'prj_101')!.lock = null
    await renderPage()
    await userEvent.click(screen.getByRole('button', { name: 'Move project' }))
    const dialog = screen.getByRole('dialog', { name: 'Move Project 101' })
    expect(await within(dialog).findByRole('link', { name: 'New organization' })).toHaveAttribute(
      'href',
      '/choose-org?new=org',
    )
  })

  it('keeps Delete blocked until it knows what would be deleted', async () => {
    dashboardDb().projects.find((p) => p.id === 'prj_101')!.lock = null
    hold.workspaces = true
    await renderPage()
    const remove = screen.getByRole('button', { name: 'Delete project' })
    expect(remove).toHaveAttribute('aria-disabled', 'true')
    expect(remove).toHaveAccessibleDescription('Counting what would be deleted…')
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
    await renderPage(DANIEL)
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
