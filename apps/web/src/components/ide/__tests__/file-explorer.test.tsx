import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
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
    stepPaths: new Set<string>(),
    canEdit: true,
    usage: { files: 3, bytes: 1200 },
    onCreateFile: vi.fn().mockResolvedValue(true),
    onRenameFile: vi.fn().mockResolvedValue(true),
    onDelete: vi.fn(),
    onDeleteFolder: vi.fn(),
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
    expect(useIdeExplorerStore.getState().renaming).toBe('package.json')
    await user.keyboard('{Escape}')
    await waitFor(() => expect(item('package.json')).toHaveFocus())
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
    expect(useIdeExplorerStore.getState().renaming).toBeNull()
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

  it('Esc dismisses the row even while the name is refused', async () => {
    const user = userEvent.setup()
    setup()
    await user.click(screen.getByRole('button', { name: 'New file' }))
    await user.type(screen.getByRole('textbox'), 'package.json')
    expect(screen.getByRole('textbox')).toHaveAttribute('aria-invalid', 'true')
    await user.keyboard('{Escape}')
    expect(useIdeExplorerStore.getState().create).toBeNull()
  })

  it('clicking away dismisses a refused name, but keeps a valid one', async () => {
    const user = userEvent.setup()
    setup()
    await user.click(screen.getByRole('button', { name: 'New file' }))
    await user.type(screen.getByRole('textbox'), 'package.json')
    await user.click(item('b.ts'))
    expect(useIdeExplorerStore.getState().create).toBeNull()

    await user.click(screen.getByRole('button', { name: 'New file' }))
    await user.type(screen.getByRole('textbox'), 'fresh.ts')
    await user.click(item('b.ts'))
    expect(useIdeExplorerStore.getState().create).not.toBeNull()
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

describe('right-click menus', () => {
  it('opens a file’s own menu: Rename and Delete', async () => {
    const user = userEvent.setup()
    const { onDelete } = setup()
    await user.pointer({ keys: '[MouseRight]', target: item('a.ts') })
    await user.click(await screen.findByRole('menuitem', { name: /Rename/ }))
    expect(useIdeExplorerStore.getState().renaming).toBe('lib/a.ts')
    useIdeExplorerStore.getState().endRename()
    await user.pointer({ keys: '[MouseRight]', target: item('b.ts') })
    await user.click(await screen.findByRole('menuitem', { name: /Delete/ }))
    expect(onDelete).toHaveBeenCalledWith('lib/b.ts')
  })

  it('opens a folder menu with New file and Delete folder, not Rename', async () => {
    const user = userEvent.setup()
    const { onDeleteFolder, onDelete } = setup()
    await user.pointer({ keys: '[MouseRight]', target: item('lib') })
    expect(screen.queryByRole('menuitem', { name: /Rename/ })).toBeNull()
    await user.click(await screen.findByRole('menuitem', { name: 'Delete folder' }))
    expect(onDeleteFolder).toHaveBeenCalledWith('lib')
    expect(onDelete).not.toHaveBeenCalled()
  })

  it('New file in a folder selects it and opens the name row there', async () => {
    const user = userEvent.setup()
    setup()
    await user.pointer({ keys: '[MouseRight]', target: item('lib') })
    await user.click(await screen.findByRole('menuitem', { name: /New file/ }))
    expect(useIdeExplorerStore.getState().selected).toMatchObject({ path: 'lib', kind: 'dir' })
    expect(useIdeExplorerStore.getState().create).toMatchObject({ mode: 'file' })
    // The name field keeps focus (and so stays open) once the menu has closed.
    await waitFor(() => expect(screen.getByRole('textbox')).toHaveFocus())
    expect(useIdeExplorerStore.getState().create).not.toBeNull()
  })

  it('leaves the browser menu for generated files and when read-only', async () => {
    const user = userEvent.setup()
    setup()
    await user.pointer({ keys: '[MouseRight]', target: item('worker.ts') })
    expect(screen.queryByRole('menu')).toBeNull()
  })

  it('Delete on a folder row asks to delete the folder, F2 does nothing', async () => {
    const user = userEvent.setup()
    const { onDeleteFolder, onDelete } = setup()
    item('lib').focus()
    await user.keyboard('{F2}')
    await user.keyboard('{Delete}')
    expect(useIdeExplorerStore.getState().renaming).toBeNull()
    expect(onDelete).not.toHaveBeenCalled()
    expect(onDeleteFolder).toHaveBeenCalledWith('lib')
  })

  it('anchors the menu at the click, and goes back to the ⋯ button once closed', async () => {
    const user = userEvent.setup()
    setup()
    const row = item('a.ts')
    fireEvent.contextMenu(row, { clientX: 120, clientY: 64 })
    const anchor = await waitFor(() => {
      // The opened menu's anchor is the one inside the clicked row.
      const el = row.querySelector<HTMLElement>('span[aria-haspopup="menu"]')
      expect(el).not.toBeNull()
      return el!
    })
    expect(anchor.style.left).toBe('120px')
    expect(anchor.style.top).toBe('64px')
    await user.keyboard('{Escape}')
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Actions for lib/a.ts', hidden: true }),
      ).toBeInTheDocument(),
    )
  })
})

describe('inline rename', () => {
  function startRename(path: string) {
    act(() => useIdeExplorerStore.getState().beginRename(path))
    return screen.getByRole('textbox')
  }

  it('edits the path in the row, selecting the name without its extension', () => {
    setup()
    const input = startRename('lib/a.ts') as HTMLInputElement
    expect(input).toHaveValue('lib/a.ts')
    expect(input).toHaveFocus()
    expect([input.selectionStart, input.selectionEnd]).toEqual([4, 5])
  })

  it('renames on Enter and ends the edit', async () => {
    const user = userEvent.setup()
    const props = setup()
    startRename('lib/a.ts')
    await user.keyboard('{Control>}a{/Control}lib/c.ts{Enter}')
    expect(props.onRenameFile).toHaveBeenCalledWith('lib/a.ts', 'lib/c.ts')
    expect(useIdeExplorerStore.getState().renaming).toBeNull()
  })

  it('Esc dismisses it, even when the name is refused, and the row gets focus back', async () => {
    const user = userEvent.setup()
    const props = setup()
    startRename('lib/a.ts')
    await user.keyboard('{Control>}a{/Control}lib/b.ts')
    expect(screen.getByRole('textbox')).toHaveAttribute('aria-invalid', 'true')
    await user.keyboard('{Escape}')
    expect(useIdeExplorerStore.getState().renaming).toBeNull()
    expect(props.onRenameFile).not.toHaveBeenCalled()
    await waitFor(() => expect(item('a.ts')).toHaveFocus())
  })

  it('clicking away dismisses an unchanged or refused name, but not a valid one', async () => {
    const user = userEvent.setup()
    const props = setup()
    startRename('lib/a.ts')
    await user.click(item('package.json'))
    expect(useIdeExplorerStore.getState().renaming).toBeNull()

    startRename('lib/a.ts')
    await user.keyboard('{Control>}a{/Control}lib/b.ts')
    await user.click(item('package.json'))
    expect(useIdeExplorerStore.getState().renaming).toBeNull()

    startRename('lib/a.ts')
    await user.keyboard('{Control>}a{/Control}lib/new.ts')
    await user.click(item('package.json'))
    expect(useIdeExplorerStore.getState().renaming).toBe('lib/a.ts')
    expect(props.onRenameFile).not.toHaveBeenCalled()
  })

  it('stays open, with the field back in focus, when the rename is refused', async () => {
    const user = userEvent.setup()
    const props = setup({ onRenameFile: vi.fn().mockResolvedValue(false) })
    startRename('lib/a.ts')
    await user.keyboard('{Control>}a{/Control}lib/c.ts{Enter}')
    expect(props.onRenameFile).toHaveBeenCalled()
    await waitFor(() => expect(screen.getByRole('textbox')).toHaveFocus())
    expect(useIdeExplorerStore.getState().renaming).toBe('lib/a.ts')
  })

  it('opens from the row menu and keeps focus in the field', async () => {
    const user = userEvent.setup()
    setup()
    await user.pointer({ keys: '[MouseRight]', target: item('a.ts') })
    await user.click(await screen.findByRole('menuitem', { name: /Rename/ }))
    await waitFor(() => expect(screen.getByRole('textbox')).toHaveFocus())
  })
})

describe('Project row menu', () => {
  const projectRow = () => screen.getByRole('treeitem', { name: /^Project/ })

  it('right-click shows the New… choices, File and Folder, handlers and config files', async () => {
    const user = userEvent.setup()
    setup()
    await user.pointer({ keys: '[MouseRight]', target: projectRow() })
    for (const name of ['File…', 'Folder…', 'HTTP', 'Scheduled', 'tsconfig.json']) {
      expect(await screen.findByRole('menuitem', { name: new RegExp(name) })).toBeInTheDocument()
    }
    expect(screen.getByText('Handlers')).toBeInTheDocument()
  })

  it('File… adds at the project root even while a folder is selected, and keeps focus in the field', async () => {
    const user = userEvent.setup()
    setup()
    await user.click(item('lib'))
    await user.pointer({ keys: '[MouseRight]', target: projectRow() })
    await user.click(await screen.findByRole('menuitem', { name: 'File…' }))
    expect(useIdeExplorerStore.getState().selected).toMatchObject({ path: '', kind: 'dir' })
    await waitFor(() => expect(screen.getByRole('textbox')).toHaveFocus())
    expect(screen.getByText('In the project root')).toBeInTheDocument()
  })

  it('has no menu when read-only, or on the Generated row', async () => {
    const user = userEvent.setup()
    setup()
    await user.pointer({
      keys: '[MouseRight]',
      target: screen.getByRole('treeitem', { name: /^Generated/ }),
    })
    expect(screen.queryByRole('menu')).toBeNull()
  })
})

describe('step sources', () => {
  const withSteps = buildFileTree([
    { path: 'lib/a.ts', role: 'module' },
    { path: 'steps/k3j9x_a1b2c3.ts', role: 'source' },
  ])
  const stepPaths = new Set(['steps/k3j9x_a1b2c3.ts'])

  it('lists a step’s source under Project, opens it, and shows it as unsaved like any file', async () => {
    const user = userEvent.setup()
    setup({ project: withSteps, stepPaths, dirty: new Set(['steps/k3j9x_a1b2c3.ts']) })
    const row = item('k3j9x_a1b2c3\\.ts')
    expect(row).toHaveAttribute('aria-level', '3')
    expect(row.title).toContain('Step code')
    expect(row.querySelector('[aria-label="Unsaved changes"]')).not.toBeNull()
    await user.click(row)
    expect(useIdeStore.getState().activePath).toBe('steps/k3j9x_a1b2c3.ts')
  })

  it('gives neither the steps folder nor its files a menu, a Delete key or an F2', async () => {
    const user = userEvent.setup()
    const { onDelete, onDeleteFolder } = setup({ project: withSteps, stepPaths })
    const folder = screen.getByRole('treeitem', { name: /^steps$/ })
    expect(folder.title).toBe(
      'Step code belongs to its node. Add, rename or remove steps on the canvas.',
    )
    await user.pointer({ keys: '[MouseRight]', target: folder })
    expect(screen.queryByRole('menu')).toBeNull()
    await user.pointer({ keys: '[MouseRight]', target: item('k3j9x_a1b2c3\\.ts') })
    expect(screen.queryByRole('menu')).toBeNull()
    expect(screen.queryByRole('button', { name: /Actions for steps/, hidden: true })).toBeNull()

    item('k3j9x_a1b2c3\\.ts').focus()
    await user.keyboard('{F2}')
    await user.keyboard('{Delete}')
    folder.focus()
    await user.keyboard('{Delete}')
    expect(useIdeExplorerStore.getState().renaming).toBeNull()
    expect(onDelete).not.toHaveBeenCalled()
    expect(onDeleteFolder).not.toHaveBeenCalled()
  })

  it('a new file from a selected step lands at the project root, not under steps/', async () => {
    const user = userEvent.setup()
    setup({ project: withSteps, stepPaths })
    await user.click(item('k3j9x_a1b2c3\\.ts'))
    act(() => useIdeExplorerStore.getState().beginCreate({ mode: 'file' }))
    expect(await screen.findByText('In the project root')).toBeInTheDocument()
  })
})
