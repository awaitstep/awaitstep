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
  it('reads the run and its accounts in the URL’s project', async () => {
    useOrgStore.setState({
      appReady: true,
      activeOrganizationId: 'org_x',
      activeProjectId: 'prj_x',
    })
    const RUN = {
      id: 'run_1',
      workflowId: 'wf_1',
      versionId: 'v_1',
      connectionId: null,
      instanceId: 'inst_1',
      status: 'complete',
      output: null,
      error: null,
      createdAt: '2026-11-05T10:00:00.000Z',
      updatedAt: '2026-11-05T10:00:05.000Z',
    }
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) =>
      String(input).includes('/runs/run_1?')
        ? new Response(JSON.stringify(RUN))
        : new Response(JSON.stringify({ data: [], nextCursor: null })),
    )
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <QueryClientProvider client={client}>
        <ApiClientProvider
          scope={{ organizationId: 'org_acme', projectId: 'prj_url', workspaceId: 'ws_1' }}
        >
          <RunDetail
            slugs={{ org: 'acme', project: 'p-101', workspace: 'sales' }}
            runId="run_1"
            workflowId="wf_1"
          />
        </ApiClientProvider>
      </QueryClientProvider>,
    )
    await waitFor(() => expect(client.getQueryData(['deploy-connections', 'wf_1'])).toBeDefined())
    const keys = client
      .getQueryCache()
      .getAll()
      .map((q) => q.queryKey)
    expect(keys).not.toContainEqual(['connections', ''])
    const urls = vi.mocked(globalThis.fetch).mock.calls.map((call) => String(call[0]))
    expect(urls.find((url) => url.includes('/runs/run_1'))).toContain('projectId=prj_url')
    expect(urls.find((url) => url.includes('/deploy-connections'))).toContain('projectId=prj_url')
  })
})

describe('RunDetail for a workflow request its handler answered without starting a run', () => {
  it('reads as a call: the handler’s status, and no step telemetry asked for', async () => {
    useOrgStore.setState({
      appReady: true,
      activeOrganizationId: 'org_x',
      activeProjectId: 'prj_x',
    })
    const CALL = {
      id: 'run_2',
      workflowId: 'wf_1',
      versionId: 'v_1',
      connectionId: null,
      instanceId: 'call_abc123',
      status: 'errored',
      output: '{"message":"no"}',
      error: '{"name":"HttpStatus","message":"Answered 403"}',
      responseStatus: 403,
      hasParams: false,
      durationMs: 12,
      createdAt: '2026-11-05T10:00:00.000Z',
      updatedAt: '2026-11-05T10:00:00.012Z',
    }
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) =>
      String(input).includes('/runs/run_2?')
        ? new Response(JSON.stringify(CALL))
        : new Response(JSON.stringify({ data: [], nextCursor: null })),
    )
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const view = render(
      <QueryClientProvider client={client}>
        <ApiClientProvider
          scope={{ organizationId: 'org_acme', projectId: 'prj_url', workspaceId: 'ws_1' }}
        >
          <RunDetail
            slugs={{ org: 'acme', project: 'p-101', workspace: 'sales' }}
            runId="run_2"
            workflowId="wf_1"
          />
        </ApiClientProvider>
      </QueryClientProvider>,
    )
    await waitFor(() => expect(view.getByText('Response')).toBeTruthy())
    expect(view.getAllByText('403').length).toBeGreaterThan(0)
    const urls = vi.mocked(globalThis.fetch).mock.calls.map((call) => String(call[0]))
    expect(urls.some((url) => url.includes('/telemetry') || url.includes('/steps'))).toBe(false)
  })
})
