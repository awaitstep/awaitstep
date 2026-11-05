import { renderHook } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useIdeStore } from '../../stores/ide-store'
import { useReviewActions } from '../use-review-actions'

const KEY = ['ide-compare', 'wf', 'a.ts']

function setup() {
  const client = new QueryClient()
  client.setQueryData(KEY, { hash: 'old' })
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  )
  const { result } = renderHook(
    () =>
      useReviewActions({
        workflowId: 'wf',
        files: new Map(),
        baseline: new Map(),
        canEdit: true,
        projectFiles: { busy: false } as never,
        draftUndo: {} as never,
        editabilityOf: () => ({ readOnly: false, message: null }),
        onChange: vi.fn(),
      }),
    { wrapper },
  )
  return { client, bindings: result.current }
}

beforeEach(() => useIdeStore.getState().resetSession())

describe('useReviewActions onCompare', () => {
  it('opening Compare afresh drops the copy a closed tab kept, so it reads the server again', () => {
    const { client, bindings } = setup()
    bindings.onCompare('a.ts')
    expect(client.getQueryData(KEY)).toBeUndefined()
    expect(useIdeStore.getState().activePath).toBe('ide:compare:a.ts')
  })

  it('keeps the copy of a Compare tab that is still open', () => {
    const { client, bindings } = setup()
    useIdeStore.getState().openCompare('a.ts')
    useIdeStore.getState().openFile('b.ts')
    bindings.onCompare('a.ts')
    expect(client.getQueryData(KEY)).toEqual({ hash: 'old' })
  })
})
