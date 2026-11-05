import { act, renderHook } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useIdeStore } from '../../stores/ide-store'
import { useCompareCache } from '../use-compare-cache'

let signedOut: () => void = () => undefined
vi.mock('../../lib/auth-signal', () => ({
  onSignedOutElsewhere: (listener: () => void) => {
    signedOut = listener
    return () => {
      signedOut = () => undefined
    }
  },
}))

const A = ['ide-compare', 'wf', 'a.ts']
const B = ['ide-compare', 'wf', 'b.ts']
const OTHER = ['ide-compare', 'other', 'a.ts']

function setup() {
  const client = new QueryClient()
  for (const key of [A, B, OTHER]) client.setQueryData(key, { hash: 'h' })
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  )
  const view = renderHook(() => useCompareCache('wf'), { wrapper })
  return { client, view }
}

beforeEach(() => useIdeStore.getState().resetSession())

describe('useCompareCache', () => {
  it('drops the copy when its Compare tab closes and keeps the others', () => {
    const { client } = setup()
    act(() => {
      useIdeStore.getState().openCompare('a.ts')
      useIdeStore.getState().openCompare('b.ts')
    })
    expect(client.getQueryData(A)).toBeDefined()
    act(() => useIdeStore.getState().closeFile('ide:compare:a.ts'))
    expect(client.getQueryData(A)).toBeUndefined()
    expect(client.getQueryData(B)).toBeDefined()
  })

  it('drops every copy of the workflow on unmount, and only that workflow', () => {
    const { client, view } = setup()
    view.unmount()
    expect(client.getQueryData(A)).toBeUndefined()
    expect(client.getQueryData(B)).toBeUndefined()
    expect(client.getQueryData(OTHER)).toBeDefined()
  })

  it('drops every copy when another tab signs out', () => {
    const { client } = setup()
    act(() => signedOut())
    expect(client.getQueryData(A)).toBeUndefined()
    expect(client.getQueryData(OTHER)).toBeUndefined()
  })
})
