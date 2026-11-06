import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ItemTestScope } from '../../../__tests__/fixtures/item-scope'
import { useLockDeployed } from '../use-lock-deployed'

vi.mock('../../../lib/api-client', () => ({
  api: { lockVersion: () => Promise.resolve({ id: 'v3', locked: 1 }) },
}))

describe('useLockDeployed', () => {
  it('refreshes what is live on each account, where the banner, menu and Deploy read the lock', async () => {
    const queryClient = new QueryClient()
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries')
    function wrapper({ children }: { children: ReactNode }) {
      return (
        <QueryClientProvider client={queryClient}>
          <ItemTestScope>{children}</ItemTestScope>
        </QueryClientProvider>
      )
    }
    const { result } = renderHook(() => useLockDeployed('wf_1', 'v3'), { wrapper })
    await act(() => result.current.mutateAsync(true))
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['deploy-connections', 'wf_1'] })
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['versions', 'wf_1'] })
  })
})
