import { beforeEach, describe, expect, it } from 'vitest'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {
  DANIEL,
  asProjectRole,
  installFakeApi,
  renderWithDashboardApi,
  type FakeApi,
} from '../../../__tests__/fake-api'
import { KeysPage } from '../keys-page'
import { VariablesPage } from '../variables-page'

const p101 = { org: 'acme', project: 'project-101' }
function noop() {}

beforeEach(() => {
  localStorage.clear()
})

/** Daniel: a member of Project 101, not one of its admins. */
function asMember(): FakeApi {
  const api = installFakeApi({ viewer: DANIEL })
  asProjectRole(api, 'acme/project-101', 'member')
  return api
}

const rowWith = (text: string) => screen.getByText(text).closest('tr') as HTMLElement

describe('project API keys', () => {
  it('revokes after the board’s warning, and keeps the key on Keep key', async () => {
    const api = installFakeApi()
    // The API drops the key, so the list's refetch no longer has it.
    api.on('DELETE /api-keys/:id', (req) => {
      api.data.seed.keys = api.data.seed.keys.filter((k) => k.id !== req.params.id)
      return {}
    })
    renderWithDashboardApi(<KeysPage slugs={p101} createOpen={false} onCloseCreate={noop} />, {
      api,
    })
    await screen.findByText('CI deploys')
    await userEvent.click(within(rowWith('CI deploys')).getByRole('button', { name: 'Revoke' }))
    const dialog = screen.getByRole('alertdialog', { name: 'Revoke CI deploys?' })
    expect(dialog).toHaveTextContent(
      'Anything using ask_Kq3VtR8m…a71d stops working immediately (last used: 22m ago). Keys it minted stop too.',
    )
    await userEvent.click(within(dialog).getByRole('button', { name: 'Keep key' }))
    expect(screen.getByText('CI deploys')).toBeVisible()

    await userEvent.click(within(rowWith('CI deploys')).getByRole('button', { name: 'Revoke' }))
    await userEvent.click(screen.getByRole('button', { name: 'Revoke key' }))
    await waitFor(() => expect(screen.queryByText('CI deploys')).not.toBeInTheDocument())
    expect(screen.getByText('3 active')).toBeVisible()
  })

  it('lists keys read-only for someone who isn’t a project admin', async () => {
    renderWithDashboardApi(<KeysPage slugs={p101} createOpen={false} onCloseCreate={noop} />, {
      api: asMember(),
    })
    await screen.findByText('CI deploys')
    expect(screen.queryByRole('button', { name: 'Revoke' })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'New API key' })).not.toBeInTheDocument()
  })
})

describe('project Variables', () => {
  it('shows the values without actions to a project member', async () => {
    renderWithDashboardApi(<VariablesPage slugs={p101} request={null} onCloseDialog={noop} />, {
      api: asMember(),
    })
    await screen.findByText('SLACK_TOKEN')
    expect(screen.queryByRole('link', { name: 'Edit' })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'New variable' })).not.toBeInTheDocument()
  })
})
