import { beforeEach, describe, expect, it } from 'vitest'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {
  DANIEL,
  dashboardDb,
  renderWithDashboardData,
  resetDashboardData,
} from '../../../data/dashboard/__tests__/fixtures/dashboard-data'
import { MembersPage } from '../members-page'
import { SharedLibraryPage } from '../shared-library-page'

const p101 = { org: 'acme', project: 'project-101' }

beforeEach(() => resetDashboardData(new Date()))

const rowOf = (name: string) => screen.getByRole('link', { name }).closest('tr') as HTMLElement

describe('project Shared library', () => {
  it('lists what workspaces shared, with where from, who calls it and when', async () => {
    renderWithDashboardData(<SharedLibraryPage slugs={p101} />)
    await screen.findByRole('link', { name: 'Provision account' })
    const provision = rowOf('Provision account')
    expect(provision).toHaveTextContent('Workflow · v7')
    expect(provision).toHaveTextContent('IT')
    expect(provision).toHaveTextContent('Called by Sales, Support')
    expect(provision).toHaveTextContent('Shared 28 Sep by Lena')
    expect(rowOf('Lead enrichment')).toHaveTextContent('Shared 3 Oct by Ama')
    expect(screen.getByText('Project modules arrive with modules, coming soon.')).toBeVisible()
  })

  it('blocks Unshare while others call the item, with the reason', async () => {
    renderWithDashboardData(<SharedLibraryPage slugs={p101} />)
    await screen.findByRole('link', { name: 'Provision account' })
    const button = within(rowOf('Provision account')).getByRole('button', { name: 'Unshare' })
    expect(button).toHaveAttribute('aria-disabled', 'true')
    expect(button).toHaveAccessibleDescription(/Called by Sales, Support/)
  })

  it('unshares an item nobody calls, and it leaves the list', async () => {
    dashboardDb().calls = dashboardDb().calls.filter((c) => c.itemId !== 'itm_slack')
    renderWithDashboardData(<SharedLibraryPage slugs={p101} />)
    await screen.findByRole('link', { name: 'Send Slack alert' })
    await userEvent.click(
      within(rowOf('Send Slack alert')).getByRole('button', { name: 'Unshare' }),
    )
    await waitFor(() =>
      expect(screen.queryByRole('link', { name: 'Send Slack alert' })).not.toBeInTheDocument(),
    )
  })

  it('names an item from a workspace the viewer can’t open, without linking to it', async () => {
    // Daniel is in Sales only; Provision account comes from IT.
    renderWithDashboardData(<SharedLibraryPage slugs={p101} />, { userId: DANIEL })
    await screen.findByRole('link', { name: 'Lead enrichment' })
    expect(screen.queryByRole('link', { name: 'Provision account' })).not.toBeInTheDocument()
    const provision = screen.getByText('Provision account').closest('tr') as HTMLElement
    expect(provision).toHaveTextContent('IT')
    const button = within(provision).getByRole('button', { name: 'Unshare' })
    expect(button).toHaveAttribute('aria-disabled', 'true')
    expect(button).toHaveAccessibleDescription('Only people in IT can unshare it')
  })

  it('explains New project module', async () => {
    renderWithDashboardData(<SharedLibraryPage slugs={p101} />)
    await userEvent.click(await screen.findByRole('button', { name: 'New project module' }))
    expect(screen.getByRole('dialog', { name: 'New project module' })).toBeVisible()
  })
})

describe('project Members', () => {
  it('groups people as ProjectMembers does, editing access through the org editor', async () => {
    renderWithDashboardData(<MembersPage slugs={p101} />)
    const whole = await screen.findByRole('table', { name: /every workspace/ })
    const ama = within(whole).getByText('Ama Mensah (you)').closest('tr')!
    expect(ama).toHaveTextContent('Owner · whole org')
    expect(within(ama).queryByRole('link', { name: 'Edit access' })).not.toBeInTheDocument()
    const tom = within(whole).getByText('Tom Becker').closest('tr')!
    expect(tom).toHaveTextContent('Project admin')
    expect(within(tom).getByRole('link', { name: 'Edit access' })).toHaveAttribute(
      'href',
      '/acme/settings/members?access=usr_tom',
    )

    const only = screen.getByRole('table', { name: /some workspaces/ })
    const rows = within(only).getAllByRole('row').slice(1)
    expect(rows.map((r) => r.textContent)).toEqual([
      expect.stringMatching(/Daniel Kim.*Member.*Sales.*Editor/),
      expect.stringMatching(/Priya Shah.*Sales.*Viewer/),
      expect.stringMatching(/Lena Ortiz.*IT.*Workspace admin/),
    ])
    expect(
      within(screen.getByRole('banner', { name: 'Top bar' })).getByRole('link', {
        name: 'Add people',
      }),
    ).toHaveAttribute('href', '/acme/settings/members?access=add&project=project-101')
  })

  it('offers the org’s access editor only to org owners and admins, not project admins', async () => {
    // Tom is Project 101's admin but a plain member of Acme.
    renderWithDashboardData(<MembersPage slugs={p101} />, { userId: 'usr_tom' })
    await screen.findByRole('table', { name: /every workspace/ })
    expect(screen.queryByRole('link', { name: 'Edit access' })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Add people' })).not.toBeInTheDocument()
  })

  it('shows a project member the list without editing', async () => {
    renderWithDashboardData(<MembersPage slugs={p101} />, { userId: DANIEL })
    await screen.findByRole('table', { name: /every workspace/ })
    expect(screen.queryByRole('link', { name: 'Edit access' })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Add people' })).not.toBeInTheDocument()
  })
})
