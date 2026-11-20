import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { InboxNotification as ApiInboxNotification } from '@awaitstep/ir'
import { SAMPLE_RELEASE_NOTES } from '../../../__tests__/fixtures/seed/release-notes'
import {
  useDecideEditRequest,
  useMarkAllNotificationsRead,
  useMarkNotificationRead,
  useNotifications,
  useRecordReleasesVisit,
  useReleases,
} from '../inbox'

// The app's own notes are the fragments in `release-notes/`; these tests need some.
vi.mock('../../../content/releases', async () => {
  const { SAMPLE_RELEASE_NOTES } = await import('../../../__tests__/fixtures/seed/release-notes')
  return { RELEASE_NOTES: SAMPLE_RELEASE_NOTES }
})

// The Inbox and What's new hooks on both sources (B8): the API's
// `/notifications` and `/releases/visit`, and the dummy server.

const fetchMock = vi.fn()

const FAILURE: ApiInboxNotification = {
  id: 'ntf_1',
  kind: 'failure',
  event: 'run.failed',
  title: 'Lead enrichment failed 3 times in the last hour, at step “Fetch company”',
  where: 'Project 101 · Sales',
  at: '2026-10-30T09:00:00.000Z',
  read: false,
  needsAction: true,
  count: 3,
  link: {
    label: 'See runs',
    to: { kind: 'workspace', project: 'project-101', workspace: 'sales', page: 'runs' },
  },
}

const REQUEST: ApiInboxNotification = {
  id: 'ntf_2',
  kind: 'request',
  event: 'access_request.create',
  title: 'Eve Park asked for edit access to Sales',
  where: 'Project 101 · Sales',
  at: '2026-10-30T08:00:00.000Z',
  read: false,
  needsAction: true,
  count: 1,
  request: { id: 'req_9', status: 'pending' },
}

function json(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock)
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

const calls = () => fetchMock.mock.calls.map(([url, init]) => [init?.method ?? 'GET', url])

describe('useNotifications', () => {
  it('reads GET /notifications, links as paths and counts as the API gives them', async () => {
    fetchMock.mockResolvedValue(
      json({ data: [FAILURE, REQUEST], counts: { all: 7, unread: 5, action: 3 } }),
    )
    const { result } = renderHook(() => useNotifications('acme'), { wrapper: wrapperFor() })
    await waitFor(() => expect(result.current.data).toBeDefined())
    expect(calls()).toEqual([['GET', '/api/notifications?org=acme']])
    expect(result.current.data!.counts).toEqual({ all: 7, unread: 5, action: 3 })
    expect(result.current.data!.list[0]!.link).toEqual({
      label: 'See runs',
      href: '/acme/project-101/sales/runs',
    })
    expect(result.current.data!.list[1]!.request).toEqual({ id: 'req_9', status: 'pending' })
  })
})

describe('Inbox writes on the API', () => {
  it('marks one, marks all, and decides a request by the request’s id', async () => {
    fetchMock.mockImplementation(() => Promise.resolve(json({ ok: true })))
    const wrapper = wrapperFor()
    const one = renderHook(() => useMarkNotificationRead('acme'), { wrapper })
    const all = renderHook(() => useMarkAllNotificationsRead('acme'), { wrapper })
    const decide = renderHook(() => useDecideEditRequest('acme'), { wrapper })
    await act(() => one.result.current.mutateAsync('ntf_1'))
    await act(() => all.result.current.mutateAsync())
    await act(() => decide.result.current.mutateAsync({ id: 'req_9', decision: 'approve' }))
    expect(calls()).toEqual([
      ['POST', '/api/notifications/ntf_1/read?org=acme'],
      ['POST', '/api/notifications/read-all?org=acme'],
      ['POST', '/api/access-requests/req_9/approve'],
    ])
  })
})

describe('useReleases', () => {
  it('builds What’s new from the app’s notes and the visit the API keeps', async () => {
    fetchMock.mockResolvedValue(
      json({
        lastVisit: '2026-10-29T12:00:00.000Z',
        seen: ['rel_lock', 'rel_variables', 'rel_keys', 'rel_workspaces'],
      }),
    )
    const { result } = renderHook(() => useReleases('acme'), { wrapper: wrapperFor() })
    await waitFor(() => expect(result.current.data).toBeDefined())
    expect(calls()).toEqual([['GET', '/api/releases/visit']])
    expect(result.current.data!.releases).toHaveLength(SAMPLE_RELEASE_NOTES.length)
    expect(result.current.data!.releases.filter((r) => r.fresh).map((r) => r.id)).toEqual([
      'rel_inbox',
      'rel_audit',
      'rel_d1_saves',
      'rel_sharing',
    ])
  })

  it('records the visit and the notes it showed on the API when What’s new closes', async () => {
    fetchMock.mockImplementation(() => Promise.resolve(json({ lastVisit: null, seen: [] })))
    const view = renderHook(({ shown }) => useRecordReleasesVisit('acme', shown), {
      wrapper: wrapperFor(),
      initialProps: { shown: ['rel_inbox', 'rel_audit'] as string[] | undefined },
    })
    view.unmount()
    await waitFor(() => expect(calls()).toContainEqual(['PUT', '/api/releases/visit']))
    const [, init] = fetchMock.mock.calls.find(([, i]) => i?.method === 'PUT')!
    expect(JSON.parse(init.body)).toEqual({ seen: ['rel_inbox', 'rel_audit'] })
  })

  it('records nothing for notes that never loaded', () => {
    const view = renderHook(() => useRecordReleasesVisit('acme', undefined), {
      wrapper: wrapperFor(),
    })
    view.unmount()
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
