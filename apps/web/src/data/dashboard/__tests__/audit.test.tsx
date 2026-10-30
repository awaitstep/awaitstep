import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AuditEvent } from '../../../types/dashboard/audit'
import { resetMockDb } from '../../../mocks/dashboard/db'
import { useAuditExport, useAuditLog } from '../audit'
import { MockScenarioProvider } from '../scenario-context'
import { DataSourceProvider, type DataSource } from '../source'

// The audit log's hooks on both sources (B7): the API's `GET /audit-events`,
// and the dummy server's samples, which carry the same fields.

const fetchMock = vi.fn()

const EVENT: AuditEvent = {
  id: 'aud-1',
  at: '2026-10-30T09:00:00.000Z',
  kind: 'lock',
  event: 'project.lock',
  actor: 'Ama Mensah',
  actorType: 'user',
  actorId: 'usr_ama',
  actorEmail: 'ama@acme.test',
  action: 'turned on the deletion lock for',
  target: 'Project 101',
  detail: 'Dashboard · 81.2.69.x',
  ip: '81.2.69.x',
  scope: { level: 'project', name: 'Project 101' },
}

function page(data: AuditEvent[], nextCursor: string | null, total: number) {
  return new Response(JSON.stringify({ data, nextCursor, total }), {
    status: 200,
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

function wrapperFor(source: DataSource) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
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

describe('useAuditLog', () => {
  it('reads a page from GET /audit-events with the filter in the query', async () => {
    fetchMock.mockResolvedValue(page([EVENT], null, 1))
    const { result } = renderHook(
      () => useAuditLog('acme', { level: 'project', period: '30d', search: 'lock' }),
      { wrapper: wrapperFor('api') },
    )
    await waitFor(() => expect(result.current.data).toBeDefined())
    expect(result.current.data).toEqual({ data: [EVENT], nextCursor: null, total: 1 })
    const [url] = fetchMock.mock.calls[0] as [string]
    expect(url).toBe('/api/audit-events?org=acme&level=project&period=30d&search=lock')
  })

  it('asks nothing of the API while off', () => {
    renderHook(() => useAuditLog('acme', {}, false), { wrapper: wrapperFor('api') })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('serves the dummy samples with the API’s fields', async () => {
    const { result } = renderHook(() => useAuditLog('acme', {}), { wrapper: wrapperFor('mock') })
    await waitFor(() => expect(result.current.data).toBeDefined())
    expect(fetchMock).not.toHaveBeenCalled()
    expect(result.current.data!.data[0]).toMatchObject({
      event: 'workspace.delete.blocked',
      actorType: 'user',
      ip: '81.2.69.x',
    })
    const deploy = result.current.data!.data.find((e) => e.kind === 'deploy')!
    expect(deploy).toMatchObject({ actorType: 'key', ip: null })
  })
})

describe('useAuditExport', () => {
  it('collects every page from the API', async () => {
    fetchMock
      .mockResolvedValueOnce(page([EVENT], 'aud-1_2026-10-30T09:00:00.000Z', 2))
      .mockResolvedValueOnce(page([{ ...EVENT, id: 'aud-2' }], null, 2))
    const { result } = renderHook(() => useAuditExport('acme'), { wrapper: wrapperFor('api') })
    const all = await result.current({ period: '90d' })
    expect(all.map((e) => e.id)).toEqual(['aud-1', 'aud-2'])
    const [second] = fetchMock.mock.calls[1] as [string]
    expect(second).toContain('cursor=aud-1_2026-10-30T09%3A00%3A00.000Z')
  })
})
