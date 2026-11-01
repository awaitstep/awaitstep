import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getDb as dashboardDb, resetMockDb, withoutSynthetic } from '../../../mocks/dashboard/db'
import { mockServer } from '../../../mocks/dashboard/server'
import { NOT_CONNECTED } from '../../../mocks/dashboard/scenario'
import { useProjectVariables } from '../variables'
import { useCreateWorkspace, useScope, useWorkspaces } from '../workspaces'
import { MockScenarioProvider } from '../scenario-context'
import { DataSourceProvider, notYet, useDashKey, type DataSource } from '../source'

const real = { scenario: 'empty' as const, userId: 'user-real', real: true }

const yes = { allowed: true }

/** A workspace as GET /workspaces lists it. */
function workspaceRow(slug: string) {
  return {
    id: `ws-${slug}`,
    projectId: 'p-1',
    slug,
    name: slug,
    description: null,
    colour: 'green',
    createdAt: '2026-10-20T00:00:00.000Z',
    updatedAt: '2026-10-20T00:00:00.000Z',
    createdBy: null,
    lock: null,
    inheritedLock: null,
    counts: { workflows: 0, deployed: 0, functions: 0, runs24h: 0, failing: 0, lastRunAt: null },
    members: [],
    viewerRole: 'admin',
    viewerCan: Object.fromEntries(
      [
        'edit',
        'deploy',
        'run',
        'share',
        'manageSettings',
        'manageMembers',
        'manageKeys',
        'manageVariables',
        'toggleLock',
        'delete',
      ].map((c) => [c, yes]),
    ),
  }
}

function setup(source: DataSource) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={client}>
        <DataSourceProvider source={source}>
          <MockScenarioProvider scenario={real.scenario} userId={real.userId} real>
            {children}
          </MockScenarioProvider>
        </DataSourceProvider>
      </QueryClientProvider>
    )
  }
  return { wrapper: Wrapper, client }
}

describe('the dummy server on the real API', () => {
  beforeEach(() => resetMockDb())

  it('answers a feature still on dummy data with nothing, even for a fixture’s slug', async () => {
    const keys = await mockServer.keys.listProjectKeys(real, 'real-org', 'real-project')
    expect(keys).toEqual({ keys: [], workspaceKeys: [] })
    // Acme is a fixture org; a real org with the same slug is not it.
    const acme = await mockServer.keys.listProjectKeys(real, 'acme', 'project-101')
    expect(acme).toEqual({ keys: [], workspaceKeys: [] })
    // The scope it made up is the viewer's, so a dialog can name where it is.
    const scope = await mockServer.workspaces.getScope(real, {
      org: 'real-org',
      project: 'real-project',
      workspace: 'main',
    })
    expect(scope.found).toBe(true)
    if (scope.found) {
      expect(scope.org.org.slug).toBe('real-org')
      expect(scope.workspace?.workspace.name).toBe('main')
      expect(scope.project?.viewerCan.manageKeys.allowed).toBe(true)
    }
  })

  it('refuses to write', async () => {
    await expect(
      mockServer.workspaces.createWorkspace(real, 'real-org', 'real-project', {
        name: 'X',
        colour: 'green',
        access: { kind: 'admins' },
      }),
    ).rejects.toThrow(NOT_CONNECTED)
  })

  it('knows the viewer by their real id', async () => {
    const viewer = await mockServer.session.getViewer(real)
    expect(viewer).toMatchObject({ id: 'user-real', name: 'You' })
  })

  it('never saves what it made up, even when a dummy write follows in the same tab', async () => {
    await mockServer.keys.listProjectKeys(real, 'real-org', 'real-project')
    await mockServer.session.getViewer(real)
    expect(dashboardDb().orgs.some((o) => o.id === 'real:real-org')).toBe(true)
    const saved = withoutSynthetic(dashboardDb())
    expect(saved.orgs.some((o) => o.id === 'real:real-org')).toBe(false)
    expect(saved.projects.some((p) => p.orgId === 'real:real-org')).toBe(false)
    expect(saved.workspaces.some((w) => w.id.startsWith('real:'))).toBe(false)
    expect(saved.people.some((p) => p.id === 'user-real')).toBe(false)
    expect(saved.orgMembers.some((m) => m.orgId === 'real:real-org')).toBe(false)
    // The fixtures are untouched.
    expect(saved.orgs.length).toBe(dashboardDb().orgs.length - 1)
  })
})

describe('hooks on the API', () => {
  const fetchMock = vi.fn()

  beforeEach(() => {
    resetMockDb()
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => vi.unstubAllGlobals())

  function answer(body: unknown, init: ResponseInit = {}) {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify(body), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
        ...init,
      }),
    )
  }

  it('resolves the scope through GET /scope and shapes it for the pages', async () => {
    answer({
      found: false,
      notFound: { kind: 'project', slug: 'nope', parent: { name: 'Acme', slug: 'acme' } },
    })
    const { wrapper } = setup('api')
    const { result } = renderHook(() => useScope({ org: 'acme', project: 'nope' }), { wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data).toEqual({
      found: false,
      notFound: { kind: 'project', slug: 'nope', parent: { name: 'Acme', slug: 'acme' } },
    })
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/scope?org=acme&project=nope')
  })

  it('lists workspaces by slugs and keeps the API cache apart from the dummy one', async () => {
    answer({ data: [] })
    const { wrapper } = setup('api')
    const { result } = renderHook(() => useWorkspaces('acme', 'p'), { wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data).toEqual([])
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/workspaces?org=acme&project=p')

    const { result: key } = renderHook(() => useDashKey()(['dash', 'x']), { wrapper })
    expect(key.current).toEqual(['dash', 'x', 'api'])
  })

  it('creates a workspace through POST /workspaces, past the siblings’ slugs, and answers with the new row', async () => {
    // The hook reads the siblings first, to step the slug past them.
    answer({ data: [workspaceRow('ops')] })
    answer(
      {
        id: 'ws-new',
        projectId: 'p-1',
        slug: 'ops',
        name: 'Ops',
        description: null,
        colour: 'amber',
        createdBy: 'user-real',
        createdAt: '2026-10-28T00:00:00.000Z',
        updatedAt: '2026-10-28T00:00:00.000Z',
      },
      { status: 201 },
    )
    const { wrapper } = setup('api')
    const { result } = renderHook(() => useCreateWorkspace('acme', 'p'), { wrapper })
    const created = await result.current.mutateAsync({
      name: ' Ops ',
      colour: 'amber',
      access: { kind: 'admins' },
    })
    expect(created).toMatchObject({ id: 'ws-new', slug: 'ops', initial: 'O' })
    const [url, init] = fetchMock.mock.calls[1] as [string, RequestInit]
    expect(url).toBe('/api/workspaces?org=acme&project=p')
    expect(JSON.parse(init.body as string)).toEqual({ name: 'Ops', slug: 'ops-2', colour: 'amber' })
  })

  it('surfaces the server’s error and request id', async () => {
    answer({ data: [] })
    answer(
      { error: 'Validation failed', details: [{ path: 'slug', message: 'Taken' }] },
      { status: 422, headers: { 'Content-Type': 'application/json', 'X-Request-Id': 'req-9' } },
    )
    const { wrapper } = setup('api')
    const { result } = renderHook(() => useCreateWorkspace('acme', 'p'), { wrapper })
    await expect(
      result.current.mutateAsync({ name: 'X', colour: 'green', access: { kind: 'admins' } }),
    ).rejects.toMatchObject({ message: 'Taken', status: 422, field: 'slug', requestId: 'req-9' })
  })

  it('reads a project’s resolved variables through GET /env-vars/resolved and hides secrets', async () => {
    answer({
      data: [
        {
          id: 'v-1',
          level: 'project',
          organizationId: 'org-1',
          projectId: 'p-1',
          workspaceId: null,
          name: 'SLACK_TOKEN',
          value: '••••••••',
          isSecret: true,
          createdBy: 'user-real',
          createdAt: '2026-10-20T00:00:00.000Z',
          updatedAt: '2026-10-20T00:00:00.000Z',
          setAt: { level: 'project', id: 'p-1', name: 'Project 101' },
          overriddenIn: [{ id: 'ws-sales', slug: 'sales', name: 'Sales', colour: 'blue' }],
          reach: { all: true, places: [], blocked: [] },
        },
      ],
    })
    const { wrapper } = setup('api')
    const { result } = renderHook(() => useProjectVariables('acme', 'p'), { wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data).toEqual([
      {
        id: 'v-1',
        name: 'SLACK_TOKEN',
        value: null,
        isSecret: true,
        setAt: { level: 'project', name: 'Project 101' },
        overriddenIn: [{ id: 'ws-sales', slug: 'sales', name: 'Sales', colour: 'blue' }],
        reach: { all: true, places: [], blocked: [] },
      },
    ])
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/env-vars/resolved?org=acme&project=p')
  })

  it('names what is not connected yet', async () => {
    await expect(notYet()).rejects.toMatchObject({ status: 501 })
  })
})
