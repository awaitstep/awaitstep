import { render, screen } from '@testing-library/react'
import { act } from 'react'
import { beforeEach, describe, expect, it } from 'vitest'
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
    render(<RestoredDraftsBanner />)
    expect(screen.getByRole('status')).toHaveTextContent('Restored 2 unsaved files')
    expect(screen.getByRole('status')).toHaveTextContent(
      'charge.ts has changed since you edited it',
    )
  })

  it('goes away once the restored files are no longer unsaved', () => {
    restore(['a.ts'])
    render(<RestoredDraftsBanner />)
    act(() => useIdeStore.getState().clearDrafts())
    expect(screen.queryByRole('status')).toBeNull()
  })

  it('reports edits dropped because the file was deleted, with no Show button', () => {
    restore([], [], ['gone.ts'])
    render(<RestoredDraftsBanner />)
    expect(screen.getByRole('status')).toHaveTextContent('gone.ts was deleted since you edited it')
    expect(screen.queryByRole('button', { name: 'Show' })).toBeNull()
  })

  it('Discard drops the restored drafts', async () => {
    restore(['a.ts'])
    render(<RestoredDraftsBanner />)
    act(() => screen.getByRole('button', { name: 'Discard' }).click())
    expect(useIdeStore.getState().drafts).toEqual({})
  })
})
