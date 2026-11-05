import { render, screen } from '@testing-library/react'
import { act } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useIdeStore } from '../../../stores/ide-store'
import { RestoredDraftsBanner } from '../restored-drafts-banner'

beforeEach(() => useIdeStore.getState().resetSession())

function restore(paths: string[], changedOnServer: string[] = [], deleted: string[] = []) {
  const store = useIdeStore.getState()
  for (const path of paths) store.setDraft(path, 'x', 'h')
  store.setRestoreNotice({ paths, changedOnServer, deleted })
}

describe('RestoredDraftsBanner', () => {
  it('names the count and a file that changed on the server', () => {
    restore(['a.ts', 'lib/charge.ts'], ['lib/charge.ts'])
    render(<RestoredDraftsBanner onCompare={vi.fn()} />)
    expect(screen.getByRole('status')).toHaveTextContent('Restored 2 unsaved files')
    expect(screen.getByRole('status')).toHaveTextContent(
      'charge.ts has changed on the server since you edited it',
    )
  })

  it('offers Compare for each restored file that moved on, and no longer says saving will ask', () => {
    restore(['a.ts', 'lib/charge.ts'], ['lib/charge.ts'])
    const onCompare = vi.fn()
    render(<RestoredDraftsBanner onCompare={onCompare} />)
    expect(screen.getByRole('status')).not.toHaveTextContent('Saving will ask first')
    expect(screen.queryByRole('button', { name: 'Compare a.ts' })).toBeNull()
    act(() => screen.getByRole('button', { name: 'Compare charge.ts' }).click())
    expect(onCompare).toHaveBeenCalledWith('lib/charge.ts')
  })

  it('goes away once the restored files are no longer unsaved', () => {
    restore(['a.ts'])
    render(<RestoredDraftsBanner onCompare={vi.fn()} />)
    act(() => useIdeStore.getState().clearDrafts())
    expect(screen.queryByRole('status')).toBeNull()
  })

  it('says a deleted file’s copy is kept, and still offers Show and Discard', () => {
    restore(['gone.ts'], [], ['gone.ts'])
    act(() => useIdeStore.getState().setDraft('gone.ts', 'x', 'hg'))
    render(<RestoredDraftsBanner onCompare={vi.fn()} />)
    expect(screen.getByRole('status')).toHaveTextContent(
      'gone.ts was deleted on the server since you edited it. Your copy is kept.',
    )
    expect(screen.getByRole('button', { name: 'Show' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Discard' })).toBeTruthy()
  })

  it('Discard drops the restored drafts', async () => {
    restore(['a.ts'])
    render(<RestoredDraftsBanner onCompare={vi.fn()} />)
    act(() => screen.getByRole('button', { name: 'Discard' }).click())
    expect(useIdeStore.getState().drafts).toEqual({})
  })
})
