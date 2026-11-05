import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useIdeStore } from '../../../stores/ide-store'
import { UnsavedChangesDialog } from '../../workflows/unsaved-changes-dialog'
import { CloseDirtyDialog } from '../close-dirty-dialog'

beforeEach(() => useIdeStore.getState().resetSession())

describe('CloseDirtyDialog', () => {
  function open() {
    const store = useIdeStore.getState()
    store.openFile('a.ts')
    store.openFile('b.ts')
    store.setDraft('a.ts', 'x', 'h')
    store.setDraft('b.ts', 'y', 'h')
    const props = { onSave: vi.fn(), onDiscard: vi.fn(), onReview: vi.fn(), saving: false }
    render(<CloseDirtyDialog {...props} />)
    act(() => useIdeStore.getState().requestClose(['a.ts', 'b.ts']))
    return props
  }

  it('Review… cancels the close, keeps every tab and review starts on the first unsaved file', async () => {
    const props = open()
    await userEvent.click(await screen.findByRole('button', { name: 'Review…' }))
    expect(props.onReview).toHaveBeenCalledWith('a.ts')
    expect(useIdeStore.getState().closeRequest).toBeNull()
    expect(useIdeStore.getState().openPaths).toEqual(['a.ts', 'b.ts'])
    expect(props.onSave).not.toHaveBeenCalled()
    expect(props.onDiscard).not.toHaveBeenCalled()
  })
})

describe('focus after Review…', () => {
  function editorHandle() {
    const focus = vi.fn()
    useIdeStore.getState().setEditorHandle({ focus, trigger: vi.fn(), searchSeed: vi.fn() })
    return focus
  }

  it('goes to the editor, not back to the button that opened the dialog', async () => {
    const focus = editorHandle()
    const opener = document.createElement('button')
    document.body.append(opener)
    opener.focus()
    const onReview = vi.fn()
    render(
      <UnsavedChangesDialog
        open
        unsaved="2 files have unsaved changes."
        switchTarget={null}
        canSave
        saving={false}
        onCancel={vi.fn()}
        onSaveAndGo={vi.fn()}
        onDiscardAndGo={vi.fn()}
        onReview={onReview}
      />,
    )
    await userEvent.click(screen.getByRole('button', { name: 'Review…' }))
    await vi.waitFor(() => expect(focus).toHaveBeenCalled())
    opener.remove()
  })
})

describe('UnsavedChangesDialog', () => {
  function renderDialog(onReview?: () => void) {
    const props = {
      open: true,
      unsaved: '2 files have unsaved changes.',
      switchTarget: null,
      canSave: true,
      saving: false,
      onCancel: vi.fn(),
      onSaveAndGo: vi.fn(),
      onDiscardAndGo: vi.fn(),
      ...(onReview && { onReview }),
    }
    render(<UnsavedChangesDialog {...props} />)
    return props
  }

  it('offers Review… only where there is somewhere to review', () => {
    renderDialog()
    expect(screen.queryByRole('button', { name: 'Review…' })).toBeNull()
  })

  it('Review… goes to the review without saving or discarding', async () => {
    const onReview = vi.fn()
    const props = renderDialog(onReview)
    await userEvent.click(screen.getByRole('button', { name: 'Review…' }))
    expect(onReview).toHaveBeenCalledTimes(1)
    expect(props.onSaveAndGo).not.toHaveBeenCalled()
    expect(props.onDiscardAndGo).not.toHaveBeenCalled()
  })
})
