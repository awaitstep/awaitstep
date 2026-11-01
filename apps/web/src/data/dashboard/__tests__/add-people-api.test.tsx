import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { resetMockDb } from '../../../mocks/dashboard/db'
import { useAddProjectPeople } from '../add-people'
import { MockScenarioProvider } from '../scenario-context'
import { DataSourceProvider } from '../source'
import type * as ProjectHooks from '../projects'

// Add people from a project (21a) on the API: what it sends, what it reads
// back, and which pages it refreshes.

vi.mock('../projects', async (importOriginal) => ({
  ...(await importOriginal<typeof ProjectHooks>()),
  useProjectId: (_org: string, project: string) => (project === 'project-101' ? 'p-101' : null),
}))

const fetchMock = vi.fn()

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
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={client}>
        <DataSourceProvider source="api">
          <MockScenarioProvider scenario="none" userId="usr_ama">
            {children}
          </MockScenarioProvider>
        </DataSourceProvider>
      </QueryClientProvider>
    )
  }
  return {
    client,
    ...renderHook(() => useAddProjectPeople('acme', 'project-101'), { wrapper: Wrapper }),
  }
}

describe('useAddProjectPeople on the API', () => {
  it('posts each person, and keeps the workspaces the server actually granted', async () => {
    fetchMock.mockResolvedValue(
      json(
        {
          userId: 'usr_eve',
          scope: 'workspaces',
          role: 'editor',
          workspaces: [{ id: 'ws_it', name: 'IT' }],
        },
        201,
      ),
    )
    const { result } = setup()
    const access = {
      scope: 'workspaces' as const,
      workspaceIds: ['ws_sales', 'ws_it'],
      role: 'editor' as const,
    }
    const outcomes = await act(() =>
      result.current.mutateAsync({ access, userIds: ['usr_eve'], emails: [] }),
    )
    expect(outcomes).toEqual([{ key: 'usr_eve', result: 'added', workspaces: ['IT'] }])
    const [url, init] = fetchMock.mock.calls[0]!
    expect(String(url)).toMatch(/\/projects\/p-101\/members$/)
    expect(JSON.parse(init.body as string)).toEqual({ userId: 'usr_eve', access })
  })

  it('refreshes org Members, whose rows list each person’s places', async () => {
    fetchMock.mockResolvedValue(json({ userId: 'usr_eve', scope: 'project', role: 'member' }, 201))
    const { result, client } = setup()
    client.setQueryData(['dash', 'orgMembers', 'acme', 'api'], [])
    await act(() =>
      result.current.mutateAsync({
        access: { scope: 'project', role: 'member' },
        userIds: ['usr_eve'],
        emails: [],
      }),
    )
    expect(client.getQueryState(['dash', 'orgMembers', 'acme', 'api'])?.isInvalidated).toBe(true)
  })
})
