import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useIdeStore } from '../../../stores/ide-store'
import { FileStateBanner } from '../file-state-banner'
import { makeReviewBindings, sourceFile } from './fixtures/review-bindings'

beforeEach(() => useIdeStore.getState().resetSession())

const baseline = new Map([['lib/charge.ts', sourceFile('lib/charge.ts', 'server', 'h2')]])

function setup(path = 'lib/charge.ts') {
  const bindings = makeReviewBindings({ baseline })
  render(<FileStateBanner path={path} bindings={bindings} />)
  return bindings
}

describe('FileStateBanner focus', () => {
  it.each([
    ['lib/charge.ts', 'h1', 'Keep my edits'],
    ['lib/charge.ts', 'h1', 'Use server version'],
    ['lib/gone.ts', 'hg', 'Save to recreate'],
    ['lib/gone.ts', 'hg', 'Discard'],
  ])(
    '%s: %s hands the keyboard to the editor, as the banner goes away',
    async (path, hash, name) => {
      const focus = vi.fn()
      useIdeStore.getState().setEditorHandle({ focus, trigger: vi.fn(), searchSeed: vi.fn() })
      useIdeStore.getState().setDraft(path, 'mine', hash)
      setup(path)
      await userEvent.click(screen.getByRole('button', { name }))
      await vi.waitFor(() => expect(focus).toHaveBeenCalledTimes(1))
    },
  )
})

describe('FileStateBanner', () => {
  it('shows nothing for a file with no unsaved text, even if the server moved on', () => {
    setup()
    expect(screen.queryByRole('status')).toBeNull()
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('says a file changed on the server while edited, as a status with Compare first', () => {
    useIdeStore.getState().setDraft('lib/charge.ts', 'mine', 'h1')
    setup()
    expect(screen.getByRole('status')).toHaveTextContent(
      'charge.ts changed on the server while you were editing it.',
    )
    const names = screen.getAllByRole('button').map((b) => b.textContent)
    expect(names).toEqual(['Compare', 'Keep my edits', 'Use server version'])
  })

  it('shows nothing while the draft builds on the current server copy', () => {
    useIdeStore.getState().setDraft('lib/charge.ts', 'mine', 'h2')
    setup()
    expect(screen.queryByRole('status')).toBeNull()
  })

  it('Compare, and Use server version, hand the file to the workspace', async () => {
    useIdeStore.getState().setDraft('lib/charge.ts', 'mine', 'h1')
    const bindings = setup()
    await userEvent.click(screen.getByRole('button', { name: 'Compare' }))
    expect(bindings.onCompare).toHaveBeenCalledWith('lib/charge.ts')
    await userEvent.click(screen.getByRole('button', { name: 'Use server version' }))
    expect(bindings.onUseServerVersion).toHaveBeenCalledWith('lib/charge.ts', 'h2')
  })

  it('Keep my edits hides the banner, and a further change on the server brings it back', async () => {
    useIdeStore.getState().setDraft('lib/charge.ts', 'mine', 'h1')
    const bindings = makeReviewBindings({ baseline })
    const view = render(<FileStateBanner path="lib/charge.ts" bindings={bindings} />)
    await userEvent.click(screen.getByRole('button', { name: 'Keep my edits' }))
    expect(screen.queryByRole('status')).toBeNull()
    expect(useIdeStore.getState().dismissedOutside['lib/charge.ts']).toBe('h2')

    const newer = new Map([['lib/charge.ts', sourceFile('lib/charge.ts', 'server again', 'h3')]])
    view.rerender(
      <FileStateBanner path="lib/charge.ts" bindings={makeReviewBindings({ baseline: newer })} />,
    )
    expect(screen.getByRole('status')).toBeInTheDocument()
  })

  it('a refused save is an alert whose only action is Compare, with no Overwrite', () => {
    useIdeStore.getState().setDraft('lib/charge.ts', 'mine', 'h1')
    useIdeStore.getState().setConflict('lib/charge.ts', { currentHash: 'h2' })
    setup()
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Couldn’t save charge.ts. It changed on the server.',
    )
    expect(screen.getAllByRole('button').map((b) => b.textContent)).toEqual(['Compare'])
    expect(screen.queryByRole('status')).toBeNull()
  })

  it('the conflict stays even after Keep my edits dismissed the earlier banner', async () => {
    useIdeStore.getState().setDraft('lib/charge.ts', 'mine', 'h1')
    setup()
    await userEvent.click(screen.getByRole('button', { name: 'Keep my edits' }))
    act(() => useIdeStore.getState().setConflict('lib/charge.ts', { currentHash: 'h2' }))
    expect(screen.getByRole('alert')).toBeInTheDocument()
  })

  it('a deleted file with unsaved text keeps its copy and offers to recreate or discard', async () => {
    useIdeStore.getState().setDraft('lib/gone.ts', 'mine', 'hg')
    const bindings = setup('lib/gone.ts')
    expect(screen.getByRole('status')).toHaveTextContent(
      'gone.ts was deleted on the server. Your unsaved copy is kept.',
    )
    await userEvent.click(screen.getByRole('button', { name: 'Save to recreate' }))
    expect(bindings.onRecreate).toHaveBeenCalledWith('lib/gone.ts')
    await userEvent.click(screen.getByRole('button', { name: 'Discard' }))
    expect(bindings.onDiscardDeleted).toHaveBeenCalledWith('lib/gone.ts')
  })

  it('a deleted file outranks a recorded conflict', () => {
    useIdeStore.getState().setDraft('lib/gone.ts', 'mine', 'hg')
    useIdeStore.getState().setConflict('lib/gone.ts', { currentHash: null })
    setup('lib/gone.ts')
    expect(screen.queryByRole('alert')).toBeNull()
    expect(screen.getByRole('status')).toHaveTextContent('was deleted on the server')
  })
})
