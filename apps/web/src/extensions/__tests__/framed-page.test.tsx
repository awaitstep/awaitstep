import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useFramedPage } from '../../components/workflow-detail/use-framed-page'
import { useInstanceStore } from '../../stores/instance-store'

vi.mock('virtual:awaitstep/extensions', async () => {
  const { testExtension } = await import('./fixtures/test-extension')
  return { default: [testExtension] }
})
let params: Record<string, string> = {}
vi.mock('@tanstack/react-router', () => ({ useParams: () => params }))

function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={new QueryClient()}>{children}</QueryClientProvider>
}

const declared = { kind: 'extension', scope: 'workspace' } as const

describe('useFramedPage on an extension page', () => {
  beforeEach(() => {
    params = { org: 'acme', project: 'p', workspace: 'w', _splat: 'test-ext/history/r_1' }
    useInstanceStore.setState({ features: ['test-ext'] })
  })

  it('names the page its URL resolves to, for the crumbs and the marked nav item', () => {
    const { result } = renderHook(() => useFramedPage(declared, undefined), { wrapper })
    expect(result.current).toEqual({
      ...declared,
      page: { key: 'ext:test-ext/history', title: 'Assistant history' },
    })
  })

  it('names no page while the extension is not listed', () => {
    useInstanceStore.setState({ features: [] })
    const { result } = renderHook(() => useFramedPage(declared, undefined), { wrapper })
    expect(result.current).toEqual({ ...declared, page: undefined })
  })
})
