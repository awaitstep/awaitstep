import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ApiClientProvider } from '../../contexts/api-client-context'
import type { ItemApiScope } from '../../lib/workflows/route-scope'
import { useOrgStore } from '../../stores/org-store'
import { useLastRunSteps } from '../use-last-run-steps'
import { useOutsideChanges } from '../use-outside-changes'

// The IDE's background reads run under a workflow's URL: they must name its
// project even while the old switcher sits on another one.
const URL_SCOPE: ItemApiScope = {
  organizationId: 'org_acme',
  projectId: 'prj_url',
  workspaceId: 'ws_1',
}

let client: QueryClient

beforeEach(() => {
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
})

function wrapper({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={client}>
      <ApiClientProvider scope={URL_SCOPE}>{children}</ApiClientProvider>
    </QueryClientProvider>
  )
}

function stubFetch(body: unknown) {
  return vi
    .spyOn(globalThis, 'fetch')
    .mockImplementation(async () => new Response(JSON.stringify(body)))
}

afterEach(() => {
  useOrgStore.getState().clear()
  vi.restoreAllMocks()
})

describe('IDE reads under a workflow URL', () => {
  it('checks for outside changes in the URL’s project', async () => {
    useOrgStore.setState({
      appReady: true,
      activeOrganizationId: 'org_x',
      activeProjectId: 'prj_x',
    })
    const fetch = stubFetch({ files: [] })
    renderHook(
      () => useOutsideChanges({ workflowId: 'wf_1', enabled: true, baseline: new Map() }),
      { wrapper },
    )
    await waitFor(() => expect(fetch).toHaveBeenCalled())
    expect(String(fetch.mock.calls[0]![0])).toContain('projectId=prj_url')
  })

  it('reads the last run in the URL’s project', async () => {
    useOrgStore.setState({
      appReady: true,
      activeOrganizationId: 'org_x',
      activeProjectId: 'prj_x',
    })
    const fetch = stubFetch({ data: [], nextCursor: null })
    renderHook(() => useLastRunSteps('wf_1', true), { wrapper })
    await waitFor(() => expect(fetch).toHaveBeenCalled())
    expect(String(fetch.mock.calls[0]![0])).toContain('projectId=prj_url')
  })
})
