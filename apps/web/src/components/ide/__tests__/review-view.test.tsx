import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useIdeStore } from '../../../stores/ide-store'
import { ReviewView } from '../review-view'
import { makeReviewBindings, sourceFile } from './fixtures/review-bindings'

// The pane is Monaco; what matters here is what it is handed and what the toolbar does.
const pane = vi.hoisted(() => ({ props: [] as Record<string, unknown>[] }))
vi.mock('../diff-pane', () => ({
  DiffPane: (props: Record<string, unknown>) => {
    pane.props.push(props)
    return <div data-testid="diff">{String(props.path)}</div>
  },
}))

const baseline = new Map([
  ['a.ts', sourceFile('a.ts', 'saved a', 'ha')],
  ['lib/b.ts', sourceFile('lib/b.ts', 'saved b', 'hb')],
])
const files = new Map([
  ['a.ts', sourceFile('a.ts', 'mine a')],
  ['lib/b.ts', sourceFile('lib/b.ts', 'mine b')],
])

function setup(overrides = {}) {
  const bindings = makeReviewBindings({ baseline, files, ...overrides })
  render(<ReviewView bindings={bindings} />)
  return bindings
}

function dirtyBoth() {
  const s = useIdeStore.getState()
  s.setDraft('a.ts', 'mine a', 'ha')
  s.setDraft('lib/b.ts', 'mine b', 'hb')
}

beforeEach(() => {
  useIdeStore.getState().resetSession()
  pane.props = []
})

describe('ReviewView', () => {
  it('opens on the first unsaved file with saved text on the left and the unsaved file on the right', () => {
    dirtyBoth()
    setup()
    expect(screen.getByTestId('diff')).toHaveTextContent('a.ts')
    const last = pane.props.at(-1)!
    expect(last).toMatchObject({ original: 'saved a', originalKind: 'saved', modified: 'mine a' })
    expect(screen.getByText('file 1 of 2')).toBeInTheDocument()
    expect(screen.getByText('Saved · read-only')).toBeInTheDocument()
    expect(screen.getByText('Unsaved · editable')).toBeInTheDocument()
  })

  it('opens on the file it was asked for', () => {
    dirtyBoth()
    useIdeStore.getState().setReviewPath('lib/b.ts')
    setup()
    expect(screen.getByTestId('diff')).toHaveTextContent('lib/b.ts')
    expect(screen.getByText('file 2 of 2')).toBeInTheDocument()
  })

  it('steps between files with the file buttons', async () => {
    dirtyBoth()
    setup()
    await userEvent.click(screen.getByRole('button', { name: 'Next file' }))
    expect(screen.getByTestId('diff')).toHaveTextContent('lib/b.ts')
    await userEvent.click(screen.getByRole('button', { name: 'Previous file' }))
    expect(screen.getByTestId('diff')).toHaveTextContent('a.ts')
  })

  it('keeps focus on the button just pressed when it changes file', async () => {
    dirtyBoth()
    setup()
    const next = screen.getByRole('button', { name: 'Next file' })
    await userEvent.click(next)
    expect(next).toHaveFocus()
  })

  it('stays on a file that typing made match its saved text, instead of jumping to the next', () => {
    dirtyBoth()
    setup()
    act(() => (pane.props.at(-1)!.onChange as (text: string) => void)('saved a'))
    act(() => useIdeStore.getState().clearDraft('a.ts'))
    expect(screen.getByTestId('diff')).toHaveTextContent('a.ts')
    expect(screen.getByText('no unsaved changes')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Save file' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Revert file' })).toBeDisabled()
  })

  it('leaves a file with no changes by the file buttons', async () => {
    dirtyBoth()
    setup()
    act(() => (pane.props.at(-1)!.onChange as (text: string) => void)('saved a'))
    act(() => useIdeStore.getState().clearDraft('a.ts'))
    await userEvent.click(screen.getByRole('button', { name: 'Next file' }))
    expect(screen.getByTestId('diff')).toHaveTextContent('lib/b.ts')
  })

  it('does not hand the keyboard to a pane that replaces another file’s', async () => {
    dirtyBoth()
    setup()
    expect(pane.props.at(-1)!.autoFocus).toBe(true)
    await userEvent.click(screen.getByRole('button', { name: 'Next file' }))
    expect(screen.getByTestId('diff')).toHaveTextContent('lib/b.ts')
    expect(pane.props.at(-1)!.autoFocus).toBe(false)
  })

  it('says what the empty left side means for a file deleted on the server', () => {
    useIdeStore.getState().setDraft('lib/gone.ts', 'mine', 'hg')
    setup({ files: new Map([['lib/gone.ts', sourceFile('lib/gone.ts', 'mine')]]) })
    expect(screen.getByText('Deleted on the server · nothing saved')).toBeInTheDocument()
    expect(screen.queryByText('Saved · read-only')).toBeNull()
  })

  it('Revert file hands the file to the workspace and lands on the one that remains', async () => {
    dirtyBoth()
    const bindings = setup()
    await userEvent.click(screen.getByRole('button', { name: 'Revert file' }))
    expect(bindings.onRevert).toHaveBeenCalledWith('a.ts')
    expect(useIdeStore.getState().reviewPath).toBe('lib/b.ts')
  })

  it('Save file lands on the next file once it saved, and stays put when it did not', async () => {
    dirtyBoth()
    const onSave = vi.fn().mockResolvedValueOnce(false).mockResolvedValueOnce(true)
    setup({ onSave })
    await userEvent.click(screen.getByRole('button', { name: 'Save file' }))
    expect(useIdeStore.getState().reviewPath).toBeNull()
    await userEvent.click(screen.getByRole('button', { name: 'Save file' }))
    expect(onSave).toHaveBeenCalledWith('a.ts')
    expect(useIdeStore.getState().reviewPath).toBe('lib/b.ts')
  })

  it('Save file does not yank the view back if the person moved on while it saved', async () => {
    dirtyBoth()
    let finish: (saved: boolean) => void = () => {}
    const onSave = vi.fn(() => new Promise<boolean>((resolve) => (finish = resolve)))
    setup({ onSave })
    await userEvent.click(screen.getByRole('button', { name: 'Save file' }))
    act(() => useIdeStore.getState().setReviewPath('lib/b.ts'))
    await act(async () => finish(true))
    expect(useIdeStore.getState().reviewPath).toBe('lib/b.ts')
  })

  it('Save all calls the workspace', async () => {
    dirtyBoth()
    const bindings = setup()
    await userEvent.click(screen.getByRole('button', { name: 'Save all' }))
    expect(bindings.onSaveAll).toHaveBeenCalled()
  })

  it('typing on the right goes to the workspace as that file’s change', () => {
    dirtyBoth()
    const bindings = setup()
    const onChange = pane.props.at(-1)!.onChange as (text: string) => void
    onChange('typed')
    expect(bindings.onChange).toHaveBeenCalledWith('a.ts', 'typed')
  })

  it('reports the number of changes the diff found', () => {
    dirtyBoth()
    setup()
    act(() => (pane.props.at(-1)!.onChangeCount as (n: number) => void)(2))
    expect(screen.getByText('file 1 of 2 · 2 changes')).toBeInTheDocument()
  })

  it('shows Inline and Side by side as a choice that holds', async () => {
    dirtyBoth()
    setup()
    expect(screen.getByRole('button', { name: 'Side by side' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    await userEvent.click(screen.getByRole('button', { name: 'Inline' }))
    expect(useIdeStore.getState().reviewInline).toBe(true)
    expect(pane.props.at(-1)!.sideBySide).toBe(false)
  })

  it('switches to inline by itself when the editor is narrower than 1,100 px', () => {
    vi.stubGlobal(
      'ResizeObserver',
      class {
        constructor(cb: (entries: { contentRect: { width: number } }[]) => void) {
          queueMicrotask(() => cb([{ contentRect: { width: 1000 } }]))
        }
        observe() {}
        disconnect() {}
      },
    )
    dirtyBoth()
    setup()
    return vi
      .waitFor(() => {
        expect(pane.props.at(-1)!.sideBySide).toBe(false)
        expect(screen.getByRole('button', { name: 'Side by side' })).toHaveAttribute(
          'aria-pressed',
          'false',
        )
      })
      .finally(() => vi.unstubAllGlobals())
  })

  it('offers Compare with server only for a file the server moved on from', () => {
    useIdeStore.getState().setDraft('a.ts', 'mine a', 'stale')
    useIdeStore.getState().setDraft('lib/b.ts', 'mine b', 'hb')
    const bindings = setup()
    act(() => screen.getByRole('button', { name: 'Compare with server' }).click())
    expect(bindings.onCompare).toHaveBeenCalledWith('a.ts')
    act(() => useIdeStore.getState().setReviewPath('lib/b.ts'))
    expect(screen.queryByRole('button', { name: 'Compare with server' })).toBeNull()
  })

  it('shows "No unsaved changes" with Close once nothing is left, and Close closes the tab', async () => {
    dirtyBoth()
    useIdeStore.getState().openReview()
    setup()
    act(() => useIdeStore.getState().clearDrafts())
    expect(screen.getByText('No unsaved changes')).toBeInTheDocument()
    const close = screen.getByRole('button', { name: 'Close' })
    // The buttons that were pressed vanished with the diff: focus must not fall to the page.
    expect(close).toHaveFocus()
    await userEvent.click(close)
    expect(useIdeStore.getState().openPaths).not.toContain('ide:review')
  })

  it('a file that cannot be edited says so and disables the writes', () => {
    dirtyBoth()
    setup({ canEdit: false })
    expect(screen.getByText('Unsaved · read-only')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Save all' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Revert file' })).toBeDisabled()
  })
})
