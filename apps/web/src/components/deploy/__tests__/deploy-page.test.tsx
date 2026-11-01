import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { DeployConnections } from '@awaitstep/ir'
import type * as ApiClient from '../../../lib/api-client'

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }))
const getDeployConnections = vi.hoisted(() => vi.fn())
const getDeployConfig = vi.hoisted(() => vi.fn())
vi.mock('../../../lib/api-client', async (original) => ({
  ...(await original<typeof ApiClient>()),
  api: { getDeployConnections, getDeployConfig },
}))

import { useOrgStore } from '../../../stores/org-store'
import { DeployPage } from '../deploy-page'

// Deploy offers the project's accounts only, with the workspace's (else the
// project's) default already chosen; a project with none shows 23c's line.

function account(id: string, name: string, scope: 'shared' | 'project' = 'shared') {
  return {
    id,
    provider: 'cloudflare',
    name,
    accountSuffix: id.slice(-4),
    scope,
    tokenStatus: 'active' as const,
    tokenExpiresAt: null,
  }
}

function renderPage() {
  return render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <DeployPage workflowId="wf-1" />
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  getDeployConnections.mockReset()
  getDeployConfig.mockReset()
  getDeployConfig.mockResolvedValue({ config: {}, provider: 'cloudflare', preview: {} })
  useOrgStore.setState({
    appReady: true,
    organizations: [{ id: 'org-1', name: 'Acme', slug: 'acme', createdAt: '' }],
    projects: [
      {
        id: 'p-1',
        organizationId: 'org-1',
        name: 'Project 101',
        slug: 'project-101',
        createdAt: '',
        updatedAt: '',
      },
    ],
    activeOrganizationId: 'org-1',
    activeProjectId: 'p-1',
  })
})

describe('DeployPage accounts', () => {
  it('lists the project’s accounts with the default chosen, and moves on with it', async () => {
    const answer: DeployConnections = {
      connections: [
        account('c-prod7f2a', 'Acme production'),
        account('c-ownb84d', 'Checkout staging', 'project'),
      ],
      defaultId: 'c-ownb84d',
      deployedWith: [],
    }
    getDeployConnections.mockResolvedValue(answer)
    renderPage()
    const own = await screen.findByRole('button', { name: /Checkout staging/ })
    expect(own).toHaveTextContent('Default')
    expect(own).toHaveTextContent('••••b84d · This project only')
    expect(screen.getByRole('button', { name: /Acme production/ })).not.toHaveTextContent('Default')
    await userEvent.click(screen.getByRole('button', { name: 'Next' }))
    expect(getDeployConfig).toHaveBeenCalledWith('wf-1', 'c-ownb84d')
  })

  it('waits for a pick when the project has no default', async () => {
    getDeployConnections.mockResolvedValue({
      connections: [account('c-prod7f2a', 'Acme production')],
      defaultId: null,
      deployedWith: [],
    })
    renderPage()
    await screen.findByRole('button', { name: /Acme production/ })
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled()
  })

  it('says Deploy stays disabled without an account, and links to the project’s Connections', async () => {
    getDeployConnections.mockResolvedValue({ connections: [], defaultId: null, deployedWith: [] })
    renderPage()
    expect(await screen.findByText('No account connected yet')).toBeInTheDocument()
    expect(screen.getByText(/Deploy stays disabled/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Open Connections' })).toHaveAttribute(
      'href',
      '/acme/project-101/connections',
    )
  })
})
