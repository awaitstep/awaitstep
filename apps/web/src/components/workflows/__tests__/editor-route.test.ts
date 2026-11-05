import { afterEach, describe, expect, it, vi } from 'vitest'
import { QueryClient } from '@tanstack/react-query'
import { isNotFound } from '@tanstack/react-router'
import { apiScopeQuery } from '../../../data/dashboard/workspaces'
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
  useOrgStore.getState().clear()
})

describe('openEditorScope', () => {
  it('reuses the shell’s scope lookup, for the workspace slugs alone', async () => {
    useOrgStore.setState({ appReady: true })
    const client = seededClient()
    const ensure = vi.spyOn(client, 'ensureQueryData')
    const context = await openEditorScope({ params, search: {} }, client, true)
    expect(ensure.mock.calls[0]![0].queryKey).toEqual(apiScopeQuery(slugs).queryKey)
    expect(context.itemScope).toEqual({
      organizationId: 'org_1',
      projectId: 'prj_2',
      workspaceId: 'ws_3',
    })
  })

  it('hands the ids down without touching the switcher', async () => {
    useOrgStore.setState({
      appReady: true,
      activeOrganizationId: 'org_9',
      activeProjectId: 'prj_9',
    })
    await openEditorScope({ params, search: {} }, seededClient(), true)
    expect(useOrgStore.getState().activeOrganizationId).toBe('org_9')
    expect(useOrgStore.getState().activeProjectId).toBe('prj_9')
  })

  it('has no project to call on sample data', async () => {
    const context = await openEditorScope({ params, search: { as: 'ama' } }, seededClient(), true)
    expect(context.itemScope).toBeNull()
  })

  it('has no new-workflow page yet', async () => {
    const thrown = await openEditorScope(
      { params: { ...params, id: 'new' }, search: {} },
      seededClient(),
      true,
    ).catch((error: unknown) => error)
    expect(isNotFound(thrown)).toBe(true)
  })

  it('fails the route when the lookup fails, so it can offer a retry', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    vi.spyOn(client, 'ensureQueryData').mockRejectedValue(new Error('offline'))
    await expect(openEditorScope({ params, search: {} }, client, true)).rejects.toThrow('offline')
  })
})
