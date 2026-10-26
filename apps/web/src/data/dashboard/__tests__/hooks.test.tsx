import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it } from 'vitest'
import { resetMockDb } from '../../../mocks/dashboard/db'
import { useSetShared, useSharedWithWorkspace, useWorkspaceItems } from '../items'
import { useSetLock } from '../locks'
import { useCreateProject, useProjects } from '../projects'
import { useResetMockData } from '../reset'
import { useWorkspaceRuns } from '../runs'
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
})
