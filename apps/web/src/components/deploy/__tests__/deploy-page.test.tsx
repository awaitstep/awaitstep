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
import { EditorScopeProvider } from '../../../contexts/editor-scope-context'

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

function renderPage(connectionId?: string) {
  return render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <EditorScopeProvider value={{ org: 'acme', project: 'project-101', workspace: 'sales' }}>
        <DeployPage workflowId="wf-1" connectionId={connectionId} />
      </EditorScopeProvider>
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

  it('starts on the account a Roll back names, and on the default when it isn’t offered', async () => {
    const answer: DeployConnections = {
      connections: [
        account('c-prod7f2a', 'Acme production'),
        account('c-ownb84d', 'Checkout staging', 'project'),
      ],
      defaultId: 'c-ownb84d',
      deployedWith: [],
    }
    getDeployConnections.mockResolvedValue(answer)
    const { unmount } = renderPage('c-prod7f2a')
    await screen.findByRole('button', { name: /Acme production/ })
    await userEvent.click(screen.getByRole('button', { name: 'Next' }))
    expect(getDeployConfig).toHaveBeenCalledWith('wf-1', 'c-prod7f2a')
    unmount()
    getDeployConfig.mockClear()
    renderPage('c-gone')
    await screen.findByRole('button', { name: /Acme production/ })
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
