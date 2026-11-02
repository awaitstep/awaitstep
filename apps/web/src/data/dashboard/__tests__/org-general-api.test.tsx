import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { resetMockDb } from '../../../mocks/dashboard/db'
import { useUpdateOrg } from '../org-settings'
import { MockScenarioProvider } from '../scenario-context'
import { DataSourceProvider, type DataSource } from '../source'
import { useScope } from '../workspaces'

// Org Settings → General on the API: the logo is uploaded to its own route
// as the image's bytes, the name and URL go through better-auth's update,
// whose hook refuses a logo there.

const auth = vi.hoisted(() => ({ organization: { update: vi.fn() } }))

vi.mock('../../../lib/auth-client', () => ({ authClient: auth }))

const fetchMock = vi.fn()

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

const SCOPE = {
  found: true,
  org: {
    id: 'org-acme',
    slug: 'acme',
    name: 'Acme Inc',
    logo: '/api/images/img_old',
    createdAt: '2026-01-01T00:00:00.000Z',
    role: 'owner',
    viewerCan: {},
  },
}

beforeEach(() => {
  resetMockDb()
  vi.stubGlobal('fetch', fetchMock)
  auth.organization.update.mockReset()
})

afterEach(() => {
  vi.unstubAllGlobals()
  fetchMock.mockReset()
})

function wrapperFor(source: DataSource) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={client}>
        <DataSourceProvider source={source}>
          <MockScenarioProvider>{children}</MockScenarioProvider>
        </DataSourceProvider>
      </QueryClientProvider>
    )
  }
}

/** The hook, once the scope it reads the org's id from has loaded. */
async function renderUpdate() {
  fetchMock.mockResolvedValueOnce(json(SCOPE))
  const { result } = renderHook(
    () => ({ scope: useScope({ org: 'acme' }), update: useUpdateOrg('acme') }),
    {
      wrapper: wrapperFor('api'),
    },
  )
  await waitFor(() => expect(result.current.scope.data?.found).toBe(true))
  return result
}

const calls = () => fetchMock.mock.calls.slice(1).map(([url, init]) => [init?.method ?? 'GET', url])

describe('saving Org Settings → General on the API', () => {
  it('uploads a new logo as its bytes, and sends only the changed name to better-auth', async () => {
    const result = await renderUpdate()
    fetchMock.mockResolvedValueOnce(json({ logo: '/api/images/img_new' }))
    fetchMock.mockResolvedValue(json({}))
    auth.organization.update.mockResolvedValue({ data: {}, error: null })
    const logo = new Blob([new Uint8Array([0x89, 0x50])], { type: 'image/png' })

    let saved
    await act(async () => {
      saved = await result.current.update.mutateAsync({ name: 'Acme Corp', logo })
    })
    expect(calls()[0]).toEqual(['PUT', '/api/orgs/org-acme/logo'])
    expect(fetchMock.mock.calls[1]![1]).toMatchObject({
      body: logo,
      headers: { 'Content-Type': 'image/png' },
    })
    expect(auth.organization.update).toHaveBeenCalledWith({
      organizationId: 'org-acme',
      data: { name: 'Acme Corp' },
    })
    expect(saved).toMatchObject({ name: 'Acme Corp', logo: '/api/images/img_new' })
  })

  it('removes the logo with DELETE, and calls better-auth only when the name or URL changed', async () => {
    const result = await renderUpdate()
    fetchMock.mockResolvedValueOnce(json({ logo: null }))
    fetchMock.mockResolvedValue(json({}))
    let saved
    await act(async () => {
      saved = await result.current.update.mutateAsync({ name: 'Acme Inc', logo: null })
    })
    expect(calls()[0]).toEqual(['DELETE', '/api/orgs/org-acme/logo'])
    expect(auth.organization.update).not.toHaveBeenCalled()
    expect(saved).toMatchObject({ logo: null })
  })

  it('stops at a refused logo and puts the reason under the logo', async () => {
    const result = await renderUpdate()
    fetchMock.mockResolvedValueOnce(
      json({ error: 'The logo must be at most 4096 px on each side', field: 'logo' }, 400),
    )
    const failure = await result.current.update
      .mutateAsync({ name: 'Renamed', logo: new Blob(['x'], { type: 'image/png' }) })
      .catch((e: unknown) => e)
    expect(failure).toMatchObject({
      message: 'The logo must be at most 4096 px on each side',
      status: 400,
      field: 'logo',
    })
    expect(auth.organization.update).not.toHaveBeenCalled()
  })

  it('refetches the scope when the URL is refused after the logo was saved', async () => {
    const result = await renderUpdate()
    fetchMock.mockResolvedValueOnce(json({ logo: '/api/images/img_new' }))
    fetchMock.mockResolvedValue(
      json({ ...SCOPE, org: { ...SCOPE.org, logo: '/api/images/img_new' } }),
    )
    auth.organization.update.mockResolvedValue({
      data: null,
      error: { status: 400, message: 'Organization slug already taken' },
    })
    await result.current.update
      .mutateAsync({ slug: 'globex', logo: new Blob(['x'], { type: 'image/png' }) })
      .catch(() => {})
    // The old logo's path is gone: the page reads the new one rather than a 404.
    await waitFor(() =>
      expect(result.current.scope.data?.found && result.current.scope.data.org.org.logo).toBe(
        '/api/images/img_new',
      ),
    )
  })
})
