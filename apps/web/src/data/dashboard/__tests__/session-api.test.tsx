import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { orgOpenedAt, rememberOrg } from '../../../components/navigation/scope-memory'
import { useOrgStore } from '../../../stores/org-store'
import { errorFieldOf } from '../errors'
import { useCreateOrg, useOrgs } from '../session'

// /dashboard's reads and its one write: the org list with this browser's
// "opened" times, and Create an organization through better-auth.

const auth = vi.hoisted(() => ({ organization: { create: vi.fn() } }))

vi.mock('../../../lib/auth-client', () => ({ authClient: auth }))

const fetchMock = vi.fn()

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

const ACME_ROW = {
  id: 'org-acme',
  slug: 'acme',
  name: 'Acme Inc',
  logo: '',
  createdAt: '2026-01-01T00:00:00.000Z',
  role: 'member',
  projectCount: 1,
  memberCount: 6,
  viewerCan: {},
  grants: {
    projects: [],
    workspaces: [{ name: 'Sales', projectName: 'Project 101', role: 'editor' }],
  },
  health: { failing: 1, lastRunAt: '2026-10-31T11:55:00.000Z' },
}

beforeEach(() => {
  localStorage.clear()
  vi.stubGlobal('fetch', fetchMock)
  auth.organization.create.mockReset()
  useOrgStore.getState().clear()
})

afterEach(() => {
  vi.unstubAllGlobals()
  fetchMock.mockReset()
})

function wrapperFor() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>
  }
}

describe('useOrgs on the API', () => {
  it('keeps grants and health and adds when this browser last opened each org', async () => {
    rememberOrg('acme', undefined, new Date('2026-10-31T10:00:00.000Z'))
    fetchMock.mockResolvedValueOnce(
      json({ data: [ACME_ROW, { ...ACME_ROW, id: 'org-g', slug: 'globex', name: 'Globex' }] }),
    )
    const { result } = renderHook(() => useOrgs(), { wrapper: wrapperFor() })
    await waitFor(() => expect(result.current.data).toBeDefined())
    expect(result.current.data).toMatchObject([
      {
        slug: 'acme',
        logo: null,
        lastOpenedAt: '2026-10-31T10:00:00.000Z',
        grants: ACME_ROW.grants,
        health: ACME_ROW.health,
      },
      { slug: 'globex', lastOpenedAt: null },
    ])
  })
})

describe('useCreateOrg', () => {
  it('creates through better-auth with the slugified name and tells the old pages', async () => {
    auth.organization.create.mockResolvedValueOnce({
      data: { id: 'org-new', slug: 'globex-labs', name: 'Globex Labs' },
      error: null,
    })
    fetchMock.mockResolvedValue(json({ data: [] }))
    const { result } = renderHook(() => useCreateOrg(), { wrapper: wrapperFor() })
    let created: { slug: string } | undefined
    await act(async () => {
      created = await result.current.mutateAsync('  Globex Labs ')
    })
    expect(auth.organization.create).toHaveBeenCalledWith({
      name: 'Globex Labs',
      slug: 'globex-labs',
    })
    expect(created).toEqual({ slug: 'globex-labs' })
    expect(useOrgStore.getState().organizations.map((o) => o.slug)).toEqual(['globex-labs'])
    // With no valid active org, the old pages get the new one; and it's remembered as opened.
    expect(useOrgStore.getState().activeOrganizationId).toBe('org-new')
    expect(orgOpenedAt('globex-labs')).not.toBeNull()
  })

  it('keeps the old pages on the org they had active', async () => {
    useOrgStore
      .getState()
      .setOrganizations([{ id: 'org-acme', slug: 'acme', name: 'Acme Inc' } as never])
    useOrgStore.getState().setActiveOrganization('org-acme')
    auth.organization.create.mockResolvedValueOnce({
      data: { id: 'org-new', slug: 'globex-labs', name: 'Globex Labs' },
      error: null,
    })
    fetchMock.mockResolvedValue(json({ data: [] }))
    const { result } = renderHook(() => useCreateOrg(), { wrapper: wrapperFor() })
    await act(async () => {
      await result.current.mutateAsync('Globex Labs')
    })
    expect(useOrgStore.getState().activeOrganizationId).toBe('org-acme')
  })

  it('puts a taken or reserved URL under the name field', async () => {
    auth.organization.create.mockResolvedValueOnce({
      data: null,
      error: { message: 'Organization slug already exists', status: 400 },
    })
    const { result } = renderHook(() => useCreateOrg(), { wrapper: wrapperFor() })
    await act(async () => {
      await result.current.mutateAsync('Acme').catch(() => undefined)
    })
    await waitFor(() => expect(result.current.error).not.toBeNull())
    expect(result.current.error?.message).toBe('Organization slug already exists')
    expect(errorFieldOf(result.current.error)).toBe('name')
    expect(useOrgStore.getState().organizations).toEqual([])
  })
})
