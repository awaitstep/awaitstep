import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { GeneratedFile } from '@awaitstep/codegen'
import type * as SearchClient from '../../../lib/ide/search-client'
import { SEARCH_TIMEOUT_MS } from '../../../lib/ide/search-client'
import { FakeSearchWorker } from '../../../lib/__tests__/fixtures/search/fake-worker'
import { SEARCH_DEBOUNCE_MS } from '../../../hooks/use-workspace-search'
import { useIdeLayoutStore } from '../../../stores/ide-layout-store'
import { useIdeSearchStore } from '../../../stores/ide-search-store'
import { useIdeStore } from '../../../stores/ide-store'
import { SearchPanel } from '../search-panel'
import { SearchRunner } from '../search-runner'
import { SideBar } from '../side-bar'
import { SideBarTabs } from '../side-bar-tabs'

vi.mock('../../../lib/ide/search-client', async (importOriginal) => {
  const actual = await importOriginal<typeof SearchClient>()
  const { FakeSearchWorker: Fake } =
    await import('../../../lib/__tests__/fixtures/search/fake-worker')
  return { ...actual, createBrowserSearchWorker: () => new Fake() }
})

function gen(path: string, source: string): GeneratedFile {
  return { path, source, role: 'module' }
}

const base = new Map<string, GeneratedFile>([
  [
    'lib/payments/charge.ts',
    gen('lib/payments/charge.ts', 'export function chargeOrder() {}\nchargeOrder()\n'),
  ],
  ['lib/errors.ts', gen('lib/errors.ts', 'export class Decline extends Error {}\n')],
  ['worker.ts', gen('worker.ts', 'import { chargeOrder } from "#app/lib/payments/charge"\n')],
])
const projectPaths = new Set(['lib/payments/charge.ts', 'lib/errors.ts'])

function Harness({
  files,
  active,
  onEscape,
}: {
  files: ReadonlyMap<string, GeneratedFile>
  active: boolean
  onEscape: () => void
}) {
  return (
    <>
      <SearchRunner files={files} projectPaths={projectPaths} />
      <SearchPanel files={files} active={active} onEscape={onEscape} />
    </>
  )
}

function setup(files = base, active = true) {
  const onEscape = vi.fn()
  const view = render(<Harness files={files} active={active} onEscape={onEscape} />)
  return {
    onEscape,
    rerender: (next: ReadonlyMap<string, GeneratedFile>, isActive = active) =>
      view.rerender(<Harness files={next} active={isActive} onEscape={onEscape} />),
  }
}

const box = () => screen.getByRole('textbox', { name: 'Search project files' })

beforeEach(() => {
  FakeSearchWorker.reset()
  useIdeSearchStore.getState().reset()
  useIdeStore.getState().resetSession()
  useIdeLayoutStore.setState({ sideBarTab: 'search', explorerOpen: true })
})

describe('SearchPanel', () => {
  it('searches as you type, with no Enter, and counts the results', async () => {
    const user = userEvent.setup()
    setup()
    await user.type(box(), 'chargeOrder')
    expect(await screen.findByText('2 results in 1 file')).toBeInTheDocument()
    expect(screen.getByRole('treeitem', { name: /charge\.ts/ })).toBeInTheDocument()
  })

  it('leaves generated files out by default and groups them when included', async () => {
    const user = userEvent.setup()
    setup()
    await user.type(box(), 'chargeOrder')
    await screen.findByText('2 results in 1 file')
    expect(screen.queryByText('worker.ts')).not.toBeInTheDocument()

    await user.click(screen.getByRole('checkbox', { name: 'Include generated files' }))
    expect(await screen.findByText('3 results in 2 files')).toBeInTheDocument()
    expect(screen.getByText(/Generated · read-only · 1/)).toBeInTheDocument()
    expect(screen.getByText(/Your files · 2/)).toBeInTheDocument()
  })

  it('finds text that exists only in an unsaved edit, and drops it when the edit is discarded', async () => {
    const user = userEvent.setup()
    const { rerender } = setup()
    await user.type(box(), 'zzz')
    expect(await screen.findByText('No results in your files.')).toBeInTheDocument()

    const edited = new Map(base)
    edited.set('lib/errors.ts', gen('lib/errors.ts', '// zzz in a draft\n'))
    rerender(edited)
    expect(await screen.findByText('1 result in 1 file')).toBeInTheDocument()
    expect(screen.getByRole('treeitem', { name: /errors\.ts/ })).toBeInTheDocument()

    rerender(base)
    expect(await screen.findByText('No results in your files.')).toBeInTheDocument()
  })

  it('shows the parser message at once for a regex that does not parse, with no results', async () => {
    const user = userEvent.setup()
    setup()
    await user.click(screen.getByRole('button', { name: 'Regular expression' }))
    await user.type(box(), '(')
    expect(screen.getByText(/Invalid regular expression/)).toBeInTheDocument()
    expect(screen.queryByRole('tree')).not.toBeInTheDocument()
    expect(box()).toHaveAttribute('aria-invalid', 'true')
  })

  it('applies the match-case and whole-word switches', async () => {
    const user = userEvent.setup()
    setup()
    await user.type(box(), 'CHARGEORDER')
    await screen.findByText('2 results in 1 file')
    await user.click(screen.getByRole('button', { name: 'Match case' }))
    expect(await screen.findByText('No results in your files.')).toBeInTheDocument()
    await user.clear(box())
    await user.type(box(), 'charge')
    await user.click(screen.getByRole('button', { name: 'Whole word' }))
    expect(await screen.findByText('No results in your files.')).toBeInTheDocument()
  })

  it('offers to include generated files when nothing is found, and searches again when taken up', async () => {
    const user = userEvent.setup()
    setup()
    await user.type(box(), '#app/lib')
    await screen.findByText('No results in your files.')
    expect(screen.getByText(/Generated files weren’t searched/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Include generated files' }))
    expect(await screen.findByText('1 result in 1 file')).toBeInTheDocument()
    expect(screen.queryByText(/Generated files weren’t searched/)).not.toBeInTheDocument()
  })

  it('says a runaway pattern took too long after two seconds, and the next query works', async () => {
    const user = userEvent.setup()
    FakeSearchWorker.reset('hang')
    setup()
    await user.type(box(), 'chargeOrder')
    await waitFor(() => expect(FakeSearchWorker.created.length).toBeGreaterThan(0))
    await waitFor(() => expect(screen.getByText(/Search took too long/)).toBeInTheDocument(), {
      timeout: SEARCH_TIMEOUT_MS + 1500,
    })
    FakeSearchWorker.respond = 'sync'
    await user.type(box(), 's')
    expect(await screen.findByText('No results in your files.')).toBeInTheDocument()
  }, 10_000)

  it('does not rerun a pattern that timed out on later edits, until Retry', async () => {
    const user = userEvent.setup()
    FakeSearchWorker.reset('hang')
    useIdeSearchStore.getState().setQuery('chargeOrder')
    const { rerender } = setup()
    await waitFor(() => expect(screen.getByText(/Search took too long/)).toBeInTheDocument(), {
      timeout: SEARCH_TIMEOUT_MS + 1500,
    })
    const started = FakeSearchWorker.created.length
    const edited = new Map(base)
    edited.set('lib/errors.ts', gen('lib/errors.ts', '// chargeOrder in a draft\n'))
    rerender(edited)
    await new Promise((r) => setTimeout(r, SEARCH_DEBOUNCE_MS + 300))
    expect(FakeSearchWorker.created.length).toBe(started)
    expect(screen.getByText(/Search took too long/)).toBeInTheDocument()
    FakeSearchWorker.respond = 'sync'
    await user.click(screen.getByRole('button', { name: 'retry' }))
    expect(await screen.findByText('3 results in 2 files')).toBeInTheDocument()
  }, 10_000)

  it('keeps results current while its tab is hidden, so F4 never steps through old ones', async () => {
    useIdeSearchStore.getState().setQuery('zzz')
    const { rerender } = setup(base, false)
    await waitFor(() => expect(useIdeSearchStore.getState().outcome).not.toBeNull())
    const edited = new Map(base)
    edited.set('lib/errors.ts', gen('lib/errors.ts', '// zzz in a draft\n'))
    rerender(edited, false)
    await waitFor(() => {
      const outcome = useIdeSearchStore.getState().outcome
      expect(outcome?.kind === 'results' && outcome.results.total).toBe(1)
    })
  })

  it('says so when the worker fails, not that the pattern was too slow', async () => {
    const user = userEvent.setup()
    FakeSearchWorker.reset('hang')
    setup()
    await user.type(box(), 'x')
    await waitFor(() => expect(FakeSearchWorker.created.length).toBeGreaterThan(0))
    act(() => FakeSearchWorker.created[0]!.onerror?.(new Error('could not load')))
    expect(await screen.findByText('Search failed. Try again.')).toBeInTheDocument()
    expect(screen.queryByText(/took too long/)).not.toBeInTheDocument()
  })

  it('unfolds every file again when the query changes', async () => {
    const user = userEvent.setup()
    setup()
    await user.type(box(), 'chargeOrder')
    await screen.findByText('2 results in 1 file')
    await user.keyboard('{ArrowDown}{ArrowLeft}')
    expect(screen.getAllByRole('treeitem')).toHaveLength(1)
    await user.click(box())
    await user.type(box(), '{Backspace}')
    await waitFor(() => expect(screen.getAllByRole('treeitem')).toHaveLength(3))
  })

  it('ignores a hit whose file has just gone, instead of opening a tab for it', async () => {
    const user = userEvent.setup()
    const { rerender } = setup()
    await user.type(box(), 'chargeOrder')
    await screen.findByText('2 results in 1 file')
    const row = screen.getAllByRole('treeitem')[1]!
    const without = new Map(base)
    without.delete('lib/payments/charge.ts')
    rerender(without)
    await user.click(row)
    expect(useIdeStore.getState().activePath).toBeNull()
    expect(useIdeStore.getState().reveal).toBeNull()
  })

  it('keeps group headings and the include-generated button out of the tree and the live region', async () => {
    const user = userEvent.setup()
    setup()
    await user.type(box(), '#app/lib')
    await screen.findByText('No results in your files.')
    expect(screen.getByRole('status')).not.toContainElement(
      screen.getByRole('button', { name: 'Include generated files' }),
    )
    await user.click(screen.getByRole('button', { name: 'Include generated files' }))
    await screen.findByText('1 result in 1 file')
    const tree = screen.getByRole('tree')
    for (const child of Array.from(tree.children)) {
      expect(child.getAttribute('role')).toBe('group')
    }
    expect(screen.getByRole('group', { name: 'Generated files, read-only' })).toBeInTheDocument()
  })

  it('takes focus and selects its text when asked (⇧⌘F)', async () => {
    useIdeSearchStore.getState().setQuery('old')
    setup()
    act(() => useIdeSearchStore.getState().searchFor({ query: 'chargeOrder' }))
    await waitFor(() => expect(box()).toHaveFocus())
    expect((box() as HTMLInputElement).selectionStart).toBe(0)
    expect((box() as HTMLInputElement).selectionEnd).toBe('chargeOrder'.length)
    expect(useIdeSearchStore.getState().focusRequested).toBe(false)
  })
})

describe('SearchPanel keyboard and reveal', () => {
  async function withResults() {
    const user = userEvent.setup()
    const view = setup()
    await user.type(box(), 'chargeOrder')
    await screen.findByText('2 results in 1 file')
    return { user, ...view }
  }

  it('moves from the box into the results with ↓, between hits with ↑/↓, and back with ↑', async () => {
    const { user } = await withResults()
    await user.keyboard('{ArrowDown}')
    expect(screen.getByRole('treeitem', { name: /charge\.ts/ })).toHaveFocus()
    await user.keyboard('{ArrowDown}')
    const rows = screen.getAllByRole('treeitem')
    expect(rows[1]).toHaveFocus()
    await user.keyboard('{ArrowDown}{ArrowUp}{ArrowUp}{ArrowUp}')
    expect(box()).toHaveFocus()
  })

  it('folds a file with ← and unfolds it with →', async () => {
    const { user } = await withResults()
    await user.keyboard('{ArrowDown}{ArrowLeft}')
    expect(screen.getAllByRole('treeitem')).toHaveLength(1)
    await user.keyboard('{ArrowRight}')
    expect(screen.getAllByRole('treeitem')).toHaveLength(3)
  })

  it('opens a hit on Enter with the match selected, and remembers it', async () => {
    const { user } = await withResults()
    await user.keyboard('{ArrowDown}{ArrowDown}{Enter}')
    expect(useIdeStore.getState().activePath).toBe('lib/payments/charge.ts')
    expect(useIdeStore.getState().reveal).toMatchObject({
      line: 1,
      column: 17,
      endColumn: 28,
    })
    expect(useIdeSearchStore.getState().current).toMatchObject({ line: 1, column: 17 })
  })

  it('opens a hit on click', async () => {
    const { user } = await withResults()
    await user.click(screen.getAllByRole('treeitem')[2]!)
    expect(useIdeStore.getState().reveal).toMatchObject({ line: 2, column: 1, endColumn: 12 })
  })

  it('Esc from the box and from a row both hand the keyboard back to the editor', async () => {
    const { user, onEscape } = await withResults()
    await user.keyboard('{Escape}')
    expect(onEscape).toHaveBeenCalledTimes(1)
    await user.keyboard('{ArrowDown}{Escape}')
    expect(onEscape).toHaveBeenCalledTimes(2)
  })
})

describe('SideBar', () => {
  const explorer = <div data-testid="explorer">tree</div>

  function renderBar() {
    return render(<SideBar explorer={explorer} steps={null} files={base} onEscape={vi.fn()} />)
  }

  it('shows the remembered view and keeps the other one mounted', () => {
    useIdeLayoutStore.setState({ sideBarTab: 'search' })
    renderBar()
    expect(screen.getByTestId('explorer').closest('[hidden]')).not.toBeNull()
    expect(box().closest('[hidden]')).toBeNull()
  })

  it('switches with the tabs, and ←/→ on a tab moves to the other one', async () => {
    const user = userEvent.setup()
    useIdeLayoutStore.setState({ sideBarTab: 'search' })
    renderBar()
    const searchTab = screen.getByRole('tab', { name: 'Search' })
    searchTab.focus()
    await user.keyboard('{ArrowLeft}')
    expect(useIdeLayoutStore.getState().sideBarTab).toBe('explorer')
    expect(screen.getByTestId('explorer').closest('[hidden]')).toBeNull()
  })

  it('hands the keyboard to the Search box when Search is chosen, instead of dropping it', async () => {
    const user = userEvent.setup()
    useIdeLayoutStore.setState({ sideBarTab: 'explorer' })
    render(<SideBar explorer={<SideBarTabsOnly />} steps={null} files={base} onEscape={vi.fn()} />)
    await user.click(screen.getByRole('tab', { name: 'Search' }))
    await waitFor(() => expect(box()).toHaveFocus())
  })

  it('keeps the keyboard on the Explorer tab when Explorer is chosen from Search', async () => {
    const user = userEvent.setup()
    useIdeLayoutStore.setState({ sideBarTab: 'search' })
    render(<SideBar explorer={<SideBarTabsOnly />} steps={null} files={base} onEscape={vi.fn()} />)
    await user.click(screen.getByRole('tab', { name: 'Explorer' }))
    await waitFor(() => expect(screen.getByRole('tab', { name: 'Explorer' })).toHaveFocus())
    expect(screen.getByRole('tab', { name: 'Explorer' }).closest('[hidden]')).toBeNull()
  })

  it('wires every tab to a tabpanel', () => {
    useIdeLayoutStore.setState({ sideBarTab: 'search' })
    render(<SideBar explorer={<SideBarTabsOnly />} steps={null} files={base} onEscape={vi.fn()} />)
    for (const tab of screen.getAllByRole('tab', { hidden: true })) {
      const panel = document.getElementById(tab.getAttribute('aria-controls')!)
      expect(panel?.getAttribute('role')).toBe('tabpanel')
    }
  })
})

function SideBarTabsOnly() {
  return <SideBarTabs view="explorer" />
}
