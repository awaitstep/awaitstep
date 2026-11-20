import { beforeEach, describe, expect, it, vi } from 'vitest'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { installFakeApi, renderWithDashboardApi, type FakeApi } from '../../../__tests__/fake-api'
import { MarketplaceDialog } from '../marketplace-dialog'

const refresh = vi.hoisted(() => vi.fn())
vi.mock('../../../contexts/node-registry-context', () => ({
  useNodeRegistry: () => ({ refresh }),
}))

beforeEach(() => {
  refresh.mockReset()
})

/** Installs the node the dialog asks for, as the API would, so its catalog's refetch shows it. */
function withInstall(): FakeApi {
  const api = installFakeApi()
  api.on('POST /marketplace/:change', (req) => {
    const node = api.data.seed.nodes.find(
      (n) => n.orgId === 'org_acme' && n.id === (req.body as { nodeId: string }).nodeId,
    )!
    node.installedVersion = node.latestVersion
    return {}
  })
  return api
}

describe('MarketplaceDialog', () => {
  it('shows the same Installed and Available nodes as Resources › Nodes', async () => {
    renderWithDashboardApi(<MarketplaceDialog org="acme" onClose={vi.fn()} />)

    expect(await screen.findByRole('dialog', { name: 'Marketplace' })).toBeVisible()
    expect(await screen.findByRole('article', { name: 'Slack' })).toBeVisible()
    expect(screen.getByRole('region', { name: 'Installed' })).toBeVisible()
    expect(screen.getByRole('region', { name: 'Available from the marketplace' })).toBeVisible()
  })

  it('installs a node, then refreshes the palette as it closes', async () => {
    const onClose = vi.fn()
    const { unmount } = renderWithDashboardApi(<MarketplaceDialog org="acme" onClose={onClose} />, {
      api: withInstall(),
    })

    await userEvent.click(
      await screen.findByRole('button', {
        name: 'Install Anthropic for every project in Acme Inc',
      }),
    )
    await waitFor(() =>
      expect(
        within(screen.getByRole('region', { name: 'Installed' })).getByRole('article', {
          name: 'Anthropic',
        }),
      ).toBeVisible(),
    )

    await userEvent.click(screen.getByRole('button', { name: 'Close' }))
    expect(onClose).toHaveBeenCalledTimes(1)
    // Closing navigates, which unmounts the dialog: the palette re-reads then.
    expect(refresh).not.toHaveBeenCalled()
    unmount()
    expect(refresh).toHaveBeenCalledTimes(1)
  })
})
