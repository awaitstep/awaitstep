import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { buildFileTree } from '../../../lib/ide/file-tree'
import { useIdeExplorerStore } from '../../../stores/ide-explorer-store'
import { useIdeStore } from '../../../stores/ide-store'
import { FileExplorer } from '../file-explorer'

const project = buildFileTree([
  { path: 'lib/a.ts', role: 'module' },
  { path: 'lib/b.ts', role: 'module' },
  { path: 'package.json', role: 'meta' },
])
const generated = buildFileTree([{ path: 'worker.ts', role: 'entry' }])

function setup(overrides: Partial<React.ComponentProps<typeof FileExplorer>> = {}) {
  const props = {
    project,
    generated,
    dirty: new Set<string>(),
    unsavedPaths: [] as string[],
    onReview: vi.fn(),
    virtual: new Set<string>(),
    canEdit: true,
    usage: { files: 3, bytes: 1200 },
    onCreateFile: vi.fn().mockResolvedValue(true),
    onRename: vi.fn(),
    onDelete: vi.fn(),
    onConvert: vi.fn(),
    onEscape: vi.fn(),
    ...overrides,
  }
  const view = render(<FileExplorer {...props} />)
  return {
    ...props,
    rerender: (next: Partial<typeof props>) => view.rerender(<FileExplorer {...props} {...next} />),
  }
}

const item = (name: string) => screen.getByRole('treeitem', { name: new RegExp(name) })

beforeEach(() => {
  useIdeStore.getState().resetSession()
  useIdeExplorerStore.getState().reset()
})

describe('explorer keyboard', () => {
  it('keeps a single row in the tab order and moves it with the arrows', async () => {
    const user = userEvent.setup()
    setup()
    expect(screen.getAllByRole('treeitem').filter((n) => n.tabIndex === 0)).toHaveLength(1)
    item('package.json').focus()
    await user.keyboard('{ArrowUp}')
    expect(item('b.ts')).toHaveFocus()
    expect(item('b.ts').tabIndex).toBe(0)
  })

  it('← and → fold and unfold a folder, reflected in aria-expanded', async () => {
    const user = userEvent.setup()
    setup()
    const lib = screen.getByRole('treeitem', { name: /^lib$/ })
    lib.focus()
    await user.keyboard('{ArrowLeft}')
    expect(lib).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByRole('treeitem', { name: /a\.ts/ })).not.toBeInTheDocument()
    await user.keyboard('{ArrowRight}')
    expect(lib).toHaveAttribute('aria-expanded', 'true')
  })

  it('Enter opens the file, F2 renames, Delete deletes, Esc returns to the editor', async () => {
    const user = userEvent.setup()
    const props = setup()
    item('package.json').focus()
    await user.keyboard('{Enter}')
    expect(useIdeStore.getState().activePath).toBe('package.json')
    await user.keyboard('{F2}')
    expect(props.onRename).toHaveBeenCalledWith('package.json')
    await user.keyboard('{Delete}')
    expect(props.onDelete).toHaveBeenCalledWith('package.json')
    await user.keyboard('{Escape}')
    expect(props.onEscape).toHaveBeenCalled()
  })

  it('leaves F2 and Delete alone for generated files and when read-only', async () => {
    const user = userEvent.setup()
    const props = setup()
    item('worker.ts').focus()
    await user.keyboard('{F2}{Delete}')
    expect(props.onRename).not.toHaveBeenCalled()
    expect(props.onDelete).not.toHaveBeenCalled()
  })

  it('focuses the next row once the deleted one is gone', async () => {
    const user = userEvent.setup()
    const props = setup()
    item('a.ts').focus()
    await user.keyboard('{Delete}')
    props.rerender({
      project: buildFileTree([
        { path: 'lib/b.ts', role: 'module' },
        { path: 'package.json', role: 'meta' },
      ]),
    })
    expect(item('b.ts')).toHaveFocus()
  })
})

describe('inline create', () => {
  it('opens inside the selected folder and creates the file', async () => {
    const user = userEvent.setup()
    const props = setup()
    await user.click(screen.getByRole('treeitem', { name: /^lib$/ }))
    await user.click(screen.getByRole('button', { name: 'New file' }))
    expect(screen.getByText('In lib/')).toBeInTheDocument()
    await user.type(screen.getByRole('textbox'), 'c.ts{Enter}')
    expect(props.onCreateFile).toHaveBeenCalledWith('lib/c.ts', undefined)
    expect(useIdeExplorerStore.getState().create).toBeNull()
    expect(useIdeExplorerStore.getState().selected).toMatchObject({ path: 'lib/c.ts' })
  })

  it('disables + with the reason at the file limit', () => {
    setup({ usage: { files: 100, bytes: 5 } })
    const button = screen.getByRole('button', { name: 'New file' })
    expect(button).toBeDisabled()
    expect(button).toHaveAttribute('title', expect.stringMatching(/100 files/))
    expect(screen.getByText('100 of 100 files · 5 B of 2 MB')).toBeInTheDocument()
  })

  it('opens from the store, as the shortcut and palette do', () => {
    setup()
    act(() => useIdeExplorerStore.getState().beginCreate({ mode: 'file' }))
    expect(screen.getByRole('textbox')).toHaveFocus()
  })
})

describe('New menu', () => {
  it('opens the name row and does not hand focus back to the menu button', async () => {
    const user = userEvent.setup()
    setup()
    await user.click(screen.getByRole('button', { name: 'New…' }))
    await user.click(await screen.findByRole('menuitem', { name: /^File…/ }))
    const input = await screen.findByRole('textbox', { name: 'New file path' })
    // The menu hands focus back on a timer; the row must still be there after it.
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(screen.getByRole('textbox', { name: 'New file path' })).toBe(input)
    // Radix returns focus to the trigger unless told not to; that blurred the row.
    expect(screen.getByRole('button', { name: 'New…' })).not.toHaveFocus()
  })

  it('explains why an item is off at the file limit', async () => {
    const user = userEvent.setup()
    setup({ usage: { files: 100, bytes: 1200 } })
    await user.click(screen.getByRole('button', { name: 'New…' }))
    const items = await screen.findAllByText('File limit reached')
    expect(items.length).toBeGreaterThan(0)
  })
})

describe('explorer without generated files', () => {
  it('says when they appear instead of an empty section, while the project tree works', () => {
    setup({ generated: [] })
    expect(screen.getByText('Appears after the first save on the canvas.')).toBeInTheDocument()
    expect(item('a.ts')).toBeInTheDocument()
  })

  it('says nothing of the kind once there are generated files', () => {
    setup()
    expect(screen.queryByText('Appears after the first save on the canvas.')).toBeNull()
  })

  it('still offers to create the first project file in an empty project', async () => {
    const user = userEvent.setup()
    setup({ generated: [], project: [] })
    await user.click(screen.getByRole('button', { name: 'Create one' }))
    expect(useIdeExplorerStore.getState().create).not.toBeNull()
  })
})
