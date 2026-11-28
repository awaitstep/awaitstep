import { act, renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { TestSession } from '../../lib/api-client'

const api = vi.hoisted(() => ({
  getTestSession: vi.fn(),
  startTestSession: vi.fn(),
  stopTestSession: vi.fn(),
  triggerTestSession: vi.fn(),
  projectUrl: (path: string) => `/api${path}`,
}))

vi.mock('../../lib/api-client', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>()
  return { ...actual, api }
})
vi.mock('../../lib/action-toast', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>()
  return { ...actual, actionToast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }
})

const { useTestSession } = await import('../use-test-session')
const { useOrgStore } = await import('../../stores/org-store')

function session(id: string, status: TestSession['status'] = 'running'): TestSession {
  return {
    id,
    workflowId: 'wf',
    versionId: 'v1',
    runtime: 'sandbox',
    status,
    error: null,
    createdAt: '2026-11-05T14:02:00.000Z',
    lastUsedAt: '2026-11-05T14:02:00.000Z',
    files: { 'a.ts': 'h1' },
  }
}

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

beforeEach(() => {
  vi.clearAllMocks()
  api.getTestSession.mockResolvedValue({ session: session('old') })
})

async function setup() {
  const hook = renderHook(
    () => useTestSession({ workflowId: 'wf', versionId: 'v1', currentHashes: { 'a.ts': 'h2' } }),
    { wrapper },
  )
  await waitFor(() => expect(hook.result.current.session?.id).toBe('old'))
  return hook
}

describe('restartAndTrigger', () => {
  it('never triggers the old session when the stop fails', async () => {
    api.stopTestSession.mockRejectedValue(new Error('boom'))
    const { result } = await setup()
    await act(() => result.current.restartAndTrigger({}))
    expect(api.startTestSession).not.toHaveBeenCalled()
    expect(api.triggerTestSession).not.toHaveBeenCalled()
  })

  it('stops, starts, and triggers only the new session', async () => {
    api.stopTestSession.mockResolvedValue(undefined)
    api.startTestSession.mockResolvedValue({ session: session('new', 'starting'), reused: false })
    const { result } = await setup()
    api.getTestSession.mockResolvedValue({ session: session('new') })
    api.triggerTestSession.mockResolvedValue({ status: 200, body: {} })
    await act(() => result.current.restartAndTrigger({ a: 1 }))
    expect(api.triggerTestSession).toHaveBeenCalledTimes(1)
    expect(api.triggerTestSession.mock.calls[0]![0]).toBe('new')
  })

  it('does not trigger when the new session fails to start', async () => {
    api.stopTestSession.mockResolvedValue(undefined)
    api.startTestSession.mockRejectedValue(new Error('no capacity'))
    const { result } = await setup()
    await act(() => result.current.restartAndTrigger({}))
    expect(api.triggerTestSession).not.toHaveBeenCalled()
  })
})

describe('staleness', () => {
  it('reports a file saved since the session started, from its stored manifest', async () => {
    const { result } = await setup()
    expect(result.current.stale).toMatchObject({ saved: 1, deleted: 0 })
  })

  it('remembers an accepted "Trigger anyway" per session, outside the Run panel', async () => {
    const { result } = await setup()
    act(() => result.current.acceptStale(result.current.stale.signature))
    expect(result.current.acceptedSignature).toBe(result.current.stale.signature)
  })
})

describe('payload', () => {
  it('is remembered per workflow, not per session, so a restart keeps it', async () => {
    const { result } = await setup()
    act(() => result.current.setPayload('{"orderId":1}'))
    expect(result.current.payload).toBe('{"orderId":1}')
    api.stopTestSession.mockResolvedValue(undefined)
    api.startTestSession.mockResolvedValue({ session: session('new', 'starting'), reused: false })
    await act(() => result.current.restart())
    expect(result.current.payload).toBe('{"orderId":1}')
  })

  it('an edit clears the refused-payload message', async () => {
    const { result } = await setup()
    act(() => result.current.setPayloadError('Not valid JSON'))
    expect(result.current.payloadError).toBe('Not valid JSON')
    act(() => result.current.setPayload('{}'))
    expect(result.current.payloadError).toBeNull()
  })
})

describe('stop', () => {
  it('leaves a stopped session so the header reads stopped', async () => {
    api.stopTestSession.mockResolvedValue(undefined)
    const { result } = await setup()
    await act(() => result.current.stop())
    expect(result.current.session).toMatchObject({ id: 'old', status: 'stopped' })
  })

  it('records when a start was requested, for the elapsed seconds', async () => {
    api.startTestSession.mockResolvedValue({ session: session('new', 'starting'), reused: false })
    const { result } = await setup()
    expect(result.current.startRequestedAt).toBeNull()
    let finish: (value: unknown) => void = () => {}
    api.startTestSession.mockReturnValue(new Promise((resolve) => (finish = resolve)))
    let started: Promise<boolean> = Promise.resolve(false)
    act(() => {
      started = result.current.start()
    })
    expect(result.current.startRequestedAt).toBeGreaterThan(0)
    await act(async () => {
      finish({ session: session('new', 'starting'), reused: false })
      await started
    })
    // The seconds belong to the request: a session seen starting later,
    // from elsewhere, must count from its own creation, not from this press.
    expect(result.current.startRequestedAt).toBeNull()
  })
})

describe('start in flight', () => {
  /** The server holds POST until the session runs, so only a read shows the reserved row. */
  function pending() {
    let finish: (value: unknown) => void = () => {}
    let fail: (error: unknown) => void = () => {}
    const promise = new Promise((resolve, reject) => {
      finish = resolve
      fail = reject
    })
    return { promise, finish, fail }
  }

  it('reads the reserved session while the start request is open, so Cancel has an id', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    try {
      api.getTestSession.mockResolvedValue({ session: null })
      const { result } = renderHook(() => useTestSession({ workflowId: 'wf' }), { wrapper })
      await waitFor(() => expect(api.getTestSession).toHaveBeenCalled())
      const request = pending()
      api.startTestSession.mockReturnValue(request.promise)
      act(() => void result.current.start())
      api.getTestSession.mockResolvedValue({ session: session('reserved', 'starting') })
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1_600)
      })
      await waitFor(() => expect(result.current.session?.id).toBe('reserved'))
      expect(result.current.starting).toBe(true)
      await act(async () => {
        request.finish({ session: session('reserved'), reused: false })
      })
      await waitFor(() => expect(result.current.starting).toBe(false))
      expect(result.current.session?.status).toBe('running')
    } finally {
      vi.useRealTimers()
    }
  })

  it('a cancel is not an error: the 409 the start request ends with is silent', async () => {
    const { ApiError } = await import('../../lib/api-client')
    const { actionToast } = await import('../../lib/action-toast')
    api.getTestSession.mockResolvedValue({ session: session('s1', 'starting') })
    api.stopTestSession.mockResolvedValue(undefined)
    const { result } = renderHook(() => useTestSession({ workflowId: 'wf' }), { wrapper })
    await waitFor(() => expect(result.current.session?.id).toBe('s1'))
    const request = pending()
    api.startTestSession.mockReturnValue(request.promise)
    act(() => void result.current.start())
    await act(() => result.current.stop())
    await act(async () => {
      request.fail(new ApiError('Test session was stopped while starting', 409))
    })
    await waitFor(() => expect(result.current.starting).toBe(false))
    expect(result.current.actionError).toBeNull()
    expect(actionToast.error).not.toHaveBeenCalled()
    expect(result.current.session).toMatchObject({ id: 's1', status: 'stopped' })
  })

  it('a 409 that was not a cancel from here is still reported', async () => {
    const { ApiError } = await import('../../lib/api-client')
    api.getTestSession.mockResolvedValue({ session: null })
    api.startTestSession.mockRejectedValue(
      new ApiError('Test session was stopped while starting', 409),
    )
    const { result } = renderHook(() => useTestSession({ workflowId: 'wf' }), { wrapper })
    await act(() => result.current.start())
    expect(result.current.actionError).toBe('Test session was stopped while starting')
  })
})

describe('requests are not reentrant', () => {
  it('a second trigger while one is in flight is ignored', async () => {
    const { result } = await setup()
    let finish: (value: unknown) => void = () => {}
    api.triggerTestSession.mockReturnValue(new Promise((resolve) => (finish = resolve)))
    act(() => {
      void result.current.trigger({})
      void result.current.trigger({})
    })
    expect(api.triggerTestSession).toHaveBeenCalledTimes(1)
    await act(async () => finish({ status: 200, body: {} }))
  })

  it('a second restart-and-trigger while the first restarts does not start another session', async () => {
    let finishStop: (value?: unknown) => void = () => {}
    api.stopTestSession.mockReturnValue(new Promise((resolve) => (finishStop = resolve)))
    api.startTestSession.mockResolvedValue({ session: session('new', 'starting'), reused: false })
    api.triggerTestSession.mockResolvedValue({ status: 200, body: {} })
    const { result } = await setup()
    api.getTestSession.mockResolvedValue({ session: session('new') })
    let first: Promise<void> = Promise.resolve()
    act(() => {
      first = result.current.restartAndTrigger({ n: 1 })
      void result.current.restartAndTrigger({ n: 2 })
    })
    await act(async () => {
      finishStop()
      await first
    })
    expect(api.stopTestSession).toHaveBeenCalledTimes(1)
    expect(api.startTestSession).toHaveBeenCalledTimes(1)
    expect(api.triggerTestSession).toHaveBeenCalledTimes(1)
  })

  it('a second start while one is in flight is ignored', async () => {
    api.getTestSession.mockResolvedValue({ session: null })
    api.startTestSession.mockReturnValue(new Promise(() => {}))
    const { result } = renderHook(() => useTestSession({ workflowId: 'wf' }), { wrapper })
    act(() => {
      void result.current.start()
      void result.current.start()
    })
    expect(api.startTestSession).toHaveBeenCalledTimes(1)
  })
})

describe('older version in view', () => {
  it('compares with the version a session runs, so it can clear', async () => {
    const hook = renderHook(
      () =>
        useTestSession({
          workflowId: 'wf',
          versionId: 'v1',
          viewingOlder: true,
          currentHashes: null,
        }),
      { wrapper },
    )
    await waitFor(() => expect(hook.result.current.session?.id).toBe('old'))
    expect(hook.result.current.viewingOlder).toBe(true)
    expect(hook.result.current.stale.version).toBe(false)
  })
})

describe('log stream refused with 401', () => {
  it('stops retrying and says so once, instead of rewriting state forever', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('', { status: 401 }))
    vi.stubGlobal('fetch', fetchMock)
    useOrgStore.setState({ activeProjectId: 'p1' })
    try {
      vi.useFakeTimers({ shouldAdvanceTime: true })
      await setup()
      await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
      await act(async () => {
        await vi.advanceTimersByTimeAsync(120_000)
      })
      expect(fetchMock).toHaveBeenCalledTimes(1)
    } finally {
      vi.useRealTimers()
      vi.unstubAllGlobals()
    }
  })
})

describe('a triggered workflow instance', () => {
  /** An SSE response with these events, then the end of the stream. */
  function sse(events: Array<{ event: string; data: unknown }>, final = false) {
    const text =
      events
        .map((e, i) => `id: ${i}\nevent: ${e.event}\ndata: ${JSON.stringify(e.data)}\n\n`)
        .join('') + (final ? `event: closed\ndata: ${JSON.stringify({ final: false })}\n\n` : '')
    return new Response(text, { status: 200, headers: { 'content-type': 'text/event-stream' } })
  }

  it('is followed until it completes, and its output becomes a line of Output', async () => {
    const { useTestSessionStore } = await import('../../stores/test-session-store')
    useTestSessionStore.getState().reset('old')
    const urls: string[] = []
    const fetchMock = vi.fn(async (url: string) => {
      urls.push(url)
      if (url.includes('instanceId=i1')) {
        return sse([
          { event: 'instance', data: { status: 'running' } },
          { event: 'instance', data: { status: 'complete', output: { n: 42 } } },
        ])
      }
      // Without an instance: an empty stream that the hook reconnects to.
      return new Promise<Response>(() => {})
    })
    vi.stubGlobal('fetch', fetchMock)
    useOrgStore.setState({ activeProjectId: 'p1' })
    try {
      api.triggerTestSession.mockResolvedValue({ status: 200, body: { instanceId: 'i1' } })
      const { result } = await setup()
      await waitFor(() => expect(urls.length).toBeGreaterThan(0))
      expect(urls[0]).not.toContain('instanceId')
      await act(() => result.current.trigger({}))
      await waitFor(() =>
        expect(result.current.logs.map((l) => l.text)).toContain('Run complete\n{\n  "n": 42\n}'),
      )
      // Done: the stream reconnects without asking about it again.
      await waitFor(() => expect(urls.at(-1)).not.toContain('instanceId'))
      expect(result.current.logs.filter((l) => l.text.startsWith('Run '))).toHaveLength(1)
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('a function answering with an instanceId of its own is not followed past one read', async () => {
    const { useTestSessionStore } = await import('../../stores/test-session-store')
    useTestSessionStore.getState().reset('old')
    const urls: string[] = []
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        urls.push(url)
        if (url.includes('instanceId=mine')) {
          return sse([{ event: 'instance', data: { error: 'instance.not_found' } }])
        }
        return new Promise<Response>(() => {})
      }),
    )
    useOrgStore.setState({ activeProjectId: 'p1' })
    try {
      api.triggerTestSession.mockResolvedValue({ status: 200, body: { instanceId: 'mine' } })
      const { result } = await setup()
      await act(() => result.current.trigger({}))
      await waitFor(() => expect(urls.at(-1)).not.toContain('instanceId'))
      expect(urls.filter((u) => u.includes('instanceId'))).toHaveLength(1)
      expect(result.current.logs.map((l) => l.text)).toEqual([
        'Response 200\n{\n  "instanceId": "mine"\n}',
      ])
    } finally {
      vi.unstubAllGlobals()
    }
  })
})
