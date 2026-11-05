import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useIdeStore } from '../../../stores/ide-store'
import { EditorTabs } from '../editor-tabs'

const files = new Map([
  ['a.ts', { path: 'a.ts', source: '', role: 'module' as const }],
  ['b.ts', { path: 'b.ts', source: '', role: 'module' as const }],
])

beforeEach(() => {
  useIdeStore.getState().resetSession()
  useIdeStore.getState().openFile('a.ts')
  useIdeStore.getState().openFile('b.ts')
})

function renderTabs(dirty: string[] = [], onRevertFile = vi.fn()) {
  render(<EditorTabs files={files} dirty={new Set(dirty)} onRevertFile={onRevertFile} />)
  return onRevertFile
}

describe('tab context menu', () => {
  it('Close shuts the tab and does not re-open it through the portal', async () => {
    renderTabs()
    await userEvent.pointer({ keys: '[MouseRight]', target: screen.getAllByRole('tab')[0]! })
    await userEvent.click(await screen.findByRole('menuitem', { name: /^Close(?! all)/ }))
    expect(useIdeStore.getState().openPaths).toEqual(['b.ts'])
  })

  it('Close all leaves no tab behind', async () => {
    renderTabs()
    await userEvent.pointer({ keys: '[MouseRight]', target: screen.getAllByRole('tab')[0]! })
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Close all' }))
    expect(useIdeStore.getState().openPaths).toEqual([])
  })

  it('Revert file is disabled on a clean file and runs on a dirty one', async () => {
    const onRevert = renderTabs(['a.ts'])
    await userEvent.pointer({ keys: '[MouseRight]', target: screen.getAllByRole('tab')[1]! })
    expect(await screen.findByRole('menuitem', { name: 'Revert file' })).toHaveAttribute(
      'aria-disabled',
      'true',
    )
    await userEvent.keyboard('{Escape}')
    await userEvent.pointer({ keys: '[MouseRight]', target: screen.getAllByRole('tab')[0]! })
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Revert file' }))
    expect(onRevert).toHaveBeenCalledWith('a.ts')
  })
})

describe('closing a dirty tab', () => {
  it('asks instead of closing', async () => {
    useIdeStore.getState().setDraft('a.ts', 'x', 'h')
    renderTabs(['a.ts'])
    await userEvent.click(screen.getByRole('button', { name: 'Close a.ts' }))
    expect(useIdeStore.getState().openPaths).toContain('a.ts')
    expect(useIdeStore.getState().closeRequest?.dirty).toEqual(['a.ts'])
  })
})

describe('keyboard', () => {
  it('moves between tabs with the arrow keys and returns to the editor on Escape', async () => {
    const focus = vi.fn()
    useIdeStore.getState().setEditorHandle({ focus, trigger: vi.fn() })
    renderTabs()
    const [first, second] = screen.getAllByRole('tab')
    second!.focus()
    await userEvent.keyboard('{ArrowLeft}')
    expect(useIdeStore.getState().activePath).toBe('a.ts')
    expect(first).toHaveFocus()
    await userEvent.keyboard('{Escape}')
    expect(focus).toHaveBeenCalled()
  })
})
