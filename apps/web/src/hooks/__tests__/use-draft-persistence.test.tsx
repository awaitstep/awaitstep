import { act, renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { DraftStorage, StoredDrafts } from '../../lib/ide/draft-persistence'
import { useAuthStore } from '../../stores/auth-store'
import { useIdeStore } from '../../stores/ide-store'

const memory = vi.hoisted(() => ({ data: new Map<string, unknown>() }))

vi.mock('../../lib/ide/draft-persistence', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>()
  const storage: DraftStorage = {
    get: async (key) => memory.data.get(key) as StoredDrafts | undefined,
    set: async (key, value) => void memory.data.set(key, value),
    del: async (key) => void memory.data.delete(key),
    keys: async () => [...memory.data.keys()],
  }
  return { ...actual, browserDraftStorage: storage }
})

const { useDraftPersistence } = await import('../use-draft-persistence')
const { draftKey } = await import('../../lib/ide/draft-persistence')

const baseline = new Map([
  ['a.ts', { source: 'base a', hash: 'ha' }],
  ['b.ts', { source: 'base b', hash: 'hb-new' }],
])

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

beforeEach(() => {
  memory.data.clear()
  useIdeStore.getState().resetSession()
  useAuthStore.setState({ user: { id: 'u1' } as never })
})

function seed(files: StoredDrafts['files']) {
  memory.data.set(draftKey('u1', 'wf'), { savedAt: Date.now(), files })
}

describe('useDraftPersistence', () => {
  it('restores stored drafts and names a file that changed on the server', async () => {
    seed({
      'a.ts': { source: 'edit a', baseHash: 'ha' },
      'b.ts': { source: 'edit b', baseHash: 'hb' },
    })
    renderHook(() => useDraftPersistence({ workflowId: 'wf', enabled: true, baseline }), {
      wrapper,
    })
    await waitFor(() =>
      expect(Object.keys(useIdeStore.getState().drafts)).toEqual(['a.ts', 'b.ts']),
    )
    expect(useIdeStore.getState().restoreNotice).toEqual({
      paths: ['a.ts', 'b.ts'],
      changedOnServer: ['b.ts'],
      deleted: [],
    })
  })

  it('keeps the stored copy of a file deleted since, restoring it and not overwriting storage', async () => {
    seed({ 'gone.ts': { source: 'my edit', baseHash: 'hg' } })
    renderHook(() => useDraftPersistence({ workflowId: 'wf', enabled: true, baseline }), {
      wrapper,
    })
    await waitFor(() => expect(Object.keys(useIdeStore.getState().drafts)).toEqual(['gone.ts']))
    expect(useIdeStore.getState().restoreNotice).toMatchObject({ deleted: ['gone.ts'] })
    await new Promise((resolve) => setTimeout(resolve, 100))
    expect(memory.data.get(draftKey('u1', 'wf'))).toMatchObject({
      files: { 'gone.ts': { source: 'my edit' } },
    })
  })

  it('mirrors later changes into storage and clears the entry once nothing is unsaved', async () => {
    renderHook(() => useDraftPersistence({ workflowId: 'wf', enabled: true, baseline }), {
      wrapper,
    })
    await waitFor(() => expect(memory.data.size).toBe(0))
    act(() => useIdeStore.getState().setDraft('a.ts', 'typed', 'ha'))
    await waitFor(() => expect(memory.data.has(draftKey('u1', 'wf'))).toBe(true))
    act(() => useIdeStore.getState().clearDraft('a.ts'))
    await waitFor(() => expect(memory.data.has(draftKey('u1', 'wf'))).toBe(false))
  })

  it('neither restores nor writes when disabled (an older version)', async () => {
    seed({ 'a.ts': { source: 'edit a', baseHash: 'ha' } })
    renderHook(() => useDraftPersistence({ workflowId: 'wf', enabled: false, baseline }), {
      wrapper,
    })
    act(() => useIdeStore.getState().setDraft('b.ts', 'x', 'hb'))
    await new Promise((resolve) => setTimeout(resolve, 600))
    expect(useIdeStore.getState().restoreNotice).toBeNull()
    expect(memory.data.get(draftKey('u1', 'wf'))).toMatchObject({
      files: { 'a.ts': { source: 'edit a' } },
    })
  })

  it('restores nothing for another account', async () => {
    seed({ 'a.ts': { source: 'edit a', baseHash: 'ha' } })
    useAuthStore.setState({ user: { id: 'u2' } as never })
    renderHook(() => useDraftPersistence({ workflowId: 'wf', enabled: true, baseline }), {
      wrapper,
    })
    await new Promise((resolve) => setTimeout(resolve, 100))
    expect(useIdeStore.getState().drafts).toEqual({})
  })

  it('never writes one account’s in-memory edits under another account when the user changes', async () => {
    renderHook(() => useDraftPersistence({ workflowId: 'wf', enabled: true, baseline }), {
      wrapper,
    })
    await waitFor(() => expect(memory.data.size).toBe(0))
    act(() => useIdeStore.getState().setDraft('a.ts', 'typed as u1', 'ha'))
    await waitFor(() => expect(memory.data.has(draftKey('u1', 'wf'))).toBe(true))

    act(() => useAuthStore.setState({ user: { id: 'u2' } as never }))
    await new Promise((resolve) => setTimeout(resolve, 700))

    expect(memory.data.has(draftKey('u2', 'wf'))).toBe(false)
    expect(useIdeStore.getState().drafts).toEqual({})
  })
})
