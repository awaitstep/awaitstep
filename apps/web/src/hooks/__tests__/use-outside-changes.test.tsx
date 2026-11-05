import { act, renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { OUTSIDE_CHECK_MS, useOutsideChanges } from '../use-outside-changes'

const api = vi.hoisted(() => ({ getProjectFiles: vi.fn() }))
vi.mock('../../lib/api-client', () => ({ api }))

const baseline = new Map([
  ['worker.ts', {}],
  ['lib/a.ts', { hash: 'ha' }],
])

function setup(enabled = true, files = baseline) {
  const client = new QueryClient()
  const invalidate = vi.spyOn(client, 'refetchQueries')
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  )
  const view = renderHook(
    (props: { baseline: typeof files }) =>
      useOutsideChanges({ workflowId: 'wf', enabled, baseline: props.baseline }),
    { wrapper, initialProps: { baseline: files } },
  )
  return { client, invalidate, view }
}

beforeEach(() => api.getProjectFiles.mockReset())

function sourceRefetches(spy: { mock: { calls: unknown[][] } }): number {
  return spy.mock.calls.filter(
    ([filters]) => (filters as { queryKey: string[] }).queryKey[0] === 'workflow-source',
  ).length
}

describe('useOutsideChanges', () => {
  it('asks the cheap listing, not the source, and does nothing when nothing differs', async () => {
    api.getProjectFiles.mockResolvedValue([{ path: 'lib/a.ts', hash: 'ha' }])
    const { invalidate } = setup()
    await waitFor(() => expect(api.getProjectFiles).toHaveBeenCalledWith('wf'))
    await new Promise((r) => setTimeout(r, 20))
    expect(invalidate).not.toHaveBeenCalled()
  })

  it('refetches the source when a file’s hash differs', async () => {
    api.getProjectFiles.mockResolvedValue([{ path: 'lib/a.ts', hash: 'ha2' }])
    const { invalidate } = setup()
    await waitFor(() =>
      expect(invalidate).toHaveBeenCalledWith(
        { queryKey: ['workflow-source', 'wf'] },
        { throwOnError: true },
      ),
    )
  })

  it('refetches when a file appeared or vanished', async () => {
    api.getProjectFiles.mockResolvedValue([
      { path: 'lib/a.ts', hash: 'ha' },
      { path: 'lib/new.ts', hash: 'hn' },
    ])
    const { invalidate } = setup()
    await waitFor(() => expect(sourceRefetches(invalidate)).toBe(1))
  })

  it('does not refetch the source again for a discrepancy it already acted on', async () => {
    api.getProjectFiles.mockResolvedValue([{ path: 'lib/a.ts', hash: 'ha2' }])
    const { invalidate, client } = setup()
    await waitFor(() => expect(sourceRefetches(invalidate)).toBe(1))
    await client.refetchQueries({ queryKey: ['ide-project-listing', 'wf'] })
    expect(api.getProjectFiles).toHaveBeenCalledTimes(2)
    expect(sourceRefetches(invalidate)).toBe(1)
  })

  it('judges against the files as they are now, not as they were when polling began', async () => {
    api.getProjectFiles.mockResolvedValue([{ path: 'lib/a.ts', hash: 'ha2' }])
    const { invalidate, client, view } = setup()
    await waitFor(() => expect(sourceRefetches(invalidate)).toBe(1))
    // The source refetch lands: the loaded files now carry the new hash.
    view.rerender({ baseline: new Map([['lib/a.ts', { hash: 'ha2' }]]) })
    await client.refetchQueries({ queryKey: ['ide-project-listing', 'wf'] })
    expect(sourceRefetches(invalidate)).toBe(1)
  })

  it('makes no requests while disabled (an older version, or before the source loaded)', async () => {
    setup(false)
    await new Promise((r) => setTimeout(r, 30))
    expect(api.getProjectFiles).not.toHaveBeenCalled()
  })

  it('polls every 20 seconds, never from a hidden tab, and again on focus', () => {
    api.getProjectFiles.mockResolvedValue([])
    const { client } = setup()
    const query = client.getQueryCache().find({ queryKey: ['ide-project-listing', 'wf'] })!
    const options = query.options as {
      refetchInterval: number
      refetchIntervalInBackground: boolean
      refetchOnWindowFocus: unknown
    }
    expect(OUTSIDE_CHECK_MS).toBe(20_000)
    expect(options.refetchInterval).toBe(20_000)
    expect(options.refetchIntervalInBackground).toBe(false)
    // Focus is handled by the hook itself (see the next tests).
    expect(options.refetchOnWindowFocus).toBe(false)
  })

  it('checks once when the window gets focus, even if the page never became hidden', async () => {
    api.getProjectFiles.mockResolvedValue([{ path: 'lib/a.ts', hash: 'ha' }])
    setup()
    await waitFor(() => expect(api.getProjectFiles).toHaveBeenCalledTimes(1))
    act(() => {
      window.dispatchEvent(new Event('focus'))
    })
    await waitFor(() => expect(api.getProjectFiles).toHaveBeenCalledTimes(2))
  })

  it('does not stack requests when focus and visibilitychange arrive together', async () => {
    let finish: (v: unknown) => void = () => {}
    api.getProjectFiles
      .mockResolvedValueOnce([{ path: 'lib/a.ts', hash: 'ha' }])
      .mockImplementationOnce(() => new Promise((resolve) => (finish = resolve)))
    setup()
    await waitFor(() => expect(api.getProjectFiles).toHaveBeenCalledTimes(1))
    act(() => {
      window.dispatchEvent(new Event('focus'))
      document.dispatchEvent(new Event('visibilitychange'))
    })
    await new Promise((r) => setTimeout(r, 20))
    expect(api.getProjectFiles).toHaveBeenCalledTimes(2)
    finish([{ path: 'lib/a.ts', hash: 'ha' }])
  })

  it('tries the source again at the next check when its refetch failed', async () => {
    api.getProjectFiles.mockResolvedValue([{ path: 'lib/a.ts', hash: 'ha2' }])
    const { invalidate, client } = setup()
    invalidate.mockRejectedValueOnce(new Error('network'))
    await waitFor(() => expect(sourceRefetches(invalidate)).toBe(1))
    await client.refetchQueries({ queryKey: ['ide-project-listing', 'wf'] }).catch(() => undefined)
    await waitFor(() => expect(sourceRefetches(invalidate)).toBe(2))
  })
})
