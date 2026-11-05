import { afterEach, describe, expect, it, vi } from 'vitest'
import { QueryClient } from '@tanstack/react-query'
import { isNotFound } from '@tanstack/react-router'
import { apiScopeQuery } from '../../../data/dashboard/workspaces'
import { leaveRouteScope } from '../../../lib/workflows/route-scope'
import { useOrgStore } from '../../../stores/org-store'
import type { ScopeLookup } from '../../../types/dashboard/scope'
import { openEditorScope } from '../editor-route'

const params = { org: 'acme', project: 'core', workspace: 'sales', id: 'wf_1' }
const slugs = { org: 'acme', project: 'core', workspace: 'sales' }
const scope = {
  found: true,
  org: { org: { id: 'org_1' } },
  project: { project: { id: 'prj_2' } },
  workspace: { workspace: { id: 'ws_3' } },
} as unknown as ScopeLookup

function seededClient() {
  const client = new QueryClient()
  client.setQueryData(apiScopeQuery(slugs).queryKey, scope)
  return client
}

afterEach(() => {
  leaveRouteScope()
  useOrgStore.getState().clear()
})

describe('openEditorScope', () => {
  it('reuses the shell’s scope lookup, for the workspace slugs alone', async () => {
    useOrgStore.setState({ appReady: true })
    const client = seededClient()
    const ensure = vi.spyOn(client, 'ensureQueryData')
    await openEditorScope({ params, search: {}, preload: false }, client, true)
    expect(ensure.mock.calls[0]![0].queryKey).toEqual(apiScopeQuery(slugs).queryKey)
    expect(useOrgStore.getState().routeScope?.projectId).toBe('prj_2')
  })

  it('changes nothing on a hover preload, or on sample data', async () => {
    const client = seededClient()
    await openEditorScope({ params, search: {}, preload: true }, client, true)
    await openEditorScope({ params, search: { as: 'ama' }, preload: false }, client, true)
    expect(useOrgStore.getState().routeScope).toBeNull()
  })

  it('has no new-workflow page yet', async () => {
    const thrown = await openEditorScope(
      { params: { ...params, id: 'new' }, search: {}, preload: false },
      seededClient(),
      true,
    ).catch((error: unknown) => error)
    expect(isNotFound(thrown)).toBe(true)
  })

  it('fails the route when the lookup fails, so it can offer a retry', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    vi.spyOn(client, 'ensureQueryData').mockRejectedValue(new Error('offline'))
    await expect(
      openEditorScope({ params, search: {}, preload: false }, client, true),
    ).rejects.toThrow('offline')
  })
})
