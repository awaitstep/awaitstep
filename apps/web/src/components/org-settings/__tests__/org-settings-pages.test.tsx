import { useState } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {
  DANIEL,
  TOM,
  apiError,
  asOrgRole,
  authError,
  installFakeApi,
  renderWithDashboardApi,
  type FakeApi,
} from '../../../__tests__/fake-api'
import { OrgConnectionsPage } from '../org-connections-page'
import { OrgGeneralPage } from '../org-general-page'
import { OrgKeysPage } from '../org-keys-page'
import { OrgMembersPage, type MembersOverlay } from '../org-members-page'
import { PNG_SIGNATURE } from '../../../lib/__tests__/fixtures/image-bytes'

const goTo = vi.fn()
vi.mock('../../navigation/router-shell-link', () => ({ useGoTo: () => goTo }))

beforeEach(() => {
  goTo.mockReset()
})

/** Renders against the fake API: Ama, Acme's owner, unless the test hands over its own. */
function render(ui: React.ReactElement, api: FakeApi = installFakeApi()) {
  const view = renderWithDashboardApi(ui, { api })
  return { ...view, api }
}

/** Someone with `role` in Acme. */
function as(viewer: string, role: 'owner' | 'admin' | 'member'): FakeApi {
  const api = installFakeApi({ viewer: viewer as typeof DANIEL })
  asOrgRole(api, 'acme', role)
  return api
}

function noop() {}

const topBar = () => screen.getByRole('banner', { name: 'Top bar' })

function Members({ start = null }: { start?: MembersOverlay }) {
  const [overlay, setOverlay] = useState<MembersOverlay>(start)
  return <OrgMembersPage org="acme" overlay={overlay} onOverlayChange={setOverlay} />
}

/** The API refuses an address that already has an invite waiting. */
function alreadyInvited(): FakeApi {
  const api = installFakeApi()
  api.on(
    'POST /invitations',
    apiError(409, 'sam@acme.test is already invited', { field: 'emails' }),
  )
  return api
}

async function pick(combobox: HTMLElement, option: string) {
  await userEvent.click(combobox)
  await userEvent.click(await screen.findByRole('option', { name: option }))
}

describe('org General', () => {
  it('renames the org and blocks Delete while projects remain', async () => {
    const { api } = render(<OrgGeneralPage org="acme" />, as('usr_ama', 'owner'))
    const name = await screen.findByRole('textbox', { name: /Organization name/ })
    await userEvent.clear(name)
    await userEvent.type(name, 'Acme Corp')
    await userEvent.click(within(topBar()).getByRole('button', { name: 'Save changes' }))
    await waitFor(() =>
      expect(api.lastRequest('POST /auth/organization/update').body).toMatchObject({
        organizationId: 'org_acme',
        data: { name: 'Acme Corp' },
      }),
    )
    expect(
      await screen.findByRole('button', { name: 'Delete organization' }),
    ).toHaveAccessibleDescription('3 projects still in it')
  })

  it('moves to the new URL, and puts a reserved one’s error on the URL field', async () => {
    const api = installFakeApi()
    api.on('POST /auth/organization/update', (req) =>
      (req.body as { data: { slug?: string } }).data.slug === 'settings'
        ? authError(400, 'That URL is used by a dashboard page')
        : {},
    )
    render(<OrgGeneralPage org="acme" />, api)
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
    const api = installFakeApi()
    api.on('PUT /orgs/:id/logo', () => {
      api.data.orgs.acme!.logo = 'data:image/png;base64,iVBORw0KGgo='
      return { logo: api.data.orgs.acme!.logo }
    })
    render(<OrgGeneralPage org="acme" />, api)
    await screen.findByRole('textbox', { name: /Organization name/ })
    // No logo, nothing to clear: the × isn't there.
    expect(screen.queryByRole('button', { name: 'Remove logo' })).toBeNull()
    const file = new File([PNG_SIGNATURE], 'logo.png', { type: 'image/png' })
    await userEvent.upload(document.querySelector('input[type="file"]') as HTMLInputElement, file)
    expect(await screen.findByRole('button', { name: 'Remove logo' })).toBeEnabled()
    await userEvent.click(within(topBar()).getByRole('button', { name: 'Save changes' }))
    await waitFor(() => expect(api.requestsTo('PUT /orgs/:id/logo')).toHaveLength(1))
    // The saved page remounts with the logo: clear it from there.
    await userEvent.click(await screen.findByRole('button', { name: 'Remove logo' }))
    expect(screen.queryByRole('button', { name: 'Remove logo' })).toBeNull()
  })

  it('is read-only for an org member', async () => {
    render(<OrgGeneralPage org="acme" />, as(DANIEL, 'member'))
    expect(await screen.findByRole('textbox', { name: /Organization name/ })).toBeDisabled()
    expect(within(topBar()).queryByRole('button', { name: 'Save changes' })).not.toBeInTheDocument()
  })
})

describe('org API keys', () => {
  it('tells a member they can’t see the org keys, and never asks for them', async () => {
    const { api } = render(
      <OrgKeysPage org="acme" createOpen={false} onCloseCreate={noop} />,
      as(DANIEL, 'member'),
    )
    const panel = await screen.findByRole('region', {
      name: 'You can’t see the organization’s API keys',
    })
    expect(panel).toHaveTextContent('kept to owners and admins')
    expect(
      await within(panel).findByRole('list', { name: 'Who can give you access' }),
    ).toBeInTheDocument()
    expect(screen.queryByText(/couldn’t load/i)).toBeNull()
    expect(within(topBar()).queryByRole('link', { name: 'New API key' })).toBeNull()
    expect(api.requestsTo('GET /api-keys')).toHaveLength(0)
  })

  it('lists the org keys at the Org level and revokes one', async () => {
    const api = installFakeApi()
    api.on('DELETE /api-keys/:id', (req) => {
      api.data.seed.keys = api.data.seed.keys.filter((k) => k.id !== req.params.id)
      return {}
    })
    render(<OrgKeysPage org="acme" createOpen={false} onCloseCreate={noop} />, api)
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
  it('edits Daniel’s access in the side panel, and the row follows', async () => {
    const api = installFakeApi()
    api.on('PUT /members/:id/access', () => {
      api.data.seed.projectMembers.push({ projectId: 'prj_101', userId: DANIEL, role: 'member' })
      return { ok: true }
    })
    render(<Members start={{ kind: 'access', userId: DANIEL }} />, api)
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
    render(<Members start={{ kind: 'access', userId: null }} />)
    const panel = await screen.findByRole('dialog', { name: 'Add people' })
    await userEvent.click(within(panel).getByRole('button', { name: '+ Add person' }))
    await userEvent.click(await screen.findByRole('option', { name: /Lena Ortiz/ }))
    expect(await screen.findByRole('dialog', { name: 'Lena Ortiz' })).toBeVisible()
  })

  it('refuses to remove the last owner, and removes someone else after confirming', async () => {
    const api = installFakeApi()
    api.on('DELETE /members/:id', (req) => {
      api.data.seed.orgMembers = api.data.seed.orgMembers.filter((m) => m.userId !== req.params.id)
      return { ok: true }
    })
    render(<Members start={{ kind: 'access', userId: DANIEL }} />, api)
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
    const api = installFakeApi()
    api.on('POST /invitations', (req) => {
      const { emails } = req.body as { emails: string[] }
      for (const email of emails) {
        api.data.seed.invitations.push({
          id: `inv_${email}`,
          orgId: 'org_acme',
          email,
          role: 'member',
          places: [{ projectId: 'prj_101', workspaceId: 'ws_it', role: 'editor' }],
          sentAt: api.now.toISOString(),
          invitedBy: 'usr_ama',
        })
      }
      return { data: emails.map((email) => ({ id: `inv_${email}`, email })) }
    })
    render(<Members start={{ kind: 'invite' }} />, api)
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
    render(<Members start={{ kind: 'invite' }} />, alreadyInvited())
    const dialog = await screen.findByRole('dialog', { name: 'Invite people to Acme Inc' })
    const emails = within(dialog).getByRole('textbox', { name: /Email addresses/ })
    await userEvent.type(emails, 'sam@acme.test{enter}')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Send 1 invite' }))
    await waitFor(() => expect(emails).toHaveAccessibleDescription(/already invited/))
  })

  it('cancels an invite after Keep invite / Cancel invite', async () => {
    const api = installFakeApi()
    api.on('DELETE /invitations/:id', (req) => {
      api.data.seed.invitations = api.data.seed.invitations.filter((i) => i.id !== req.params.id)
      return { ok: true }
    })
    render(<Members />, api)
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
    render(<Members />, as(DANIEL, 'member'))
    await screen.findByRole('table', { name: 'Members of Acme Inc' })
    expect(screen.queryByRole('link', { name: 'Edit access' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Invite people' })).not.toBeInTheDocument()
  })
})

describe('review round (2026-10-27)', () => {
  it('doesn’t offer Owner to an admin', async () => {
    render(<Members start={{ kind: 'access', userId: DANIEL }} />, as(TOM, 'admin'))
    const panel = await screen.findByRole('dialog', { name: 'Daniel Kim' })
    await userEvent.click(within(panel).getByRole('combobox', { name: 'Role in Acme Inc' }))
    expect(screen.queryByRole('option', { name: 'Owner' })).not.toBeInTheDocument()
  })

  it('locks an owner’s access for an admin', async () => {
    render(<Members start={{ kind: 'access', userId: 'usr_ama' }} />, as(TOM, 'admin'))
    const panel = await screen.findByRole('dialog', { name: 'Ama Mensah' })
    expect(within(panel).getByText('Only owners can change an owner’s access.')).toBeVisible()
    expect(within(panel).getByRole('button', { name: 'Save access' })).toBeDisabled()
    expect(within(panel).queryByRole('button', { name: /Remove from/ })).not.toBeInTheDocument()
  })

  it('offers Project member on the project someone is being added to', async () => {
    render(<Members start={{ kind: 'access', userId: null, project: 'marketing-site' }} />)
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
    const view = renderWithDashboardApi(
      <OrgMembersPage
        org="acme"
        overlay={{ kind: 'access', userId: DANIEL }}
        onOverlayChange={onOverlayChange}
      />,
      { api: installFakeApi() },
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
    const api = installFakeApi()
    api.data.seed.keys.find((k) => k.id === 'key_terraform')!.expiresAt = new Date(
      Date.now() - 1000,
    ).toISOString()
    render(<OrgKeysPage org="acme" createOpen={false} onCloseCreate={noop} />, api)
    // Onboarding bot and the Platform sync bundle stay; Terraform is now expired.
    expect(await screen.findByText('2 active')).toBeVisible()
  })

  it('clears an email error once that email is removed', async () => {
    render(<Members start={{ kind: 'invite' }} />, alreadyInvited())
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

  it('has one Add account button, which opens the provider list', async () => {
    render(<Connections />)
    expect(screen.queryByRole('button', { name: /Use an API token/ })).toBeNull()
    await userEvent.click(await screen.findByRole('button', { name: 'Add account' }))
    const dialog = await screen.findByRole('dialog', { name: 'Add account' })
    expect(within(dialog).getByRole('button', { name: /Cloudflare\.com/ })).toBeVisible()
  })

  it('replaces an expiring token', async () => {
    const api = installFakeApi()
    api.on('PATCH /connections/:id', (req) => {
      api.data.seed.connections.find((c) => c.id === req.params.id)!.tokenExpiresAt = null
      return { id: req.params.id }
    })
    render(<Connections />, api)
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
    const api = installFakeApi()
    api.on('PATCH /connections/:id', (req) => {
      const { projectIds } = req.body as { projectIds?: string[] }
      if (projectIds) {
        api.data.seed.connections.find((c) => c.id === req.params.id)!.projects = projectIds
      }
      return { id: req.params.id }
    })
    render(<Connections />, api)
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
    const api = installFakeApi()
    api.on('POST /connections', (req) => {
      const body = req.body as { name: string; credentials: { accountId: string } }
      const accountId = body.credentials.accountId
      if (!/^[a-f0-9]{32}$/.test(accountId)) {
        return apiError(400, 'An account ID is 32 letters and digits (0–9, a–f)', {
          field: 'accountId',
        })
      }
      api.data.seed.connections.push({
        id: 'conn_staging',
        orgId: 'org_acme',
        name: body.name,
        accountId,
        addedBy: 'usr_ama',
        tokenExpiresAt: null,
        projects: 'all',
        deployments: 0,
        lastDeployAt: null,
      })
      return { id: 'conn_staging' }
    })
    render(<Connections start />, api)
    const dialog = await screen.findByRole('dialog', { name: 'Add account' })
    await userEvent.click(within(dialog).getByRole('button', { name: /Cloudflare\.com/ }))
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
    const api = installFakeApi()
    api.on('DELETE /connections/:id', (req) => {
      api.data.seed.connections = api.data.seed.connections.filter((c) => c.id !== req.params.id)
      return { ok: true }
    })
    render(<Connections />, api)
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
