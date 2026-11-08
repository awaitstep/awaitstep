import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { QueryClient, QueryClientProvider, useInfiniteQuery } from '@tanstack/react-query'
import { act, render, renderHook, waitFor } from '@testing-library/react'
import { api, createApiClient, projectUrl } from '../api-client'
import {
  isInOtherWorkspace,
  itemScopeFrom,
  resolveItemScope,
  type ItemApiScope,
} from '../workflows/route-scope'
import {
  ApiClientProvider,
  useApi,
  useApiOrganizationId,
  useApiReady,
  useItemApiScope,
  useQueries,
} from '../../contexts/api-client-context'
import { useOrgStore } from '../../stores/org-store'
import type { ScopeLookup } from '../../types/dashboard/scope'

const SALES = { org: 'acme', project: 'core', workspace: 'sales' }
const URL_SCOPE: ItemApiScope = {
  organizationId: 'org_acme',
  projectId: 'prj_second',
  workspaceId: 'ws_1',
}

function found(orgId: string, projectId: string): ScopeLookup {
  return {
    found: true,
    org: { org: { id: orgId } },
    project: { project: { id: projectId } },
    workspace: { workspace: { id: 'ws_1' } },
  } as unknown as ScopeLookup
}

const missing: ScopeLookup = {
  found: false,
  notFound: { kind: 'workspace', slug: 'salez', parent: null },
}

function seedSwitcher() {
  useOrgStore.setState({
    appReady: true,
    activeOrganizationId: 'org_old',
    activeProjectId: 'prj_first',
  })
}

function stubFetch() {
  return vi
    .spyOn(globalThis, 'fetch')
    .mockImplementation(async () => new Response(JSON.stringify({ data: [], nextCursor: null })))
}

function calledUrls(fetch: ReturnType<typeof stubFetch>): string[] {
  return fetch.mock.calls.map((call) => String(call[0]))
}

afterEach(() => {
  useOrgStore.getState().clear()
  vi.restoreAllMocks()
})

describe('createApiClient', () => {
  it('sends the scope it was given, whatever the switcher holds', async () => {
    seedSwitcher()
    const fetch = stubFetch()
    const client = createApiClient(() => URL_SCOPE)
    await client.getWorkflow('wf_1')
    await client.listProjects()
    expect(calledUrls(fetch)[0]).toContain('projectId=prj_second')
    expect(calledUrls(fetch)[1]).toContain('organizationId=org_acme')
    expect(client.projectUrl('/runs')).toContain('projectId=prj_second')
  })

  it('keeps the module client on the switcher’s project', () => {
    seedSwitcher()
    expect(projectUrl('/workflows')).toContain('projectId=prj_first')
    useOrgStore.getState().setActiveProject('prj_other')
    expect(projectUrl('/workflows')).toContain('projectId=prj_other')
  })
})

describe('resolveItemScope', () => {
  it('names the ids behind the URL’s slugs', async () => {
    await expect(
      resolveItemScope(SALES, async () => found('org_acme', 'prj_second')),
    ).resolves.toEqual(URL_SCOPE)
  })

  it('is null for a scope the viewer can’t open', async () => {
    await expect(resolveItemScope(SALES, async () => missing)).resolves.toBeNull()
    expect(itemScopeFrom(undefined)).toBeNull()
  })

  it('never writes the org store', async () => {
    seedSwitcher()
    await resolveItemScope(SALES, async () => found('org_acme', 'prj_second'))
    const state = useOrgStore.getState()
    expect(state.activeOrganizationId).toBe('org_old')
    expect(state.activeProjectId).toBe('prj_first')
  })
})

describe('isInOtherWorkspace', () => {
  it('is true only when both workspaces are known and differ', () => {
    expect(isInOtherWorkspace({ workspaceId: 'ws_2' }, 'ws_1')).toBe(true)
    expect(isInOtherWorkspace({ workspaceId: 'ws_1' }, 'ws_1')).toBe(false)
    expect(isInOtherWorkspace(undefined, 'ws_1')).toBe(false)
    expect(isInOtherWorkspace({ workspaceId: 'ws_2' }, undefined)).toBe(false)
  })
})

describe('ApiClientProvider', () => {
  function scoped(scope: ItemApiScope | null) {
    return function wrapper({ children }: { children: ReactNode }) {
      return <ApiClientProvider scope={scope}>{children}</ApiClientProvider>
    }
  }

  it('hands its children a client on the URL’s project', async () => {
    seedSwitcher()
    const fetch = stubFetch()
    const { result } = renderHook(() => useApi(), { wrapper: scoped(URL_SCOPE) })
    await result.current.getWorkflow('wf_1')
    expect(calledUrls(fetch)[0]).toContain('projectId=prj_second')
  })

  it('falls back to the module client without a scope', () => {
    const { result } = renderHook(() => ({ client: useApi(), scope: useItemApiScope() }), {
      wrapper: scoped(null),
    })
    expect(result.current.client).toBe(api)
    expect(result.current.scope).toBeNull()
  })

  it('is ready on the URL’s project even when the switcher has none', () => {
    useOrgStore.setState({ appReady: true, activeOrganizationId: null, activeProjectId: null })
    expect(renderHook(() => useApiReady()).result.current).toBe(false)
    expect(renderHook(() => useApiReady(), { wrapper: scoped(URL_SCOPE) }).result.current).toBe(
      true,
    )
  })

  it('names the URL’s org for org-level reads (custom nodes), else the switcher’s', () => {
    seedSwitcher()
    expect(renderHook(() => useApiOrganizationId()).result.current).toBe('org_old')
    expect(
      renderHook(() => useApiOrganizationId(), { wrapper: scoped(URL_SCOPE) }).result.current,
    ).toBe('org_acme')
  })

  it('keeps a query on the URL’s project when it refetches after the page is gone', async () => {
    seedSwitcher()
    const fetch = stubFetch()
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })

    function Versions() {
      const queries = useQueries()
      useInfiniteQuery(queries.versions.byWorkflow('wf_1'))
      return null
    }

    const view = render(
      <QueryClientProvider client={client}>
        <ApiClientProvider scope={URL_SCOPE}>
          <Versions />
        </ApiClientProvider>
      </QueryClientProvider>,
    )
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1))
    view.unmount()

    // Back on a page of another project: the switcher moves, the cached query refetches.
    useOrgStore.getState().setActiveProject('prj_elsewhere')
    await act(() => client.refetchQueries({ queryKey: ['versions', 'wf_1'], type: 'all' }))
    expect(fetch).toHaveBeenCalledTimes(2)
    for (const url of calledUrls(fetch)) expect(url).toContain('projectId=prj_second')
  })
})
