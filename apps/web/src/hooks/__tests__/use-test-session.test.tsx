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
