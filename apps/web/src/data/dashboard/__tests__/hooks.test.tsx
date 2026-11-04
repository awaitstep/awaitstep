import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it } from 'vitest'
import { getDb as dashboardDb, resetMockDb } from '../../../mocks/dashboard/db'
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
import { useDecideEditRequest, useNotifications } from '../inbox'
import { useOrgMembers } from '../org-settings'
import { useRequestEditAccess } from '../requests'
import { useResetMockData } from '../reset'
import { useProjectSetup } from '../setup'
import { useFailingNow, useWorkspaceRuns } from '../runs'
import {
  MockScenarioProvider,
  type MockScenario,
  parseMockScenario,
  parseMockUser,
} from '../scenario-context'
import { useDeleteWorkspace, useScope, useUpdateWorkspace, useWorkspaces } from '../workspaces'

const sales = { org: 'acme', project: 'project-101', workspace: 'sales' }

function setup(options: { scenario?: MockScenario; userId?: string } = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={client}>
        <MockScenarioProvider scenario={options.scenario} userId={options.userId}>
          {children}
        </MockScenarioProvider>
      </QueryClientProvider>
    )
  }
  return { wrapper: Wrapper, client }
}

beforeEach(() => resetMockDb())

describe('dashboard hooks', () => {
  it('shows a created project in the list without a manual refetch', async () => {
    const { wrapper } = setup()
    const { result } = renderHook(
      () => ({ list: useProjects('acme'), create: useCreateProject('acme') }),
      { wrapper },
    )
    await waitFor(() => expect(result.current.list.data).toHaveLength(3))

    await act(() => result.current.create.mutateAsync({ name: 'Billing' }))

    await waitFor(() => expect(result.current.list.data?.map((p) => p.slug)).toContain('billing'))
  })

  it('flips the delete capability when the lock changes', async () => {
    const { wrapper } = setup()
    const { result } = renderHook(
      () => ({
        // Support: Sales stays undeletable after unlocking (IT calls its shared workflow).
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
    const { wrapper } = setup()
    const support = { ...sales, workspace: 'support' }
    const { result } = renderHook(
      () => ({
        scope: useScope(support),
        list: useWorkspaces('acme', 'project-101'),
        unlock: useSetLock({ level: 'project', org: 'acme', project: 'project-101' }),
        remove: useDeleteWorkspace(support),
      }),
      { wrapper },
    )
    await waitFor(() => expect(result.current.list.data).toHaveLength(3))
    await act(() => result.current.unlock.mutateAsync(false))

    await act(() => result.current.remove.mutateAsync())

    await waitFor(() => expect(result.current.list.data).toHaveLength(2))
    expect(result.current.scope.data?.found).toBe(true)
    expect(result.current.scope.isFetching).toBe(false)
  })

  it('keeps the old scope on screen after a URL change instead of refetching it', async () => {
    const { wrapper, client } = setup()
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
    const { wrapper } = setup()
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
    const updated = result.current.sales.data!.find((w) => w.id === quote.id)!
    expect(updated.sharing).not.toBeNull()
  })

  it('keeps the current runs page on screen while the next one loads', async () => {
    const { wrapper } = setup()
    const { result, rerender } = renderHook(
      ({ cursor }: { cursor?: string }) => useWorkspaceRuns(sales, { limit: 8, cursor }),
      { wrapper, initialProps: {} },
    )
    await waitFor(() => expect(result.current.data?.data).toHaveLength(8))
    const first = result.current.data!

    rerender({ cursor: first.nextCursor! })

    expect(result.current.data).toBe(first)
    expect(result.current.isPlaceholderData).toBe(true)
    await waitFor(() => expect(result.current.data?.data[0]?.id).not.toBe(first.data[0]!.id))
  })

  it('drops a revoked key from the list and the setup count', async () => {
    const { wrapper } = setup()
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

  it('shows a moved project’s failures on its new org’s home', async () => {
    dashboardDb().projects.find((p) => p.id === 'prj_101')!.lock = null
    const { wrapper } = setup()
    const { result } = renderHook(
      () => ({ failing: useFailingNow('bolt-labs'), move: useMoveProject('acme', 'project-101') }),
      { wrapper },
    )
    await waitFor(() => expect(result.current.failing.data).toEqual([]))

    await act(() => result.current.move.mutateAsync('bolt-labs'))

    await waitFor(() => expect(result.current.failing.data?.length).toBeGreaterThan(0))
  })

  it('refreshes a workspace’s variables and keys after it is renamed', async () => {
    const { wrapper } = setup()
    const { result } = renderHook(
      () => ({
        variables: useWorkspaceVariables(sales),
        keys: useWorkspaceKeys(sales),
        rename: useUpdateWorkspace(sales),
      }),
      { wrapper },
    )
    await waitFor(() => expect(result.current.variables.data?.[0]?.source.name).toBe('Sales'))
    await waitFor(() =>
      expect(result.current.keys.data?.own[0]?.workspaces[0]?.workspace.name).toBe('Sales'),
    )

    await act(() => result.current.rename.mutateAsync({ name: 'Sales EU' }))

    await waitFor(() => expect(result.current.variables.data?.[0]?.source.name).toBe('Sales EU'))
    await waitFor(() =>
      expect(result.current.keys.data?.own[0]?.workspaces[0]?.workspace.name).toBe('Sales EU'),
    )
  })

  it('drops a revoked project key from the workspace’s project keys', async () => {
    const { wrapper } = setup()
    const { result } = renderHook(
      () => ({
        keys: useWorkspaceKeys(sales),
        revoke: useRevokeProjectKey('acme', 'project-101'),
      }),
      { wrapper },
    )
    const fromProject = () =>
      result.current.keys.data?.reaching.filter((k) => k.level === 'project')
    await waitFor(() => expect(fromProject()).toHaveLength(4))
    await act(() => result.current.revoke.mutateAsync('key_ci'))
    await waitFor(() => expect(fromProject()).toHaveLength(3))
  })

  it('refreshes the org page when a project drops its slice of a shared bundle', async () => {
    const { wrapper } = setup()
    const { result } = renderHook(
      () => ({
        org: useOrgKeys('acme'),
        revoke: useRevokeProjectKeyScope('acme', 'project-101'),
      }),
      { wrapper },
    )
    // "Platform sync" is homed at the org and reaches P101 + Marketing.
    const p101Slice = () =>
      result.current.org.data
        ?.find((k) => k.id === 'key_platform')
        ?.projects.find((p) => p.slug === 'project-101')?.revokedAt
    await waitFor(() => expect(p101Slice()).toBeNull())
    await act(() => result.current.revoke.mutateAsync('key_platform'))
    // Without invalidating the org list, its cached copy would still show P101 live.
    await waitFor(() => expect(p101Slice()).not.toBeNull())
  })

  it('refreshes a project’s keys and count when an org bundle is revoked whole', async () => {
    const { wrapper } = setup()
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

  it('lists a moved project under its new org', async () => {
    const { wrapper } = setup()
    const { result } = renderHook(
      () => ({ bolt: useProjects('bolt-labs'), move: useMoveProject('acme', 'internal-tools') }),
      { wrapper },
    )
    await waitFor(() => expect(result.current.bolt.data).toHaveLength(1))

    await act(() => result.current.move.mutateAsync('bolt-labs'))

    await waitFor(() => expect(result.current.bolt.data).toHaveLength(2))
  })

  it('runs as the person and scenario the provider names', async () => {
    const { wrapper } = setup({ scenario: 'viewer', userId: parseMockUser('daniel') })
    const { result } = renderHook(() => useScope(sales), { wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    const lookup = result.current.data!
    expect(lookup.found && lookup.workspace?.viewerRole).toBe('viewer')
  })

  it('surfaces the error scenario as a query error with a request id', async () => {
    const { wrapper } = setup({ scenario: 'error' })
    const { result } = renderHook(
      () => ({ projects: useProjects('acme'), workspaces: useWorkspaces('acme', 'project-101') }),
      { wrapper },
    )
    await waitFor(() => expect(result.current.projects.isError).toBe(true))
    expect(result.current.projects.error).toMatchObject({ errorId: expect.stringMatching(/^req_/) })
    await waitFor(() => expect(result.current.workspaces.data).toHaveLength(3))
  })

  it('resets the dummy data and refetches', async () => {
    const { wrapper } = setup()
    const { result } = renderHook(
      () => ({
        list: useProjects('acme'),
        create: useCreateProject('acme'),
        reset: useResetMockData(),
      }),
      { wrapper },
    )
    await act(() => result.current.create.mutateAsync({ name: 'Billing' }))
    await waitFor(() => expect(result.current.list.data).toHaveLength(4))

    await act(() => result.current.reset())

    await waitFor(() => expect(result.current.list.data).toHaveLength(3))
  })
})

describe('URL parsing for the dummy session', () => {
  it('accepts the known scenarios and falls back to none', () => {
    expect(parseMockScenario('loading')).toBe('loading')
    expect(parseMockScenario('viewer')).toBe('viewer')
    expect(parseMockScenario('nope')).toBe('none')
    expect(parseMockScenario(undefined)).toBe('none')
  })

  it('maps a first name to a sample person and falls back to Ama', () => {
    expect(parseMockUser('Daniel')).toBe('usr_daniel')
    expect(parseMockUser('tomas')).toBe('usr_tomas')
    expect(parseMockUser('Tomás')).toBe('usr_tomas')
    expect(parseMockUser('nobody')).toBe('usr_ama')
    expect(parseMockUser(3)).toBe('usr_ama')
  })

  it('puts a new edit request in the asked admin’s Inbox, even one already loaded', async () => {
    // One client for the tab: switching ?as= from Priya to Ama reuses the cache.
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const as = (userId: string) =>
      function Wrapper({ children }: { children: ReactNode }) {
        return (
          <QueryClientProvider client={client}>
            <MockScenarioProvider userId={userId}>{children}</MockScenarioProvider>
          </QueryClientProvider>
        )
      }
    dashboardDb().editRequests = []
    const inbox = renderHook(() => useNotifications('acme'), { wrapper: as('usr_ama') })
    await waitFor(() => expect(inbox.result.current.data).toBeDefined())
    const ask = renderHook(() => useRequestEditAccess(sales), { wrapper: as('usr_priya') })
    await act(() => ask.result.current.mutateAsync())
    await waitFor(() =>
      expect(inbox.result.current.data!.list.some((n) => n.kind === 'request')).toBe(true),
    )
  })

  it('shows an approved asker’s new role on org Members', async () => {
    const { wrapper } = setup()
    const members = renderHook(() => useOrgMembers('acme'), { wrapper })
    await waitFor(() => expect(members.result.current.data).toBeDefined())
    const before = JSON.stringify(
      members.result.current.data!.find((m) => m.person.id === 'usr_priya'),
    )
    const decide = renderHook(() => useDecideEditRequest('acme'), { wrapper })
    await act(() =>
      decide.result.current.mutateAsync({ id: 'req_priya_sales', decision: 'approve' }),
    )
    await waitFor(() =>
      expect(
        JSON.stringify(members.result.current.data!.find((m) => m.person.id === 'usr_priya')),
      ).not.toBe(before),
    )
  })
})
