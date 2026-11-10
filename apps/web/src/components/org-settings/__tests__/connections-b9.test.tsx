import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {
  renderWithDashboardData,
  resetDashboardData,
} from '../../../data/dashboard/__tests__/fixtures/dashboard-data'
import { DataSourceProvider } from '../../../data/dashboard/source'
import type { Connection } from '../../../types/dashboard/org-settings'
import { ConnectCloudflareDialog } from '../connect-cloudflare-dialog'
import { ConnectionCard, tokenStatus } from '../parts/connection-card'

// What B9 adds to Connections: the token's health as Cloudflare reports it,
// projects the viewer can't see, and the API's refusals in the dialog.

const NOW = new Date('2026-10-30T12:00:00.000Z')

const CONNECTION: Connection = {
  id: 'c1',
  name: 'Acme production',
  accountSuffix: '7f2a',
  addedBy: { id: 'u1', name: 'Ama Mensah' },
  tokenStatus: 'active',
  tokenExpiresAt: null,
  projects: [{ id: 'p1', name: 'Project 101' }],
  hiddenProjects: 0,
  deployments: { count: 0, lastAt: null },
}

const ACTIONS = {
  onAddProject: vi.fn(),
  onRemoveProject: vi.fn(),
  onReplaceToken: vi.fn(),
  onRename: vi.fn(),
  onRemove: vi.fn(),
}

function card(connection: Partial<Connection>, actions: typeof ACTIONS | undefined = ACTIONS) {
  render(
    <ConnectionCard
      connection={{ ...CONNECTION, ...connection }}
      addable={[]}
      actions={actions}
      now={NOW}
    />,
  )
  return screen.getByRole('region', { name: 'Acme production' })
}

describe('ConnectionCard token states', () => {
  it('reads a working token as valid, with no call to replace it', () => {
    const region = card({})
    expect(region).toHaveTextContent('Token valid')
    expect(within(region).queryByRole('button', { name: 'Replace token' })).toBeNull()
  })

  it('asks for a new token when Cloudflare no longer accepts it', () => {
    const region = card({ tokenStatus: 'invalid', tokenExpiresAt: '2027-01-01T00:00:00.000Z' })
    expect(region).toHaveTextContent('Token no longer works')
    expect(within(region).getByRole('button', { name: 'Replace token' })).toBeInTheDocument()
  })

  it('says a token not yet checked is that, without asking for a new one', () => {
    const region = card({ tokenStatus: 'unchecked' })
    expect(region).toHaveTextContent('Token not checked yet')
    expect(within(region).queryByRole('button', { name: 'Replace token' })).toBeNull()
  })

  it('reads an expired token as expired whatever the last check said', () => {
    expect(card({ tokenExpiresAt: '2026-10-29T00:00:00.000Z' })).toHaveTextContent('Token expired')
  })
})

describe('ConnectionCard projects', () => {
  it('counts the projects the viewer can’t see', () => {
    expect(card({ hiddenProjects: 2 }, undefined)).toHaveTextContent(
      /Project 101\s*2 other projects/,
    )
  })

  it('says when it serves no project', () => {
    expect(card({ projects: [] })).toHaveTextContent('No projects')
  })
})

describe('Connect Cloudflare on the API', () => {
  const fetchMock = vi.fn()

  beforeEach(() => {
    resetDashboardData(NOW)
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    fetchMock.mockReset()
  })

  function answer(status: number, body: unknown) {
    fetchMock.mockImplementation(async (url: string) =>
      url.startsWith('/api/connections')
        ? new Response(JSON.stringify(body), { status })
        : new Response(JSON.stringify({ data: [], nextCursor: null }), { status: 200 }),
    )
  }

  async function submit() {
    renderWithDashboardData(
      <DataSourceProvider source="api">
        <ConnectCloudflareDialog org={{ slug: 'acme', name: 'Acme' }} onClose={vi.fn()} />
      </DataSourceProvider>,
    )
    const dialog = await screen.findByRole('dialog', { name: 'Connect with an API token' })
    await userEvent.type(within(dialog).getByRole('textbox', { name: /Name/ }), 'Staging')
    await userEvent.type(
      within(dialog).getByRole('textbox', { name: /Account ID/ }),
      '0123456789abcdef0123456789abcdef',
    )
    await userEvent.type(within(dialog).getByLabelText(/API token/), 'cf-token')
    await userEvent.click(within(dialog).getByRole('checkbox', { name: /All projects/ }))
    await userEvent.click(within(dialog).getByRole('button', { name: 'Check token and connect' }))
    return dialog
  }

  it('puts a refused token under the token field', async () => {
    answer(400, {
      error: 'Cloudflare doesn’t accept this token, or it has expired',
      field: 'token',
    })
    const dialog = await submit()
    await waitFor(() =>
      expect(within(dialog).getByLabelText(/API token/)).toHaveAccessibleDescription(
        /doesn’t accept this token/,
      ),
    )
  })

  it('puts a token that can’t reach the account under the account field', async () => {
    answer(400, { error: 'This token can’t reach that account', field: 'accountId' })
    const dialog = await submit()
    await waitFor(() =>
      expect(
        within(dialog).getByRole('textbox', { name: /Account ID/ }),
      ).toHaveAccessibleDescription(/can’t reach that account/),
    )
  })

  it('says under the form when Cloudflare couldn’t be asked', async () => {
    answer(502, { error: 'Couldn’t reach Cloudflare to check the token. Try again in a minute.' })
    const dialog = await submit()
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      'Couldn’t reach Cloudflare to check the token',
    )
  })
})

describe('OAuth connection badge', () => {
  const now = new Date('2026-11-10T12:00:00.000Z')

  it('says it renews itself and never asks for a replacement token', () => {
    expect(
      tokenStatus(
        {
          authKind: 'oauth',
          tokenStatus: 'active',
          tokenExpiresAt: new Date(now.getTime() + 3_600_000).toISOString(),
          canDeploy: true,
        },
        now,
      ),
    ).toEqual({
      text: 'OAuth · renews automatically',
      variant: 'success',
      needsToken: false,
      needsReconnect: false,
    })
  })

  it('asks for a reconnect when the grant is gone', () => {
    expect(
      tokenStatus({ authKind: 'oauth', tokenStatus: 'invalid', tokenExpiresAt: null }, now),
    ).toMatchObject({
      text: 'OAuth connection needs reconnecting',
      needsToken: false,
      needsReconnect: true,
    })
  })

  it('asks for a reconnect when the grant lacks the deploy scope', () => {
    expect(
      tokenStatus(
        {
          authKind: 'oauth',
          tokenStatus: 'active',
          tokenExpiresAt: null,
          canDeploy: false,
        },
        now,
      ),
    ).toMatchObject({
      text: 'OAuth · missing a Workers deploy scope',
      needsReconnect: true,
    })
  })
})
