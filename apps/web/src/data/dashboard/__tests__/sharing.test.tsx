import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ApiSharedItem, ApiWorkflowRow } from '../../../lib/dashboard-api'
import { resetMockDb } from '../../../mocks/dashboard/db'
import type { ScopeSlugs } from '../../../types/dashboard/scope'
import {
  useProjectShared,
  useSetShared,
  useSharedWithWorkspace,
  useUnshareItem,
  useWorkspaceItems,
} from '../items'
import { dashKeys } from '../keys'
import { MockScenarioProvider } from '../scenario-context'
import { DataSourceProvider } from '../source'

// The share hooks on the API (B6): each addresses what the page is on by the
// id its scope already resolved, and the switch's state is the scope's.

const fetchMock = vi.fn()
const sales = { org: 'acme', project: 'project-101', workspace: 'sales' }
const p101 = { org: 'acme', project: 'project-101' }

function respond(body: unknown) {
  fetchMock.mockResolvedValue(
    new Response(JSON.stringify(body), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }),
  )
}

beforeEach(() => {
  resetMockDb()
  vi.stubGlobal('fetch', fetchMock)
  respond({ sharing: null })
})

afterEach(() => {
  vi.unstubAllGlobals()
  fetchMock.mockReset()
})

const SCOPE = {
  found: true,
  project: { project: { id: 'p-1' } },
  workspace: {
    workspace: { id: 'ws-1' },
    viewerCan: { share: { allowed: false, reason: 'Only Editors can share' } },
  },
}

function setup(scopes: [ScopeSlugs, unknown][]) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  })
  for (const [slugs, resolved] of scopes) {
    client.setQueryData([...dashKeys.scopeOf(slugs), 'api'], resolved)
  }
  function Wrapper({ children }: { children: ReactNode }) {
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
  return Wrapper
}

const lastCall = () => fetchMock.mock.calls.at(-1) as [string, RequestInit]

const SHARED: ApiSharedItem = {
  id: 'wf-1',
  name: 'Provision account',
  kind: 'workflow',
  version: 7,
  sharedAt: '2026-10-29T10:00:00.000Z',
  sharedBy: { id: 'u-lena', name: 'Lena' },
  from: { id: 'ws-it', slug: 'it', name: 'IT', colour: 'blue' },
  usedBy: [],
  canOpen: false,
  unshare: { allowed: false, reason: 'Only people in IT can unshare it' },
}

describe('share writes on the API', () => {
  it('flips the switch through PUT /workflows/:id/share in the workspace', async () => {
    const wrapper = setup([[sales, SCOPE]])
    const { result } = renderHook(() => useSetShared(sales), { wrapper })
    await result.current.mutateAsync({ itemId: 'wf-1', shared: true })
    const [url, init] = lastCall()
    expect(url).toBe('/api/workflows/wf-1/share?org=acme&project=project-101&workspace=sales')
    expect(init.method).toBe('PUT')
    expect(JSON.parse(init.body as string)).toEqual({ shared: true })
  })

  it('unshares from the Shared library in the item’s own workspace', async () => {
    const wrapper = setup([])
    const { result } = renderHook(() => useUnshareItem(p101.org, p101.project), { wrapper })
    await result.current.mutateAsync({ workspace: 'it', itemId: 'wf-1' })
    const [url, init] = lastCall()
    expect(url).toBe('/api/workflows/wf-1/share?org=acme&project=project-101&workspace=it')
    expect(JSON.parse(init.body as string)).toEqual({ shared: false })
  })
})

describe('share reads on the API', () => {
  it('reads the project’s Shared library by the project’s id', async () => {
    respond({ data: [SHARED], nextCursor: null })
    const wrapper = setup([[p101, SCOPE]])
    const { result } = renderHook(() => useProjectShared(p101.org, p101.project), { wrapper })
    await waitFor(() => expect(result.current.data).toBeDefined())
    expect(lastCall()[0]).toMatch(/^\/api\/projects\/p-1\/shared\?org=acme/)
    expect(result.current.data).toEqual([SHARED])
  })

  it('reads "Shared with" by the workspace’s id, with the kind', async () => {
    respond({ data: [SHARED], nextCursor: null })
    const wrapper = setup([[sales, SCOPE]])
    const { result } = renderHook(() => useSharedWithWorkspace(sales, 'workflow'), { wrapper })
    await waitFor(() => expect(result.current.data).toBeDefined())
    expect(lastCall()[0]).toMatch(/^\/api\/workspaces\/ws-1\/shared\?kind=workflow/)
    expect(result.current.data![0]).toMatchObject({ canOpen: false, from: { slug: 'it' } })
  })

  it('waits for the scope rather than guessing an id', async () => {
    const wrapper = setup([[sales, { found: false }]])
    const { result } = renderHook(() => useSharedWithWorkspace(sales), { wrapper })
    expect(result.current.fetchStatus).toBe('idle')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('gives each row its share and the switch the workspace’s share capability', async () => {
    const row: ApiWorkflowRow = {
      id: 'wf-1',
      name: 'Lead enrichment',
      kind: 'workflow',
      createdAt: '2026-10-20T00:00:00.000Z',
      updatedAt: '2026-10-20T00:00:00.000Z',
      workspaceId: 'ws-1',
      deployStatus: null,
      deployVersionId: null,
      deployedVersion: null,
      sharing: { sharedAt: '2026-10-29T10:00:00.000Z', sharedBy: { id: 'u-ama', name: 'Ama' } },
      lastRunStatus: null,
      lastRunAt: null,
      recentRunStatuses: [],
    }
    respond({ data: [row], nextCursor: null })
    const wrapper = setup([[sales, SCOPE]])
    const { result } = renderHook(() => useWorkspaceItems(sales, 'workflow'), { wrapper })
    await waitFor(() => expect(result.current.data).toBeDefined())
    expect(result.current.data![0]).toMatchObject({
      sharing: { sharedBy: { name: 'Ama' } },
      shareToggle: { allowed: false, reason: 'Only Editors can share' },
    })
  })
})
