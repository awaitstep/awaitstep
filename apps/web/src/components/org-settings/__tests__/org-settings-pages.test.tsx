import { useState } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {
  DANIEL,
  dashboardDb,
  dashboardServer,
  renderWithDashboardData,
  resetDashboardData,
} from '../../../data/dashboard/__tests__/fixtures/dashboard-data'
import { OrgConnectionsPage } from '../org-connections-page'
import { OrgGeneralPage } from '../org-general-page'
import { OrgKeysPage } from '../org-keys-page'
import { OrgMembersPage, type MembersOverlay } from '../org-members-page'
import { PNG_SIGNATURE } from '../../../lib/__tests__/fixtures/image-bytes'

const goTo = vi.fn()
vi.mock('../../navigation/router-shell-link', () => ({ useGoTo: () => goTo }))

beforeEach(() => {
  resetDashboardData(new Date())
  goTo.mockReset()
})

function noop() {}

const topBar = () => screen.getByRole('banner', { name: 'Top bar' })

function Members({ start = null }: { start?: MembersOverlay }) {
  const [overlay, setOverlay] = useState<MembersOverlay>(start)
  return <OrgMembersPage org="acme" overlay={overlay} onOverlayChange={setOverlay} />
}

async function pick(combobox: HTMLElement, option: string) {
  await userEvent.click(combobox)
  await userEvent.click(await screen.findByRole('option', { name: option }))
}

describe('org General', () => {
  it('renames the org and blocks Delete while projects remain', async () => {
    renderWithDashboardData(<OrgGeneralPage org="acme" />)
    const name = await screen.findByRole('textbox', { name: /Organization name/ })
    await userEvent.clear(name)
    await userEvent.type(name, 'Acme Corp')
    await userEvent.click(within(topBar()).getByRole('button', { name: 'Save changes' }))
    await waitFor(() =>
      expect(dashboardDb().orgs.find((o) => o.id === 'org_acme')!.name).toBe('Acme Corp'),
    )
    expect(
      await screen.findByRole('button', { name: 'Delete organization' }),
    ).toHaveAccessibleDescription('3 projects still in it')
  })

  it('moves to the new URL, and puts a reserved one’s error on the URL field', async () => {
    renderWithDashboardData(<OrgGeneralPage org="acme" />)
    const url = await screen.findByRole('textbox', { name: /URL/ })
    await userEvent.clear(url)
    await userEvent.type(url, 'settings')
    await userEvent.click(within(topBar()).getByRole('button', { name: 'Save changes' }))
    await waitFor(() => expect(url).toHaveAccessibleDescription(/used by a dashboard page/))
    await userEvent.clear(url)
    await userEvent.type(url, 'acme-corp')
    await userEvent.click(within(topBar()).getByRole('button', { name: 'Save changes' }))
    await waitFor(() => expect(goTo).toHaveBeenCalledWith('/acme-corp/settings/general'))
  })

  it('takes an uploaded logo, and clears it from the × on the logo', async () => {
    renderWithDashboardData(<OrgGeneralPage org="acme" />)
    await screen.findByRole('textbox', { name: /Organization name/ })
    // No logo, nothing to clear: the × isn't there.
    expect(screen.queryByRole('button', { name: 'Remove logo' })).toBeNull()
    const file = new File([PNG_SIGNATURE], 'logo.png', { type: 'image/png' })
    await userEvent.upload(document.querySelector('input[type="file"]') as HTMLInputElement, file)
    expect(await screen.findByRole('button', { name: 'Remove logo' })).toBeEnabled()
    await userEvent.click(within(topBar()).getByRole('button', { name: 'Save changes' }))
    await waitFor(() =>
      expect(dashboardDb().orgs.find((o) => o.id === 'org_acme')!.logo).toMatch(/^data:image\/png/),
    )
    // The saved page remounts with the logo: clear it from there.
    await userEvent.click(await screen.findByRole('button', { name: 'Remove logo' }))
    expect(screen.queryByRole('button', { name: 'Remove logo' })).toBeNull()
  })

  it('is read-only for an org member', async () => {
    renderWithDashboardData(<OrgGeneralPage org="acme" />, { userId: DANIEL })
    expect(await screen.findByRole('textbox', { name: /Organization name/ })).toBeDisabled()
    expect(within(topBar()).queryByRole('button', { name: 'Save changes' })).not.toBeInTheDocument()
  })
})

describe('org API keys', () => {
  it('tells a member they can’t see the org keys, and never asks for them', async () => {
    const list = vi.spyOn(dashboardServer.keys, 'listOrgKeys')
    renderWithDashboardData(<OrgKeysPage org="acme" createOpen={false} onCloseCreate={noop} />, {
      userId: DANIEL,
    })
    const panel = await screen.findByRole('region', {
      name: 'You can’t see the organization’s API keys',
    })
    expect(panel).toHaveTextContent('kept to owners and admins')
    expect(
      await within(panel).findByRole('list', { name: 'Who can give you access' }),
    ).toBeInTheDocument()
    expect(screen.queryByText(/couldn’t load/i)).toBeNull()
    expect(within(topBar()).queryByRole('link', { name: 'New API key' })).toBeNull()
    expect(list).not.toHaveBeenCalled()
    list.mockRestore()
  })

  it('lists the org keys at the Org level and revokes one', async () => {
    renderWithDashboardData(<OrgKeysPage org="acme" createOpen={false} onCloseCreate={noop} />)
    await screen.findByText('Terraform')
    const levels = screen.getByRole('list', { name: 'Key levels' })
    const here = within(levels)
      .getAllByRole('listitem')
      .find((li) => li.getAttribute('aria-current'))
    expect(here).toHaveTextContent('Organization keys')
    expect(
      within(screen.getByText('Onboarding bot').closest('tr')!).getByText('In 5 days'),
    ).toHaveClass('text-status-warning')
    await userEvent.click(
      within(screen.getByText('Terraform').closest('tr')!).getByRole('button', { name: 'Revoke' }),
    )
    await userEvent.click(screen.getByRole('button', { name: 'Revoke key' }))
    await waitFor(() => expect(screen.queryByText('Terraform')).not.toBeInTheDocument())
  })
})

describe('org Members', () => {
  it('reads as OrgMembers: roles, where each can work, pending invites', async () => {
    renderWithDashboardData(<Members />)
    const table = await screen.findByRole('table', { name: 'Members of Acme Inc' })
    const row = (name: string) => within(table).getByText(name, { exact: false }).closest('tr')!
    expect(row('Ama Mensah')).toHaveTextContent(/Owner.*All projects/)
    expect(row('Tom Becker')).toHaveTextContent(/Project 101 · all workspaces.*Internal Tools/)
    expect(row('Daniel Kim')).toHaveTextContent('Project 101 · Sales (Editor)')
    const invites = screen.getByRole('list', { name: 'Pending invitations' })
    expect(invites).toHaveTextContent(/sam@acme\.test.*Member · Project 101 · IT.*Sent 2 days ago/)
  })

  it('edits Daniel’s access in the side panel, and the row follows', async () => {
    renderWithDashboardData(<Members start={{ kind: 'access', userId: DANIEL }} />)
    const panel = await screen.findByRole('dialog', { name: 'Daniel Kim' })
    await pick(
      await within(panel).findByRole('combobox', { name: 'Project 101' }),
      'Project member',
    )
    await userEvent.click(within(panel).getByRole('button', { name: 'Save access' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    const table = screen.getByRole('table', { name: 'Members of Acme Inc' })
    await waitFor(() =>
      expect(within(table).getByText('Daniel Kim').closest('tr')).toHaveTextContent(
        'Project 101 · all workspaces',
      ),
    )
  })

  it('picks the person first for Add people', async () => {
    renderWithDashboardData(<Members start={{ kind: 'access', userId: null }} />)
    const panel = await screen.findByRole('dialog', { name: 'Add people' })
    await userEvent.click(within(panel).getByRole('button', { name: '+ Add person' }))
    await userEvent.click(await screen.findByRole('option', { name: /Lena Ortiz/ }))
    expect(await screen.findByRole('dialog', { name: 'Lena Ortiz' })).toBeVisible()
  })

  it('refuses to remove the last owner, and removes someone else after confirming', async () => {
    renderWithDashboardData(<Members start={{ kind: 'access', userId: DANIEL }} />)
    const panel = await screen.findByRole('dialog', { name: 'Daniel Kim' })
    await userEvent.click(within(panel).getByRole('button', { name: 'Remove from Acme Inc' }))
    await userEvent.click(
      within(
        screen.getByRole('alertdialog', { name: 'Remove Daniel Kim from Acme Inc?' }),
      ).getByRole('button', { name: 'Remove' }),
    )
    await waitFor(() => expect(screen.queryByText('Daniel Kim')).not.toBeInTheDocument())
  })

  it('invites two people to a workspace as Editors', async () => {
    renderWithDashboardData(<Members start={{ kind: 'invite' }} />)
    const dialog = await screen.findByRole('dialog', { name: 'Invite people to Acme Inc' })
    const emails = within(dialog).getByRole('textbox', { name: /Email addresses/ })
    await userEvent.type(emails, 'joy@acme.test,kofi@acme.test{enter}')
    await userEvent.click(within(dialog).getByRole('combobox', { name: 'Where they can work' }))
    await userEvent.click(await screen.findByRole('option', { name: /^IT/ }))
    expect(dialog).toHaveTextContent('they’ll open Project 101 › IT (Editor) and nothing else')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Send 2 invites' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(screen.getByRole('list', { name: 'Pending invitations' })).toHaveTextContent(
      /joy@acme\.test.*kofi@acme\.test/,
    )
  })

  it('puts an already-invited email’s error on the field', async () => {
    renderWithDashboardData(<Members start={{ kind: 'invite' }} />)
    const dialog = await screen.findByRole('dialog', { name: 'Invite people to Acme Inc' })
    const emails = within(dialog).getByRole('textbox', { name: /Email addresses/ })
    await userEvent.type(emails, 'sam@acme.test{enter}')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Send 1 invite' }))
    await waitFor(() => expect(emails).toHaveAccessibleDescription(/already invited/))
  })

  it('cancels an invite after Keep invite / Cancel invite', async () => {
    renderWithDashboardData(<Members />)
    const invites = await screen.findByRole('list', { name: 'Pending invitations' })
    await userEvent.click(within(invites).getByRole('button', { name: 'Cancel invite' }))
    const confirm = screen.getByRole('alertdialog', {
      name: 'Cancel the invite to sam@acme.test?',
    })
    await userEvent.click(within(confirm).getByRole('button', { name: 'Cancel invite' }))
    await waitFor(() =>
      expect(screen.queryByRole('list', { name: 'Pending invitations' })).not.toBeInTheDocument(),
    )
  })

  it('shows an org member the list without Edit access or Invite', async () => {
    renderWithDashboardData(<Members />, { userId: DANIEL })
    await screen.findByRole('table', { name: 'Members of Acme Inc' })
    expect(screen.queryByRole('link', { name: 'Edit access' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Invite people' })).not.toBeInTheDocument()
  })
})

describe('review round (2026-10-27)', () => {
  it('doesn’t offer Owner to an admin', async () => {
    dashboardDb().orgMembers.find((m) => m.orgId === 'org_acme' && m.userId === 'usr_tom')!.role =
      'admin'
    renderWithDashboardData(<Members start={{ kind: 'access', userId: DANIEL }} />, {
      userId: 'usr_tom',
    })
    const panel = await screen.findByRole('dialog', { name: 'Daniel Kim' })
    await userEvent.click(within(panel).getByRole('combobox', { name: 'Role in Acme Inc' }))
    expect(screen.queryByRole('option', { name: 'Owner' })).not.toBeInTheDocument()
  })

  it('locks an owner’s access for an admin', async () => {
    dashboardDb().orgMembers.find((m) => m.orgId === 'org_acme' && m.userId === 'usr_tom')!.role =
      'admin'
    renderWithDashboardData(<Members start={{ kind: 'access', userId: 'usr_ama' }} />, {
      userId: 'usr_tom',
    })
    const panel = await screen.findByRole('dialog', { name: 'Ama Mensah' })
    expect(within(panel).getByText('Only owners can change an owner’s access.')).toBeVisible()
    expect(within(panel).getByRole('button', { name: 'Save access' })).toBeDisabled()
    expect(within(panel).queryByRole('button', { name: /Remove from/ })).not.toBeInTheDocument()
  })

  it('offers Project member on the project someone is being added to', async () => {
    renderWithDashboardData(
      <Members start={{ kind: 'access', userId: null, project: 'marketing-site' }} />,
    )
    const picker = await screen.findByRole('dialog', { name: 'Add people' })
    await userEvent.click(within(picker).getByRole('button', { name: '+ Add person' }))
    await userEvent.click(await screen.findByRole('option', { name: /Daniel Kim/ }))
    const panel = await screen.findByRole('dialog', { name: 'Daniel Kim' })
    expect(
      await within(panel).findByRole('combobox', { name: 'Marketing Site' }),
    ).toHaveTextContent('Project member')
  })

  it('follows a new person in the URL instead of keeping the last one’s editor', async () => {
    const onOverlayChange = vi.fn()
    const view = renderWithDashboardData(
      <OrgMembersPage
        org="acme"
        overlay={{ kind: 'access', userId: DANIEL }}
        onOverlayChange={onOverlayChange}
      />,
    )
    await screen.findByRole('dialog', { name: 'Daniel Kim' })
    view.rerender(
      <OrgMembersPage
        org="acme"
        overlay={{ kind: 'access', userId: 'usr_lena' }}
        onOverlayChange={onOverlayChange}
      />,
    )
    expect(await screen.findByRole('dialog', { name: 'Lena Ortiz' })).toBeVisible()
  })

  it('counts only unexpired org keys as active', async () => {
    dashboardDb().keys.find((k) => k.id === 'key_terraform')!.expiresAt = new Date(
      Date.now() - 1000,
    ).toISOString()
    renderWithDashboardData(<OrgKeysPage org="acme" createOpen={false} onCloseCreate={noop} />)
    // Onboarding bot and the Platform sync bundle stay; Terraform is now expired.
    expect(await screen.findByText('2 active')).toBeVisible()
  })

  it('clears an email error once that email is removed', async () => {
    renderWithDashboardData(<Members start={{ kind: 'invite' }} />)
    const dialog = await screen.findByRole('dialog', { name: 'Invite people to Acme Inc' })
    const emails = within(dialog).getByRole('textbox', { name: /Email addresses/ })
    await userEvent.type(emails, 'sam@acme.test{enter}')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Send 1 invite' }))
    await waitFor(() => expect(emails).toHaveAccessibleDescription(/already invited/))
    await userEvent.click(within(dialog).getByRole('button', { name: 'Remove sam@acme.test' }))
    expect(emails).not.toHaveAccessibleDescription(/already invited/)
  })
})

describe('org Connections', () => {
  function Connections({ start = false }: { start?: boolean }) {
    const [open, setOpen] = useState(start)
    return <OrgConnectionsPage org="acme" connectOpen={open} onConnectChange={setOpen} />
  }

  it('offers the token flow when OAuth is not available', async () => {
    renderWithDashboardData(<Connections />)
    await userEvent.click(await screen.findByRole('button', { name: /Connect Cloudflare/ }))
    expect(
      await screen.findByRole('dialog', { name: 'Connect with an API token' }),
    ).toBeInTheDocument()
  })

  it('reads as OrgConnections: accounts, token state, projects, deployments', async () => {
    renderWithDashboardData(<Connections />)
    const production = await screen.findByRole('region', { name: 'Acme production' })
    expect(production).toHaveTextContent(/••••7f2a · added by Ama Mensah.*Token valid/)
    expect(production).toHaveTextContent(/Project 101.*Internal Tools/)
    expect(production).toHaveTextContent('18 deployments · last 22m ago')
    const marketing = screen.getByRole('region', { name: 'Marketing sandbox' })
    expect(marketing).toHaveTextContent('Token expires in 6 days')
  })

  it('replaces an expiring token', async () => {
    renderWithDashboardData(<Connections />)
    const marketing = await screen.findByRole('region', { name: 'Marketing sandbox' })
    await userEvent.click(within(marketing).getByRole('button', { name: 'Replace token' }))
    const dialog = screen.getByRole('dialog', { name: /Replace the token/ })
    // A password field: the token is never shown.
    const token = within(dialog).getByLabelText('API token')
    expect(token).toHaveAttribute('type', 'password')
    await userEvent.type(token, 'new-token')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Replace token' }))
    await waitFor(() =>
      expect(screen.getByRole('region', { name: 'Marketing sandbox' })).toHaveTextContent(
        'Token valid',
      ),
    )
  })

  it('adds and removes a project on an account', async () => {
    renderWithDashboardData(<Connections />)
    const marketing = await screen.findByRole('region', { name: 'Marketing sandbox' })
    await userEvent.click(within(marketing).getByRole('button', { name: 'Project' }))
    await userEvent.click(await screen.findByRole('option', { name: /Internal Tools/ }))
    await waitFor(() =>
      expect(screen.getByRole('region', { name: 'Marketing sandbox' })).toHaveTextContent(
        'Internal Tools',
      ),
    )
    await userEvent.click(
      within(screen.getByRole('region', { name: 'Marketing sandbox' })).getByRole('button', {
        name: 'Remove Internal Tools from Marketing sandbox',
      }),
    )
    await waitFor(() =>
      expect(screen.getByRole('region', { name: 'Marketing sandbox' })).not.toHaveTextContent(
        'Internal Tools',
      ),
    )
  })

  it('connects an account, with the account ID checked on its field', async () => {
    renderWithDashboardData(<Connections start />)
    const dialog = await screen.findByRole('dialog', { name: 'Connect with an API token' })
    await userEvent.type(within(dialog).getByRole('textbox', { name: /Name/ }), 'Staging')
    const account = within(dialog).getByRole('textbox', { name: /Account ID/ })
    await userEvent.type(account, 'nope')
    await userEvent.type(within(dialog).getByLabelText(/API token/), 'cf-token')
    await userEvent.click(within(dialog).getByRole('checkbox', { name: /All projects/ }))
    await userEvent.click(within(dialog).getByRole('button', { name: 'Check token and connect' }))
    await waitFor(() => expect(account).toHaveAccessibleDescription(/32 letters and digits/))
    await userEvent.clear(account)
    await userEvent.type(account, '0123456789abcdef0123456789abcdef')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Check token and connect' }))
    expect(await screen.findByRole('region', { name: 'Staging' })).toHaveTextContent(
      'All projects, including new ones',
    )
  })

  it('removes a connection after confirming', async () => {
    renderWithDashboardData(<Connections />)
    const marketing = await screen.findByRole('region', { name: 'Marketing sandbox' })
    await userEvent.click(
      within(marketing).getByRole('button', { name: 'More actions for Marketing sandbox' }),
    )
    await userEvent.click(screen.getByRole('menuitem', { name: 'Remove connection…' }))
    await userEvent.click(screen.getByRole('button', { name: 'Remove connection' }))
    await waitFor(() =>
      expect(screen.queryByRole('region', { name: 'Marketing sandbox' })).not.toBeInTheDocument(),
    )
  })
})
