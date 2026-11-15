import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useNodeTemplates } from '../use-node-templates'

const templates = vi.hoisted(() => ({ get: vi.fn() }))

vi.mock('../../contexts/api-client-context', () => ({
  useApiOrganizationId: () => 'org_1',
  useApiReady: () => true,
  useQueries: () => ({
    workflows: {
      customNodeTemplates: (workflowId: string, types: readonly string[]) => ({
        queryKey: ['workflow-custom-node-templates', workflowId, types],
        queryFn: () => templates.get(workflowId, types),
      }),
    },
  }),
}))
vi.mock('../../contexts/node-registry-context', () => ({
  useNodeRegistry: () => ({ workflowId: 'wf_1' }),
}))

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

beforeEach(() => {
  templates.get.mockReset()
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(
    new Response(JSON.stringify({ slack: { cloudflare: 'slack body' } })),
  )
})
afterEach(() => vi.restoreAllMocks())

describe('useNodeTemplates', () => {
  it('asks only for the Library nodes the graph places, and resolves them beside the registry’s', async () => {
    templates.get.mockResolvedValue({ 'custom:lead': { cloudflare: 'lead body' } })
    const { result } = renderHook(
      () => useNodeTemplates(['step', 'custom:lead', 'slack', 'custom:lead']),
      { wrapper },
    )
    await waitFor(() => expect(result.current.getTemplate('custom:lead')).toBe('lead body'))
    await waitFor(() =>
      expect(result.current.getTemplate('slack', 'cloudflare')).toBe('slack body'),
    )
    expect(templates.get).toHaveBeenCalledWith('wf_1', ['custom:lead'])
  })

  it('asks for no custom templates when the graph places none', async () => {
    const { result } = renderHook(() => useNodeTemplates(['step']), { wrapper })
    await waitFor(() => expect(result.current.getTemplate('slack')).toBe('slack body'))
    expect(templates.get).not.toHaveBeenCalled()
  })
})

describe('useNodeTemplates switched on and off', () => {
  it('fetches the registry templates once it is enabled, and only once', async () => {
    const { rerender } = renderHook(
      ({ enabled }: { enabled: boolean }) => useNodeTemplates([], { enabled }),
      { wrapper, initialProps: { enabled: false } },
    )
    rerender({ enabled: true })
    await waitFor(() => expect(globalThis.fetch).toHaveBeenCalledTimes(1))
    rerender({ enabled: false })
    rerender({ enabled: true })
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(globalThis.fetch).toHaveBeenCalledTimes(1)
  })
})

describe('useNodeTemplates while switched off', () => {
  it('fetches nothing until it is enabled', async () => {
    renderHook(() => useNodeTemplates(['custom:lead'], { enabled: false }), { wrapper })
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(globalThis.fetch).not.toHaveBeenCalled()
    expect(templates.get).not.toHaveBeenCalled()
  })
})
