import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ConnectionSummary } from '@awaitstep/ir'
import { ApiError } from '../../../lib/api-client'
import type { ApiMarketplaceNode } from '../../../lib/dashboard-api'
import { resetMockDb } from '../../../mocks/dashboard/db'
import { errorFieldOf } from '../errors'
import {
  useConnect,
  useConnections,
  useRemoveConnection,
  useReplaceToken,
  useUpdateConnection,
} from '../org-settings'
import { useInstallNode, useOrgNodes, useUninstallNode, useUpdateNode } from '../resources'
import { useProjectSetup } from '../setup'
import { MockScenarioProvider } from '../scenario-context'
import { DataSourceProvider, type DataSource } from '../source'
import type * as ProjectHooks from '../projects'

// Connections, nodes and the setup counts on both sources (B9): the API's
// `/connections`, `/marketplace` and `/projects/:id/setup`, and the dummy server.

vi.mock('../projects', async (importOriginal) => ({
  ...(await importOriginal<typeof ProjectHooks>()),
  // The scope read gives the id on the API; it isn't what these tests are about.
  useProjectId: (_org: string, project: string) => (project === 'project-101' ? 'p-101' : null),
}))

const fetchMock = vi.fn()

const ROW: ConnectionSummary = {
  id: 'conn_1',
  provider: 'cloudflare',
  name: 'Acme production',
  createdByName: 'Ama Mensah',
  accountSuffix: '7f2a',
  allProjects: false,
  projects: [{ id: 'p-101', name: 'Project 101', slug: 'project-101' }],
  hiddenProjects: 1,
  tokenStatus: 'active',
  tokenExpiresAt: '2026-11-05T12:00:00.000Z',
  tokenCheckedAt: '2026-10-30T12:00:00.000Z',
  deployments: { count: 18, lastAt: '2026-10-30T11:00:00.000Z' },
  createdAt: '2026-10-01T00:00:00.000Z',
  updatedAt: '2026-10-30T12:00:00.000Z',
}

const SLACK: ApiMarketplaceNode = {
  id: 'slack',
  name: 'Slack',
  description: 'Post messages',
  category: 'Messaging',
  author: 'awaitstep',
  latest: '2.4.0',
  installed: true,
  installedVersion: '2.3.0',
  usage: 3,
  inRegistry: true,
}

const STRIPE: ApiMarketplaceNode = {
  ...SLACK,
  id: 'stripe',
  name: 'Stripe',
  category: 'Payments',
  latest: '1.1.2',
  installed: false,
  installedVersion: null,
  usage: null,
}

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

function wrapperFor(source: DataSource, client = newClient()) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={client}>
        <DataSourceProvider source={source}>
          <MockScenarioProvider scenario="none" userId="usr_ama">
            {children}
          </MockScenarioProvider>
        </DataSourceProvider>
      </QueryClientProvider>
    )
  }
}

function newClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } })
}

const calls = () =>
  fetchMock.mock.calls.map(([url, init]) => [
    init?.method ?? 'GET',
    url,
    init?.body ? JSON.parse(init.body as string) : undefined,
  ])

describe('useConnections', () => {
  it('reads every page of GET /connections into cards', async () => {
    fetchMock.mockResolvedValueOnce(json({ data: [ROW], nextCursor: 'c2' })).mockResolvedValueOnce(
      json({
        data: [{ ...ROW, id: 'conn_2', allProjects: true, projects: [] }],
        nextCursor: null,
      }),
    )
    const { result } = renderHook(() => useConnections('acme'), { wrapper: wrapperFor('api') })
    await waitFor(() => expect(result.current.data).toBeDefined())
    expect(calls().map(([method, url]) => [method, url])).toEqual([
      ['GET', '/api/connections?org=acme'],
      ['GET', '/api/connections?org=acme&cursor=c2'],
    ])
    expect(result.current.data).toEqual([
      {
        id: 'conn_1',
        name: 'Acme production',
        accountSuffix: '7f2a',
        // The API names who added it, never their id.
        addedBy: { id: '', name: 'Ama Mensah' },
        authKind: 'api-token',
        tokenStatus: 'active',
        tokenExpiresAt: '2026-11-05T12:00:00.000Z',
        projects: [{ id: 'p-101', name: 'Project 101' }],
        hiddenProjects: 1,
        deployments: { count: 18, lastAt: '2026-10-30T11:00:00.000Z' },
      },
      expect.objectContaining({ id: 'conn_2', projects: 'all' }),
    ])
  })

  it('reads the dummy server off the API', async () => {
    const { result } = renderHook(() => useConnections('acme'), { wrapper: wrapperFor('mock') })
    await waitFor(() => expect(result.current.data).toBeDefined())
    expect(fetchMock).not.toHaveBeenCalled()
    expect(result.current.data?.map((c) => c.name)).toEqual([
      'Acme production',
      'Marketing sandbox',
    ])
    expect(result.current.data?.every((c) => c.tokenStatus === 'active')).toBe(true)
  })
})

describe('connection changes on the API', () => {
  it('connects with the token, the account and the projects', async () => {
    fetchMock.mockResolvedValue(json(ROW, 201))
    const { result } = renderHook(() => useConnect('acme'), { wrapper: wrapperFor('api') })
    await act(() =>
      result.current.mutateAsync({
        name: ' Acme production ',
        accountId: 'a'.repeat(32),
        token: ' tok ',
        projects: ['p-101'],
      }),
    )
    expect(calls()[0]).toEqual([
      'POST',
      '/api/connections?org=acme',
      {
        provider: 'cloudflare',
        name: 'Acme production',
        credentials: { accountId: 'a'.repeat(32), apiToken: 'tok' },
        allProjects: false,
        projectIds: ['p-101'],
      },
    ])
  })

  it('refreshes the old pages’ list too (deploy page, canvas dialogs)', async () => {
    fetchMock.mockResolvedValue(json(ROW, 201))
    const client = newClient()
    client.setQueryData(['connections', 'org-acme'], { pages: [], pageParams: [] })
    const { result } = renderHook(() => useConnect('acme'), {
      wrapper: wrapperFor('api', client),
    })
    await act(() =>
      result.current.mutateAsync({
        name: 'A',
        accountId: 'a'.repeat(32),
        token: 't',
        projects: 'all',
      }),
    )
    expect(client.getQueryState(['connections', 'org-acme'])?.isInvalidated).toBe(true)
  })

  it('puts a refused token under the token field', async () => {
    fetchMock.mockResolvedValue(
      json(
        { error: 'Cloudflare doesn’t accept this token, or it has expired', field: 'token' },
        400,
      ),
    )
    const { result } = renderHook(() => useConnect('acme'), { wrapper: wrapperFor('api') })
    await act(async () => {
      await result.current
        .mutateAsync({ name: 'A', accountId: 'a'.repeat(32), token: 't', projects: 'all' })
        .catch(() => undefined)
    })
    expect(result.current.error).toBeInstanceOf(ApiError)
    expect(errorFieldOf(result.current.error)).toBe('token')
  })

  it('replaces only the token, edits names and projects, and removes', async () => {
    fetchMock.mockImplementation(async () => json(ROW))
    const wrapper = wrapperFor('api')
    const replace = renderHook(() => useReplaceToken('acme'), { wrapper }).result
    const update = renderHook(() => useUpdateConnection('acme'), { wrapper }).result
    const remove = renderHook(() => useRemoveConnection('acme'), { wrapper }).result
    await act(() => replace.current.mutateAsync({ connectionId: 'conn_1', token: ' new ' }))
    await act(() =>
      update.current.mutateAsync({ connectionId: 'conn_1', update: { name: 'Prod' } }),
    )
    await act(() =>
      update.current.mutateAsync({ connectionId: 'conn_1', update: { projects: 'all' } }),
    )
    await act(() =>
      update.current.mutateAsync({ connectionId: 'conn_1', update: { projects: ['p-202'] } }),
    )
    await act(() => remove.current.mutateAsync('conn_1'))
    expect(calls()).toEqual([
      ['PATCH', '/api/connections/conn_1?org=acme', { credentials: { apiToken: 'new' } }],
      ['PATCH', '/api/connections/conn_1?org=acme', { name: 'Prod' }],
      ['PATCH', '/api/connections/conn_1?org=acme', { allProjects: true }],
      ['PATCH', '/api/connections/conn_1?org=acme', { allProjects: false, projectIds: ['p-202'] }],
      ['DELETE', '/api/connections/conn_1?org=acme', undefined],
    ])
  })
})

describe('useOrgNodes', () => {
  it('reads the marketplace into cards, installed versions and updates included', async () => {
    fetchMock.mockResolvedValue(json({ nodes: [SLACK, STRIPE] }))
    const { result } = renderHook(() => useOrgNodes('acme'), { wrapper: wrapperFor('api') })
    await waitFor(() => expect(result.current.data).toBeDefined())
    expect(calls()[0]?.slice(0, 2)).toEqual(['GET', '/api/marketplace?org=acme'])
    expect(result.current.data).toEqual([
      {
        id: 'slack',
        name: 'Slack',
        category: 'Messaging',
        description: 'Post messages',
        version: '2.3.0',
        source: 'marketplace',
        installed: true,
        usage: 3,
        latestVersion: '2.4.0',
        updateAvailable: true,
      },
      {
        id: 'stripe',
        name: 'Stripe',
        category: 'Payments',
        description: 'Post messages',
        version: '1.1.2',
        source: 'marketplace',
        installed: false,
        latestVersion: '1.1.2',
        updateAvailable: false,
      },
    ])
  })

  it('installs, updates and uninstalls through the marketplace routes', async () => {
    fetchMock.mockImplementation(async () => json({ ok: true }))
    const wrapper = wrapperFor('api')
    const install = renderHook(() => useInstallNode('acme'), { wrapper }).result
    const update = renderHook(() => useUpdateNode('acme'), { wrapper }).result
    const uninstall = renderHook(() => useUninstallNode('acme'), { wrapper }).result
    await act(() => install.current.mutateAsync('stripe'))
    await act(() => update.current.mutateAsync('slack'))
    await act(() => uninstall.current.mutateAsync('slack'))
    expect(calls()).toEqual([
      ['POST', '/api/marketplace/install?org=acme', { nodeId: 'stripe' }],
      ['POST', '/api/marketplace/update?org=acme', { nodeId: 'slack' }],
      ['POST', '/api/marketplace/uninstall?org=acme', { nodeId: 'slack' }],
    ])
  })
})

describe('useProjectSetup', () => {
  it('reads the counts by the project’s id on the API', async () => {
    const setup = {
      cloudflareConnected: true,
      orgVariables: 2,
      projectVariables: 1,
      projectKeys: 0,
    }
    fetchMock.mockResolvedValue(json(setup))
    const { result } = renderHook(() => useProjectSetup('acme', 'project-101'), {
      wrapper: wrapperFor('api'),
    })
    await waitFor(() => expect(result.current.data).toEqual(setup))
    expect(calls()[0]?.slice(0, 2)).toEqual(['GET', '/api/projects/p-101/setup?org=acme'])
  })

  it('waits for the project’s id', async () => {
    const { result } = renderHook(() => useProjectSetup('acme', 'unknown'), {
      wrapper: wrapperFor('api'),
    })
    expect(result.current.fetchStatus).toBe('idle')
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
