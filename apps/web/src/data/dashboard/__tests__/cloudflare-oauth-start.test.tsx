import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useStartCloudflareOAuth } from '../org-settings'

// Connecting with Cloudflare: one POST records the pending authorization, then
// the browser goes to the URL it answers — once, however often it is pressed.

const fetchMock = vi.fn()
const assign = vi.fn()
const AUTHORIZE = 'https://dash.cloudflare.com/oauth2/auth?state=s-1'

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock)
  vi.stubGlobal('location', { href: 'http://localhost/acme/connections', assign })
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  fetchMock.mockReset()
  assign.mockReset()
})

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } })
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

describe('useStartCloudflareOAuth', () => {
  it('posts where the account goes, then sends the browser to Cloudflare', async () => {
    fetchMock.mockResolvedValue(json({ url: AUTHORIZE }))
    const { result } = renderHook(() => useStartCloudflareOAuth(), { wrapper })

    act(() =>
      result.current.start({ org: 'acme', options: { project: 'billing', connectionId: 'c-1' } }),
    )

    await waitFor(() => expect(assign).toHaveBeenCalledWith(AUTHORIZE))
    const [url, init] = fetchMock.mock.calls[0]!
    expect(String(url)).toContain('/oauth/cloudflare/start')
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body)).toEqual({ org: 'acme', project: 'billing', connection: 'c-1' })
  })

  it('starts once however often it is pressed, until the page is back', async () => {
    fetchMock.mockResolvedValue(json({ url: AUTHORIZE }))
    const { result } = renderHook(() => useStartCloudflareOAuth(), { wrapper })

    act(() => result.current.start({ org: 'acme' }))
    await waitFor(() => expect(result.current.starting).toBe(true))
    act(() => result.current.start({ org: 'acme' }))
    await waitFor(() => expect(assign).toHaveBeenCalledOnce())
    // Leaving for Cloudflare: still starting, a press does nothing.
    act(() => result.current.start({ org: 'acme' }))
    expect(fetchMock).toHaveBeenCalledOnce()

    // Back from Cloudflare with the browser's Back button.
    act(() => {
      window.dispatchEvent(new Event('pageshow'))
    })
    await waitFor(() => expect(result.current.starting).toBe(false))
    act(() => result.current.start({ org: 'acme' }))
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2))
  })

  it('never navigates to an address that isn’t a web page', async () => {
    fetchMock.mockResolvedValue(json({ url: 'javascript:alert(1)' }))
    const { result } = renderHook(() => useStartCloudflareOAuth(), { wrapper })

    act(() => result.current.start({ org: 'acme' }))
    await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce())
    await waitFor(() => expect(result.current.starting).toBe(false))
    expect(assign).not.toHaveBeenCalled()
  })

  it('stays on the page when the start is refused, ready to try again', async () => {
    fetchMock.mockResolvedValue(
      json({ error: 'Too many authorizations are pending. Try again in a minute.' }, 429),
    )
    const { result } = renderHook(() => useStartCloudflareOAuth(), { wrapper })

    act(() => result.current.start({ org: 'acme' }))
    await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce())
    await waitFor(() => expect(result.current.starting).toBe(false))
    expect(assign).not.toHaveBeenCalled()
  })
})
