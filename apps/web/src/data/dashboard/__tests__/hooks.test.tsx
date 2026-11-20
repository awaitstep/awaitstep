import { act, renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import {
  asWorkspaceRole,
  createTestQueryClient,
  dashboardApiWrapper,
  installFakeApi,
  type FakeApi,
} from '../../../__tests__/fake-api'
import {
  useOrgKeys,
  useProjectKeys,
  useRevokeOrgKey,
  useRevokeProjectKey,
  useRevokeProjectKeyScope,
  useWorkspaceKeys,
} from '../api-keys'
import { useWorkspaceVariables } from '../variables'
import { useSetShared, useSharedWithWorkspace, useWorkspaceItems } from '../items'
import { useSetLock } from '../locks'
import { useCreateProject, useMoveProject, useProjects } from '../projects'
import { useProjectSetup } from '../setup'
import { useFailingNow, useWorkspaceRuns } from '../runs'
import { useDeleteWorkspace, useScope, useUpdateWorkspace, useWorkspaces } from '../workspaces'

// What each write leaves stale, on the API: the reads it must refetch (and
// the ones it must not), counted off the requests the fake API received.

const sales = { org: 'acme', project: 'project-101', workspace: 'sales' }
const P101 = 'acme/project-101'

function setup(api: FakeApi = installFakeApi()) {
  const client = createTestQueryClient()
  return { api, client, wrapper: dashboardApiWrapper(client) }
}

/** How many times `route` was read from here on. */
function counter(api: FakeApi, route: string) {
  const before = api.requestsTo(route).length
  return () => api.requestsTo(route).length - before
}

/** Revokes a key whole, as the API would: it leaves every list and the setup count. */
function scriptRevoke(api: FakeApi) {
  api.on('DELETE /api-keys/:id', (req) => {
    api.data.seed.keys = api.data.seed.keys.filter((k) => k.id !== req.params.id)
    api.data.projectSetup.prj_101!.projectKeys -= 1
    return {}
  })
}

describe('dashboard hooks', () => {
  it('shows a created project in the list without a manual refetch', async () => {
    const { api, wrapper } = setup()
    api.on('POST /projects', () => {
      const p101 = api.data.projects[P101]!
      api.data.projects['acme/billing'] = {
        ...p101,
        id: 'prj_billing',
        slug: 'billing',
        name: 'Billing',
      }
      return {
        id: 'prj_billing',
        organizationId: 'org_acme',
        slug: 'billing',
        name: 'Billing',
        description: null,
        createdAt: api.now.toISOString(),
        updatedAt: api.now.toISOString(),
        defaultWorkspace: { ...api.data.workspaces[`${P101}/sales`]!, slug: 'default' },
      }
    })
    const { result } = renderHook(
      () => ({ list: useProjects('acme'), create: useCreateProject('acme') }),
      { wrapper },
    )
    await waitFor(() => expect(result.current.list.data).toHaveLength(3))
    await act(() => result.current.create.mutateAsync({ name: 'Billing' }))
    await waitFor(() => expect(result.current.list.data?.map((p) => p.slug)).toContain('billing'))
  })

  it('flips the delete capability when the lock changes', async () => {
    const api = installFakeApi()
    asWorkspaceRole(api, `${P101}/support`, 'admin')
    api.on('PUT /projects/:id/lock', () => {
      api.data.projects[P101]!.lock = null
      asWorkspaceRole(api, `${P101}/support`, 'admin')
      return { lock: null }
    })
    const { wrapper } = setup(api)
    const { result } = renderHook(
      () => ({
        scope: useScope({ ...sales, workspace: 'support' }),
        lock: useSetLock({ level: 'project', org: 'acme', project: 'project-101' }),
      }),
      { wrapper },
    )
    const deleteReason = () =>
      result.current.scope.data?.found
        ? result.current.scope.data.workspace?.viewerCan.delete
        : null
    await waitFor(() => expect(deleteReason()?.reason).toBe('Locked by Project 101'))
    await act(() => result.current.lock.mutateAsync(false))
    await waitFor(() => expect(deleteReason()?.allowed).toBe(true))
  })

  it('doesn’t refetch a deleted workspace’s scope into Not found under the page still showing it', async () => {
    const { api, wrapper } = setup()
    const support = { ...sales, workspace: 'support' }
    api.on('DELETE /workspaces/:id', () => {
      delete api.data.workspaces[`${P101}/support`]
      return { ok: true }
    })
    const { result } = renderHook(
      () => ({
        scope: useScope(support),
        list: useWorkspaces('acme', 'project-101'),
        remove: useDeleteWorkspace(support),
      }),
      { wrapper },
    )
    await waitFor(() => expect(result.current.list.data).toHaveLength(3))
    const scopeReads = counter(api, 'GET /scope')
    await act(() => result.current.remove.mutateAsync())
    await waitFor(() => expect(result.current.list.data).toHaveLength(2))
    expect(result.current.scope.data?.found).toBe(true)
    expect(result.current.scope.isFetching).toBe(false)
    expect(scopeReads()).toBe(0)
  })

  it('keeps the old scope on screen after a URL change instead of refetching it', async () => {
    const { api, client, wrapper } = setup()
    api.on('PATCH /workspaces/:id', () => ({
      ...api.data.workspaces[`${P101}/sales`]!,
      slug: 'sales-team',
    }))
    const { result } = renderHook(
      () => ({ scope: useScope(sales), update: useUpdateWorkspace(sales) }),
      { wrapper },
    )
    await waitFor(() => expect(result.current.scope.data?.found).toBe(true))
    await act(() => result.current.update.mutateAsync({ slug: 'sales-team' }))
    await waitFor(() => expect(client.isFetching()).toBe(0))
    expect(result.current.scope.data?.found).toBe(true)
    expect(result.current.scope.isFetching).toBe(false)
  })

  it('shows a workflow shared in Sales under IT’s “Shared with” without a refetch', async () => {
    const { api, wrapper } = setup()
    api.on('PUT /workflows/:id/share', (req) => {
      const item = api.data.seed.items.find((i) => i.id === req.params.id)!
      item.sharing = { sharedAt: api.now.toISOString(), sharedBy: api.viewer }
      return {
        sharing: { sharedAt: item.sharing.sharedAt, sharedBy: { id: api.viewer, name: 'Ama' } },
      }
    })
    const it_ = { ...sales, workspace: 'it' }
    const { result } = renderHook(
      () => ({
        sales: useWorkspaceItems(sales, 'workflow'),
        sharedWithIt: useSharedWithWorkspace(it_),
        share: useSetShared(sales),
      }),
      { wrapper },
    )
    await waitFor(() => expect(result.current.sales.data).toHaveLength(4))
    const quote = result.current.sales.data!.find((w) => w.name === 'Quote follow-up')!
    await act(() => result.current.share.mutateAsync({ itemId: quote.id, shared: true }))
    await waitFor(() =>
      expect(result.current.sharedWithIt.data?.map((s) => s.name)).toContain('Quote follow-up'),
    )
    expect(result.current.sales.data!.find((w) => w.id === quote.id)!.sharing).not.toBeNull()
  })

  it('keeps the current runs page on screen while the next one loads', async () => {
    const { wrapper } = setup()
    const { result, rerender } = renderHook(
      ({ cursor }: { cursor?: string }) => useWorkspaceRuns(sales, { limit: 4, cursor }),
      { wrapper, initialProps: {} },
    )
    await waitFor(() => expect(result.current.data?.data).toHaveLength(4))
    const first = result.current.data!
    rerender({ cursor: first.nextCursor! })
    expect(result.current.data).toBe(first)
    expect(result.current.isPlaceholderData).toBe(true)
    await waitFor(() => expect(result.current.data?.data[0]?.id).not.toBe(first.data[0]!.id))
  })

  it('drops a revoked key from the list and the setup count', async () => {
    const { api, wrapper } = setup()
    scriptRevoke(api)
    const { result } = renderHook(
      () => ({
        keys: useProjectKeys('acme', 'project-101'),
        setup: useProjectSetup('acme', 'project-101'),
        revoke: useRevokeProjectKey('acme', 'project-101'),
      }),
      { wrapper },
    )
    await waitFor(() => expect(result.current.setup.data?.projectKeys).toBe(4))
    await act(() => result.current.revoke.mutateAsync('key_ci'))
    await waitFor(() => expect(result.current.setup.data?.projectKeys).toBe(3))
    expect(result.current.keys.data?.own.map((k) => k.id)).not.toContain('key_ci')
  })

  it('reads the new org’s Failing now again after a project moves there', async () => {
    const { api, wrapper } = setup()
    api.on('POST /projects/:id/move', { ok: true })
    const { result } = renderHook(
      () => ({ failing: useFailingNow('bolt-labs'), move: useMoveProject('acme', 'project-101') }),
      { wrapper },
    )
    await waitFor(() => expect(result.current.failing.data).toEqual([]))
    const reads = counter(api, 'GET /failing')
    await act(() => result.current.move.mutateAsync('bolt-labs'))
    await waitFor(() => expect(reads()).toBeGreaterThan(0))
  })

  it('refreshes a workspace’s variables and keys after it is renamed', async () => {
    const { api, wrapper } = setup()
    api.on('PATCH /workspaces/:id', () => ({
      ...api.data.workspaces[`${P101}/sales`]!,
      name: 'Sales EU',
    }))
    const { result } = renderHook(
      () => ({
        variables: useWorkspaceVariables(sales),
        keys: useWorkspaceKeys(sales),
        rename: useUpdateWorkspace(sales),
      }),
      { wrapper },
    )
    await waitFor(() => expect(result.current.variables.data).toBeDefined())
    await waitFor(() => expect(result.current.keys.data).toBeDefined())
    const variableReads = counter(api, 'GET /env-vars/resolved')
    const keyReads = counter(api, 'GET /api-keys')
    await act(() => result.current.rename.mutateAsync({ name: 'Sales EU' }))
    await waitFor(() => expect(variableReads()).toBeGreaterThan(0))
    await waitFor(() => expect(keyReads()).toBeGreaterThan(0))
  })

  it('drops a revoked project key from the workspace’s project keys', async () => {
    const { api, wrapper } = setup()
    scriptRevoke(api)
    const { result } = renderHook(
      () => ({
        keys: useWorkspaceKeys(sales),
        revoke: useRevokeProjectKey('acme', 'project-101'),
      }),
      { wrapper },
    )
    const fromProject = () =>
      result.current.keys.data?.reaching.filter((k) => k.level === 'project')
    await waitFor(() => expect(fromProject()?.map((k) => k.id)).toContain('key_ci'))
    await act(() => result.current.revoke.mutateAsync('key_ci'))
    await waitFor(() => expect(fromProject()?.map((k) => k.id)).not.toContain('key_ci'))
  })

  it('refreshes the org page when a project drops its slice of a shared bundle', async () => {
    const { api, wrapper } = setup()
    api.on('DELETE /api-keys/:id/scope', {})
    const { result } = renderHook(
      () => ({
        org: useOrgKeys('acme'),
        revoke: useRevokeProjectKeyScope('acme', 'project-101'),
      }),
      { wrapper },
    )
    await waitFor(() => expect(result.current.org.data).toBeDefined())
    const reads = counter(api, 'GET /api-keys')
    await act(() => result.current.revoke.mutateAsync('key_platform'))
    // Without invalidating the org list, its cached copy would still show the slice live.
    await waitFor(() => expect(reads()).toBeGreaterThan(0))
  })

  it('refreshes a project’s keys and count when an org bundle is revoked whole', async () => {
    const { api, wrapper } = setup()
    scriptRevoke(api)
    const { result } = renderHook(
      () => ({
        project: useProjectKeys('acme', 'project-101'),
        setup: useProjectSetup('acme', 'project-101'),
        revoke: useRevokeOrgKey('acme'),
      }),
      { wrapper },
    )
    await waitFor(() =>
      expect(result.current.project.data?.reaching.map((k) => k.id)).toContain('key_platform'),
    )
    await waitFor(() => expect(result.current.setup.data?.projectKeys).toBe(4))
    await act(() => result.current.revoke.mutateAsync('key_platform'))
    await waitFor(() =>
      expect(result.current.project.data?.reaching.map((k) => k.id)).not.toContain('key_platform'),
    )
    await waitFor(() => expect(result.current.setup.data?.projectKeys).toBe(3))
  })

  it('reads the new org’s projects again after a project moves there', async () => {
    const { api, wrapper } = setup()
    api.on('POST /projects/:id/move', { ok: true })
    const { result } = renderHook(
      () => ({ bolt: useProjects('bolt-labs'), move: useMoveProject('acme', 'internal-tools') }),
      { wrapper },
    )
    await waitFor(() => expect(result.current.bolt.data).toHaveLength(1))
    const reads = counter(api, 'GET /projects')
    await act(() => result.current.move.mutateAsync('bolt-labs'))
    await waitFor(() => expect(reads()).toBeGreaterThan(0))
  })
})
