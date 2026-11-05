import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ApiClientProvider } from '../../../contexts/api-client-context'
import { useOrgStore } from '../../../stores/org-store'
import { RunDetail } from '../run-detail'

vi.mock('@tanstack/react-router', () => ({
  Link: () => null,
  useNavigate: () => vi.fn(),
}))

afterEach(() => {
  useOrgStore.getState().clear()
  vi.restoreAllMocks()
})

describe('RunDetail under a workflow URL', () => {
  it('caches the runs and accounts lists under the org and project it calls', async () => {
    useOrgStore.setState({
      appReady: true,
      activeOrganizationId: 'org_x',
      activeProjectId: 'prj_x',
    })
    vi.spyOn(globalThis, 'fetch').mockImplementation(
      async () => new Response(JSON.stringify({ data: [], nextCursor: null })),
    )
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <QueryClientProvider client={client}>
        <ApiClientProvider
          scope={{ organizationId: 'org_acme', projectId: 'prj_url', workspaceId: 'ws_1' }}
        >
          <RunDetail runId="run_1" />
        </ApiClientProvider>
      </QueryClientProvider>,
    )
    await waitFor(() => expect(client.getQueryData(['connections', 'org_acme'])).toBeDefined())
    const keys = client
      .getQueryCache()
      .getAll()
      .map((q) => q.queryKey)
    expect(keys).toContainEqual(['all-runs', 'prj_url'])
    expect(keys).not.toContainEqual(['all-runs', ''])
    expect(keys).not.toContainEqual(['connections', ''])
  })
})
