import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ApiClientProvider } from '../api-client-context'
import { NodeRegistryProvider, useNodeRegistry } from '../node-registry-context'
import { useOrgStore } from '../../stores/org-store'

afterEach(() => {
  useOrgStore.getState().clear()
  vi.restoreAllMocks()
})

const CUSTOM = [
  {
    itemId: 'lead',
    owner: 'workspace',
    version: '1.0.1',
    definition: {
      id: 'custom:lead',
      name: 'Lead router',
      description: 'Routes leads',
      category: 'CRM',
      version: '1.0.1',
      configSchema: {},
      outputSchema: {},
      providers: ['cloudflare'],
      author: 'custom',
      license: 'UNLICENSED',
    },
  },
]

function Probe() {
  const { registry, customNodes } = useNodeRegistry()
  return (
    <span>
      {registry.get('custom:lead')?.name ?? 'none'} ·{' '}
      {customNodes.get('custom:lead')?.version ?? '-'}
      {' · '}
      {registry.get('step') ? 'builtins' : 'no builtins'}
    </span>
  )
}

function renderWith(workflowId?: string) {
  useOrgStore.setState({ appReady: true, activeOrganizationId: 'org_x', activeProjectId: 'prj_x' })
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <ApiClientProvider
        scope={{ organizationId: 'org_acme', projectId: 'prj_1', workspaceId: 'ws_1' }}
      >
        <NodeRegistryProvider {...(workflowId && { workflowId })}>
          <Probe />
        </NodeRegistryProvider>
      </ApiClientProvider>
    </QueryClientProvider>,
  )
}

describe('NodeRegistryProvider', () => {
  it('merges the workflow’s custom nodes over the builtins, with where each comes from', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(async (input) =>
        String(input).includes('/custom-nodes')
          ? new Response(JSON.stringify(CUSTOM))
          : new Response(JSON.stringify([])),
      )
    renderWith('wf_1')
    await screen.findByText('Lead router · 1.0.1 · builtins')
    const urls = fetchMock.mock.calls.map((call) => String(call[0]))
    expect(urls.find((u) => u.includes('/custom-nodes'))).toContain('/workflows/wf_1/custom-nodes')
  })

  it('asks for no custom nodes outside a workflow', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(async () => new Response(JSON.stringify([])))
    renderWith()
    await waitFor(() => expect(fetchMock).toHaveBeenCalled())
    expect(screen.getByText('none · - · builtins')).toBeInTheDocument()
    expect(fetchMock.mock.calls.some((call) => String(call[0]).includes('custom-nodes'))).toBe(
      false,
    )
  })
})
