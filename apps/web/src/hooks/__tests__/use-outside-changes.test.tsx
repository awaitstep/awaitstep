import { act, renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { OUTSIDE_CHECK_MS, useOutsideChanges } from '../use-outside-changes'

const api = vi.hoisted(() => ({ getProjectListing: vi.fn() }))
vi.mock('../../lib/api-client', () => ({ api }))

const stored = new Map([['lib/a.ts', { hash: 'ha' }]])
const SAME_VERSION = { id: 'v3', graphHash: 'g3' }

/** A listing: the files, and the latest version (the loaded one unless said otherwise). */
function listing(
  files: { path: string; hash: string }[],
  version: { id: string; graphHash: string } | null = SAME_VERSION,
) {
  return { files, version }
}

function setup(enabled = true, files = stored, versionParam?: string) {
  const client = new QueryClient()
  const invalidate = vi.spyOn(client, 'refetchQueries')
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  )
  const view = renderHook(
    (props: { stored: typeof files }) =>
      useOutsideChanges({ workflowId: 'wf', versionParam, enabled, stored: props.stored }),
    { wrapper, initialProps: { stored: files } },
  )
  return { client, invalidate, view }
}

/** The loaded workflow, as the cache has it. */
function loaded(client: QueryClient, version: { id: string } | null, graphHash: string | null) {
  client.setQueryData(['workflow-full', 'wf', undefined], { version, graphHash })
}

/** Runs the next check directly, for tests that have `refetchQueries` stubbed out. */
function pollAgain(client: QueryClient) {
  return client
    .getQueryCache()
    .find({ queryKey: ['ide-project-listing', 'wf'] })!
    .fetch()
    .catch(() => undefined)
}

beforeEach(() => api.getProjectListing.mockReset())

function refetchesOf(spy: { mock: { calls: unknown[][] } }, key: string): number {
  return spy.mock.calls.filter(
    ([filters]) => (filters as { queryKey: string[] }).queryKey[0] === key,
  ).length
}
const sourceRefetches = (spy: { mock: { calls: unknown[][] } }) =>
  refetchesOf(spy, 'workflow-source')
const fullRefetches = (spy: { mock: { calls: unknown[][] } }) => refetchesOf(spy, 'workflow-full')

describe('useOutsideChanges', () => {
  it('asks the cheap listing, not the source, and does nothing when nothing differs', async () => {
    api.getProjectListing.mockResolvedValue(listing([{ path: 'lib/a.ts', hash: 'ha' }]))
    const { invalidate, client } = setup()
    loaded(client, { id: 'v3' }, 'g3')
    await waitFor(() => expect(api.getProjectListing).toHaveBeenCalledWith('wf'))
    await new Promise((r) => setTimeout(r, 20))
    expect(invalidate).not.toHaveBeenCalled()
  })

  it('refetches the source when a file’s hash differs', async () => {
    api.getProjectListing.mockResolvedValue(listing([{ path: 'lib/a.ts', hash: 'ha2' }]))
    const { invalidate, client } = setup()
    loaded(client, { id: 'v3' }, 'g3')
    await waitFor(() =>
      expect(invalidate).toHaveBeenCalledWith(
        { queryKey: ['workflow-source', 'wf'] },
        { throwOnError: true },
      ),
    )
    expect(fullRefetches(invalidate)).toBe(0)
  })

  it('refreshes the full query too when the refetched source is a newer version than the graph', async () => {
    api.getProjectListing.mockResolvedValue(listing([{ path: 'lib/a.ts', hash: 'ha2' }]))
    const { invalidate, client } = setup()
    loaded(client, { id: 'v3' }, 'g3')
    client.setQueryData(['workflow-source', 'wf', undefined], { versionId: 'v3' })
    invalidate.mockImplementation(async (filters) => {
      const key = (filters as { queryKey: string[] }).queryKey
      if (key[0] === 'workflow-source') {
        client.setQueryData(['workflow-source', 'wf', undefined], { versionId: 'v4' })
      }
    })
    await waitFor(() =>
      expect(invalidate).toHaveBeenCalledWith(
        { queryKey: ['workflow-full', 'wf'] },
        { throwOnError: true },
      ),
    )
  })

  it('leaves the full query alone when the refetched source is still the graph’s version', async () => {
    api.getProjectListing.mockResolvedValue(listing([{ path: 'lib/a.ts', hash: 'ha2' }]))
    const { invalidate, client } = setup()
    loaded(client, { id: 'v3' }, 'g3')
    client.setQueryData(['workflow-source', 'wf', undefined], { versionId: 'v3' })
    invalidate.mockResolvedValue(undefined)
    await waitFor(() => expect(sourceRefetches(invalidate)).toBe(1))
    await new Promise((r) => setTimeout(r, 20))
    expect(fullRefetches(invalidate)).toBe(0)
  })

  it('refetches when a file appeared or vanished', async () => {
    api.getProjectListing.mockResolvedValue(
      listing([
        { path: 'lib/a.ts', hash: 'ha' },
        { path: 'lib/new.ts', hash: 'hn' },
      ]),
    )
    const { invalidate, client } = setup()
    loaded(client, { id: 'v3' }, 'g3')
    await waitFor(() => expect(sourceRefetches(invalidate)).toBe(1))
  })

  it('does not refetch the source again for a discrepancy it already acted on', async () => {
    api.getProjectListing.mockResolvedValue(listing([{ path: 'lib/a.ts', hash: 'ha2' }]))
    const { invalidate, client } = setup()
    loaded(client, { id: 'v3' }, 'g3')
    await waitFor(() => expect(sourceRefetches(invalidate)).toBe(1))
    await client.refetchQueries({ queryKey: ['ide-project-listing', 'wf'] })
    expect(api.getProjectListing).toHaveBeenCalledTimes(2)
    expect(sourceRefetches(invalidate)).toBe(1)
  })

  it('judges against the files as they are now, not as they were when polling began', async () => {
    api.getProjectListing.mockResolvedValue(listing([{ path: 'lib/a.ts', hash: 'ha2' }]))
    const { invalidate, client, view } = setup()
    loaded(client, { id: 'v3' }, 'g3')
    await waitFor(() => expect(sourceRefetches(invalidate)).toBe(1))
    // The source refetch lands: the loaded files now carry the new hash.
    view.rerender({ stored: new Map([['lib/a.ts', { hash: 'ha2' }]]) })
    await client.refetchQueries({ queryKey: ['ide-project-listing', 'wf'] })
    expect(sourceRefetches(invalidate)).toBe(1)
  })

  it('makes no requests while disabled (an older version, or before the source loaded)', async () => {
    setup(false)
    await new Promise((r) => setTimeout(r, 30))
    expect(api.getProjectListing).not.toHaveBeenCalled()
  })

  it('polls every 20 seconds, never from a hidden tab, and again on focus', () => {
    api.getProjectListing.mockResolvedValue(listing([]))
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
    api.getProjectListing.mockResolvedValue(listing([{ path: 'lib/a.ts', hash: 'ha' }]))
    setup()
    await waitFor(() => expect(api.getProjectListing).toHaveBeenCalledTimes(1))
    act(() => {
      window.dispatchEvent(new Event('focus'))
    })
    await waitFor(() => expect(api.getProjectListing).toHaveBeenCalledTimes(2))
  })

  it('does not stack requests when focus and visibilitychange arrive together', async () => {
    let finish: (v: unknown) => void = () => {}
    api.getProjectListing
      .mockResolvedValueOnce(listing([{ path: 'lib/a.ts', hash: 'ha' }]))
      .mockImplementationOnce(() => new Promise((resolve) => (finish = resolve)))
    setup()
    await waitFor(() => expect(api.getProjectListing).toHaveBeenCalledTimes(1))
    act(() => {
      window.dispatchEvent(new Event('focus'))
      document.dispatchEvent(new Event('visibilitychange'))
    })
    await new Promise((r) => setTimeout(r, 20))
    expect(api.getProjectListing).toHaveBeenCalledTimes(2)
    finish(listing([{ path: 'lib/a.ts', hash: 'ha' }]))
  })

  it('tries the source again at the next check when its refetch failed', async () => {
    api.getProjectListing.mockResolvedValue(listing([{ path: 'lib/a.ts', hash: 'ha2' }]))
    const { invalidate, client } = setup()
    loaded(client, { id: 'v3' }, 'g3')
    invalidate.mockRejectedValueOnce(new Error('network'))
    await waitFor(() => expect(sourceRefetches(invalidate)).toBe(1))
    await client.refetchQueries({ queryKey: ['ide-project-listing', 'wf'] }).catch(() => undefined)
    await waitFor(() => expect(sourceRefetches(invalidate)).toBe(2))
  })

  describe('a version saved elsewhere', () => {
    it('refetches the workflow, then the source, when the listing names a newer version', async () => {
      api.getProjectListing.mockResolvedValue(
        listing([{ path: 'lib/a.ts', hash: 'ha' }], { id: 'v4', graphHash: 'g4' }),
      )
      const { invalidate, client } = setup()
      loaded(client, { id: 'v3' }, 'g3')
      invalidate.mockResolvedValue(undefined)
      await waitFor(() => expect(sourceRefetches(invalidate)).toBe(1))
      expect(fullRefetches(invalidate)).toBe(1)
      const order = invalidate.mock.calls.map(([f]) => (f as { queryKey: string[] }).queryKey[0])
      expect(order).toEqual(['workflow-full', 'workflow-source'])
    })

    it('notices a save over the same version by its graph hash alone', async () => {
      api.getProjectListing.mockResolvedValue(
        listing([{ path: 'lib/a.ts', hash: 'ha' }], { id: 'v3', graphHash: 'g3b' }),
      )
      const { invalidate, client } = setup()
      loaded(client, { id: 'v3' }, 'g3')
      invalidate.mockResolvedValue(undefined)
      await waitFor(() => expect(fullRefetches(invalidate)).toBe(1))
    })

    it('reads the workflow, then the source, when a blank workflow got its first version', async () => {
      api.getProjectListing.mockResolvedValue(
        listing([{ path: 'lib/a.ts', hash: 'ha' }], { id: 'v1', graphHash: 'g1' }),
      )
      const { invalidate, client } = setup()
      loaded(client, null, null)
      invalidate.mockResolvedValue(undefined)
      await waitFor(() => expect(sourceRefetches(invalidate)).toBe(1))
      expect(fullRefetches(invalidate)).toBe(1)
    })

    it('leaves everything alone while a blank workflow still has no version', async () => {
      api.getProjectListing.mockResolvedValue(listing([{ path: 'lib/a.ts', hash: 'ha' }], null))
      const { invalidate, client } = setup()
      loaded(client, null, null)
      await waitFor(() => expect(api.getProjectListing).toHaveBeenCalled())
      await new Promise((r) => setTimeout(r, 20))
      expect(invalidate).not.toHaveBeenCalled()
    })

    it('compares the version the workspace loaded, not another version in the cache', async () => {
      api.getProjectListing.mockResolvedValue(listing([{ path: 'lib/a.ts', hash: 'ha' }]))
      const { invalidate, client } = setup(true, stored, 'v-3')
      client.setQueryData(['workflow-full', 'wf', 'v-3'], {
        version: { id: 'v3' },
        graphHash: 'g3',
      })
      // Left over from reading an older version earlier.
      client.setQueryData(['workflow-full', 'wf', 'v-1'], {
        version: { id: 'v1' },
        graphHash: 'g1',
      })
      await waitFor(() => expect(api.getProjectListing).toHaveBeenCalled())
      await new Promise((r) => setTimeout(r, 20))
      expect(invalidate).not.toHaveBeenCalled()
    })

    it('refetches once for a version the loaded one never comes to agree with, not every tick', async () => {
      api.getProjectListing.mockResolvedValue(
        listing([{ path: 'lib/a.ts', hash: 'ha' }], { id: 'v4', graphHash: 'g4' }),
      )
      const { invalidate, client } = setup()
      loaded(client, { id: 'v3' }, 'g3')
      // The refetch lands but leaves the cache where it was (an anomaly).
      invalidate.mockResolvedValue(undefined)
      await waitFor(() => expect(fullRefetches(invalidate)).toBe(1))
      await pollAgain(client)
      expect(api.getProjectListing).toHaveBeenCalledTimes(2)
      expect(fullRefetches(invalidate)).toBe(1)
      // A further version is still noticed.
      api.getProjectListing.mockResolvedValue(
        listing([{ path: 'lib/a.ts', hash: 'ha' }], { id: 'v5', graphHash: 'g5' }),
      )
      await pollAgain(client)
      expect(fullRefetches(invalidate)).toBe(2)
    })

    it('does not count a version as handled when its refetch failed', async () => {
      api.getProjectListing.mockResolvedValue(
        listing([{ path: 'lib/a.ts', hash: 'ha' }], { id: 'v4', graphHash: 'g4' }),
      )
      const { invalidate, client } = setup()
      loaded(client, { id: 'v3' }, 'g3')
      invalidate.mockRejectedValueOnce(new Error('network'))
      await waitFor(() => expect(fullRefetches(invalidate)).toBe(1))
      invalidate.mockResolvedValue(undefined)
      await pollAgain(client)
      expect(fullRefetches(invalidate)).toBe(2)
    })

    it('does nothing with the version while the workflow is not in the cache yet', async () => {
      api.getProjectListing.mockResolvedValue(
        listing([{ path: 'lib/a.ts', hash: 'ha' }], { id: 'v4', graphHash: 'g4' }),
      )
      const { invalidate } = setup()
      await waitFor(() => expect(api.getProjectListing).toHaveBeenCalled())
      await new Promise((r) => setTimeout(r, 20))
      expect(invalidate).not.toHaveBeenCalled()
    })
  })
})
