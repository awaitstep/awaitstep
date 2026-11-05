import { useState, type ReactNode } from 'react'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type * as ApiClient from '../../lib/api-client'
import { pollIntervalFor, useLastRunSteps } from '../use-last-run-steps'

const listWorkflowRuns = vi.fn()
const getWorkflowRunSteps = vi.fn()

vi.mock('../../lib/api-client', async (importOriginal) => {
  const actual = await importOriginal<typeof ApiClient>()
  return {
    ...actual,
    api: {
      ...actual.api,
      listWorkflowRuns: (...args: unknown[]) => listWorkflowRuns(...args),
      getWorkflowRunSteps: (...args: unknown[]) => getWorkflowRunSteps(...args),
    },
  }
})

function wrapper({ children }: { children: ReactNode }) {
  const [client] = useState(
    () => new QueryClient({ defaultOptions: { queries: { retry: false } } }),
  )
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

const run = { id: 'run_1', status: 'complete' }

beforeEach(() => {
  listWorkflowRuns.mockReset().mockResolvedValue({ data: [run], nextCursor: null })
  getWorkflowRunSteps.mockReset().mockResolvedValue({ data: [], coalescedInto: { a: 'b' } })
})

describe('useLastRunSteps', () => {
  it('makes no request while it is not enabled', async () => {
    const { result } = renderHook(() => useLastRunSteps('wf_1', false), { wrapper })
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(listWorkflowRuns).not.toHaveBeenCalled()
    expect(getWorkflowRunSteps).not.toHaveBeenCalled()
    expect(result.current.loading).toBe(false)
    expect(result.current.run).toBeNull()
  })

  it('asks for the latest run only, then that run’s steps', async () => {
    const { result } = renderHook(() => useLastRunSteps('wf_1', true), { wrapper })
    expect(result.current.loading).toBe(true)
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(listWorkflowRuns).toHaveBeenCalledWith('wf_1', { limit: 1 })
    expect(getWorkflowRunSteps).toHaveBeenCalledWith('wf_1', 'run_1')
    expect(result.current.coalescedInto).toEqual({ a: 'b' })
  })

  it('does not ask for steps when the workflow has never run', async () => {
    listWorkflowRuns.mockResolvedValue({ data: [], nextCursor: null })
    const { result } = renderHook(() => useLastRunSteps('wf_1', true), { wrapper })
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.run).toBeNull()
    expect(getWorkflowRunSteps).not.toHaveBeenCalled()
  })

  it('reports a failure', async () => {
    listWorkflowRuns.mockRejectedValue(new Error('offline'))
    const { result } = renderHook(() => useLastRunSteps('wf_1', true), { wrapper })
    await waitFor(() => expect(result.current.failed).toBe(true))
  })

  it('polls the runs while the latest one is in progress, then stops once it has finished', async () => {
    let status = 'running'
    listWorkflowRuns.mockImplementation(() =>
      Promise.resolve({ data: [{ id: 'run_1', status }], nextCursor: null }),
    )
    const { result } = renderHook(() => useLastRunSteps('wf_1', true, 30), { wrapper })
    await waitFor(() => expect(listWorkflowRuns.mock.calls.length).toBeGreaterThanOrEqual(3))
    expect(getWorkflowRunSteps.mock.calls.length).toBeGreaterThanOrEqual(2)
    status = 'complete'
    await waitFor(() => expect(result.current.run?.status).toBe('complete'))
    await new Promise((resolve) => setTimeout(resolve, 120))
    const runCalls = listWorkflowRuns.mock.calls.length
    const stepCalls = getWorkflowRunSteps.mock.calls.length
    await new Promise((resolve) => setTimeout(resolve, 150))
    expect(listWorkflowRuns.mock.calls.length).toBe(runCalls)
    expect(getWorkflowRunSteps.mock.calls.length).toBe(stepCalls)
  })

  it('ends with the steps of the finished run, not those fetched while it ran', async () => {
    let status = 'running'
    listWorkflowRuns.mockImplementation(() =>
      Promise.resolve({ data: [{ id: 'run_1', status }], nextCursor: null }),
    )
    getWorkflowRunSteps.mockImplementation(() =>
      Promise.resolve({ data: [{ id: status }], coalescedInto: {} }),
    )
    const { result } = renderHook(() => useLastRunSteps('wf_1', true, 25), { wrapper })
    await waitFor(() => expect(result.current.steps).toEqual([{ id: 'running' }]))
    status = 'complete'
    await waitFor(() => expect(result.current.run?.status).toBe('complete'))
    await waitFor(() => expect(result.current.steps).toEqual([{ id: 'complete' }]))
  })

  it('does not poll a run that has already finished', async () => {
    renderHook(() => useLastRunSteps('wf_1', true, 20), { wrapper })
    await waitFor(() => expect(getWorkflowRunSteps).toHaveBeenCalledTimes(1))
    await new Promise((resolve) => setTimeout(resolve, 120))
    expect(listWorkflowRuns).toHaveBeenCalledTimes(1)
    expect(getWorkflowRunSteps).toHaveBeenCalledTimes(1)
  })
})

describe('pollIntervalFor', () => {
  const now = Date.parse('2026-11-05T12:00:00Z')

  it('polls a fresh run at the base rate', () => {
    expect(pollIntervalFor({ createdAt: '2026-11-05T11:58:00Z' }, 5_000, now)).toBe(5_000)
  })

  it('slows down for a run that has been going for more than ten minutes', () => {
    expect(pollIntervalFor({ createdAt: '2026-11-05T11:00:00Z' }, 5_000, now)).toBe(30_000)
  })

  it('keeps the base rate when the start time cannot be read', () => {
    expect(pollIntervalFor({ createdAt: 'nope' }, 5_000, now)).toBe(5_000)
  })
})
