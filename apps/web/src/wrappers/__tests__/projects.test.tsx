import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useOrgStore } from '../../stores/org-store'
import ProjectsWrapper from '../projects'
import type * as ApiClient from '../../lib/api-client'

vi.mock('../runs', () => ({ default: () => null }))
vi.mock('../workflows', () => ({ default: () => null }))
vi.mock('../../lib/api-client', async (importOriginal) => {
  const actual = await importOriginal<typeof ApiClient>()
  return {
    ...actual,
    api: {
      ...actual.api,
      listProjects: async () => ({
        data: [{ id: 'prj_first', organizationId: 'org_1', name: 'First', slug: 'first' }],
        nextCursor: null,
      }),
    },
  }
})

function renderWrapper() {
  const client = new QueryClient()
  function wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>
  }
  return render(<ProjectsWrapper />, { wrapper })
}

afterEach(() => useOrgStore.getState().clear())

describe('ProjectsWrapper', () => {
  it('leaves an open editor’s project alone, even past the list’s first page', async () => {
    useOrgStore.setState({
      appReady: true,
      activeOrganizationId: 'org_1',
      activeProjectId: 'prj_page_3',
      routeScope: {
        key: 'acme/core/sales',
        organizationId: 'org_1',
        projectId: 'prj_page_3',
        workspaceId: 'ws_1',
      },
    })
    renderWrapper()
    await waitFor(() => expect(useOrgStore.getState().projectsFetchState).toBe('success'))
    expect(useOrgStore.getState().activeProjectId).toBe('prj_page_3')
  })

  it('falls back to its first project once that editor closes', async () => {
    useOrgStore.setState({
      appReady: true,
      activeOrganizationId: 'org_1',
      activeProjectId: 'prj_page_3',
      routeScope: {
        key: 'acme/core/sales',
        organizationId: 'org_1',
        projectId: 'prj_page_3',
        workspaceId: 'ws_1',
      },
    })
    renderWrapper()
    await waitFor(() => expect(useOrgStore.getState().projectsFetchState).toBe('success'))
    useOrgStore.getState().setRouteScope(null)
    await waitFor(() => expect(useOrgStore.getState().activeProjectId).toBe('prj_first'))
  })
})
