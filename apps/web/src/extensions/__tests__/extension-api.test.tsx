import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useExtensionMutation, useExtensionQuery } from '../extension-api'

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

const answers = (...bodies: unknown[]) => {
  const fetchMock = vi.fn(async () => Response.json(bodies.shift()))
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

describe('an extension’s own API', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('reads a path below /api/ext/<id>, with the session', async () => {
    const fetchMock = answers({ things: [1] })
    const { result } = renderHook(
      () => useExtensionQuery<{ things: number[] }>('acme', '/workspaces/w1/things'),
      { wrapper },
    )
    await waitFor(() => expect(result.current.data).toEqual({ things: [1] }))
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toMatch(/\/api\/ext\/acme\/workspaces\/w1\/things$/)
    expect(init.credentials).toBe('include')
  })

  it('does not read while switched off', () => {
    const fetchMock = answers({})
    renderHook(() => useExtensionQuery('acme', '/things', false), { wrapper })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('writes with the body, then reads again what the write changes', async () => {
    const fetchMock = answers({ things: [1] }, { ok: true }, { things: [1, 2] })
    const { result } = renderHook(
      () => ({
        things: useExtensionQuery<{ things: number[] }>('acme', '/things'),
        add: useExtensionMutation<{ id: number }>('acme', {
          method: 'PUT',
          path: ({ id }) => `/things/${id}`,
          body: ({ id }) => ({ id }),
          refreshes: '/things',
        }),
      }),
      { wrapper },
    )
    await waitFor(() => expect(result.current.things.data).toEqual({ things: [1] }))
    result.current.add.mutate({ id: 2 })
    await waitFor(() => expect(result.current.things.data).toEqual({ things: [1, 2] }))
    const [url, init] = fetchMock.mock.calls[1] as unknown as [string, RequestInit]
    expect(url).toMatch(/\/api\/ext\/acme\/things\/2$/)
    expect(init).toMatchObject({ method: 'PUT', body: '{"id":2}' })
  })
})
