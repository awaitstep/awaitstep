import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ScopeSlugs } from '../../../types/dashboard/scope'
import { resetMockDb } from '../../../mocks/dashboard/db'
import { dashKeys } from '../keys'
import { useSetLock } from '../locks'
import { MockScenarioProvider } from '../scenario-context'
import { DataSourceProvider } from '../source'

// The lock switch on the API: it addresses what the page is on by the id the
// page's scope already resolved.

const fetchMock = vi.fn()

beforeEach(() => {
  resetMockDb()
  vi.stubGlobal('fetch', fetchMock)
  fetchMock.mockResolvedValue(
    new Response(JSON.stringify({ lock: null }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }),
  )
})

afterEach(() => {
  vi.unstubAllGlobals()
  fetchMock.mockReset()
})

function setup(slugs: ScopeSlugs, resolved: unknown) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  })
  client.setQueryData([...dashKeys.scopeOf(slugs), 'api'], resolved)
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

describe('useSetLock on the API', () => {
  it('turns a project’s lock on through PUT /projects/:id/lock', async () => {
    const slugs = { org: 'acme', project: 'project-101' }
    const wrapper = setup(slugs, { found: true, project: { project: { id: 'p-1' } } })
    const { result } = renderHook(() => useSetLock({ level: 'project', ...slugs }), { wrapper })
    await result.current.mutateAsync(true)
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('/api/projects/p-1/lock?org=acme')
    expect(init.method).toBe('PUT')
    expect(JSON.parse(init.body as string)).toEqual({ locked: true })
  })

  it('turns a workspace’s lock off through PUT /workspaces/:id/lock', async () => {
    const slugs = { org: 'acme', project: 'project-101', workspace: 'sales' }
    const wrapper = setup(slugs, {
      found: true,
      project: { project: { id: 'p-1' } },
      workspace: { workspace: { id: 'ws-1' } },
    })
    const { result } = renderHook(() => useSetLock({ level: 'workspace', ...slugs }), { wrapper })
    await result.current.mutateAsync(false)
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('/api/workspaces/ws-1/lock')
    expect(JSON.parse(init.body as string)).toEqual({ locked: false })
  })

  it('refuses before the scope has loaded rather than guessing an id', async () => {
    const slugs = { org: 'acme', project: 'project-101' }
    const wrapper = setup(slugs, { found: false })
    const { result } = renderHook(() => useSetLock({ level: 'project', ...slugs }), { wrapper })
    await expect(result.current.mutateAsync(true)).rejects.toThrow('The project has not loaded yet')
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
