import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import exported from '../../../lib/workflows/__tests__/fixtures/exported-workflow.json'
import { resetMockDb } from '../../../mocks/dashboard/db'
import { useImportItem } from '../items'
import { dashKeys } from '../keys'
import { MockScenarioProvider } from '../scenario-context'
import { DataSourceProvider } from '../source'

// Import on the API: create in the URL's workspace, then save the file's graph
// as the first version; nothing is left behind when either step fails.

const fetchMock = vi.fn()
const sales = { org: 'acme', project: 'project-101', workspace: 'sales' }
const CREATED = {
  id: 'wf-new',
  name: 'simple-workflow',
  kind: 'workflow',
  workspaceId: 'ws-1',
  currentVersionId: null,
  createdAt: '2026-11-05T10:00:00.000Z',
  updatedAt: '2026-11-05T10:00:00.000Z',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

beforeEach(() => {
  resetMockDb()
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
  fetchMock.mockReset()
})

function setup() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  })
  client.setQueryData([...dashKeys.scopeOf(sales), 'api'], {
    found: true,
    project: { project: { id: 'p-1' } },
    workspace: { workspace: { id: 'ws-1' }, viewerCan: { share: { allowed: true } } },
  })
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={client}>
        <DataSourceProvider source="api">
          <MockScenarioProvider scenario="empty" userId="user-real" real>
            {children}
          </MockScenarioProvider>
        </DataSourceProvider>
      </QueryClientProvider>
    )
  }
}

const calls = () => fetchMock.mock.calls as [string, RequestInit | undefined][]

describe('useImportItem on the API', () => {
  it('creates the item in the workspace, then saves the file as its first version', async () => {
    fetchMock.mockResolvedValueOnce(json(CREATED)).mockResolvedValueOnce(json({ id: 'v-1' }))
    const onImported = vi.fn()
    const { result } = renderHook(() => useImportItem(sales, { onImported }), {
      wrapper: setup(),
    })
    const item = await result.current.mutateAsync({
      fileName: 'simple.ir.json',
      content: JSON.stringify(exported),
    })

    const [create, version] = calls()
    expect(create[0]).toBe('/api/workflows?org=acme&project=project-101&workspace=sales')
    expect(JSON.parse(create[1]!.body as string)).toEqual({
      name: 'simple-workflow',
      description: 'A simple two-step workflow',
      kind: 'workflow',
    })
    expect(version[0]).toBe('/api/workflows/wf-new/versions?org=acme&project=project-101')
    expect(JSON.parse(version[1]!.body as string).ir.nodes).toHaveLength(exported.nodes.length)
    expect(item.id).toBe('wf-new')
    expect(onImported).toHaveBeenCalledWith(expect.objectContaining({ id: 'wf-new' }))
  })

  it('creates nothing for a file that isn’t an export', async () => {
    const { result } = renderHook(() => useImportItem(sales), { wrapper: setup() })
    await expect(
      result.current.mutateAsync({ fileName: 'x.json', content: '{"nodes": 3}' }),
    ).rejects.toThrow(/isn’t a workflow export/)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('removes the empty item when its version can’t be saved', async () => {
    fetchMock
      .mockResolvedValueOnce(json(CREATED))
      .mockResolvedValueOnce(json({ error: 'Invalid IR' }, 400))
      .mockResolvedValueOnce(json({ ok: true }))
    const { result } = renderHook(() => useImportItem(sales), { wrapper: setup() })
    await expect(
      result.current.mutateAsync({ fileName: 'x.json', content: JSON.stringify(exported) }),
    ).rejects.toThrow('Invalid IR')
    const [, , remove] = calls()
    expect(remove[0]).toBe('/api/workflows/wf-new?org=acme&project=project-101')
    expect(remove[1]!.method).toBe('DELETE')
  })
})
