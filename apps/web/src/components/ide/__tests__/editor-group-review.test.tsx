import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { GeneratedFile } from '@awaitstep/codegen'
import { useIdeStore } from '../../../stores/ide-store'
import { EditorGroup } from '../editor-group'
import { EditorTabs } from '../editor-tabs'
import { makeReviewBindings, sourceFile } from './fixtures/review-bindings'

vi.mock('@monaco-editor/react', () => ({
  default: ({ path }: { path: string }) => <div data-testid="monaco">{path}</div>,
  useMonaco: () => null,
}))
vi.mock('../review-view', () => ({ ReviewView: () => <div data-testid="review-view" /> }))
vi.mock('../compare-view', () => ({
  CompareView: ({ path }: { path: string }) => <div data-testid="compare-view">{path}</div>,
}))
vi.mock('../../../lib/monaco/theme', () => ({ useMonacoTheme: () => 'vs' }))
vi.mock('../../../lib/monaco/use-workflow-type-context', () => ({
  useWorkflowTypeContext: () => undefined,
}))
vi.mock('../../../lib/monaco/use-type-acquisition', () => ({ useTypeAcquisition: () => true }))

function file(path: string): GeneratedFile {
  return { path, source: 'x', role: 'module' }
}
const files = new Map([
  ['a.ts', file('a.ts')],
  ['b.ts', file('b.ts')],
])

function renderGroup(
  review = makeReviewBindings({ baseline: new Map([['a.ts', sourceFile('a.ts', 'x', 'h1')]]) }),
) {
  return render(
    <EditorGroup
      workflowId="wf"
      files={files}
      dirty={new Set()}
      editabilityOf={() => ({ readOnly: false, message: null })}
      onChange={vi.fn()}
      onRevertFile={vi.fn()}
      virtualPaths={new Set()}
      historical={false}
      onOpenLatest={vi.fn()}
      onSaveAsFile={vi.fn()}
      onConvertHandlers={vi.fn()}
      onOpenCanvas={vi.fn()}
      run={{ label: 'Run', busy: false, onRun: vi.fn() }}
      review={review}
    />,
  )
}

beforeEach(() => useIdeStore.getState().resetSession())

describe('EditorGroup tabs that are not files', () => {
  it('shows the review in place of an editor while its tab is active', async () => {
    useIdeStore.getState().openFile('a.ts')
    renderGroup()
    expect(await screen.findByTestId('monaco')).toBeInTheDocument()
    act(() => useIdeStore.getState().openReview())
    expect(screen.getByTestId('review-view')).toBeInTheDocument()
    expect(screen.queryByTestId('monaco')).toBeNull()
    act(() => useIdeStore.getState().openFile('a.ts'))
    expect(await screen.findByTestId('monaco')).toBeInTheDocument()
  })

  it('shows Compare for the file named in its tab', () => {
    useIdeStore.getState().openFile('a.ts')
    useIdeStore.getState().openCompare('a.ts')
    renderGroup()
    expect(screen.getByTestId('compare-view')).toHaveTextContent('a.ts')
  })

  it('puts the outside-change banner right after the tab strip for a file with unsaved text', () => {
    useIdeStore.getState().openFile('a.ts')
    useIdeStore.getState().setDraft('a.ts', 'mine', 'stale')
    renderGroup()
    const tablist = screen.getByRole('tablist')
    const banner = screen.getByRole('status')
    expect(banner).toHaveTextContent('a.ts changed on the server')
    // Nothing focusable sits between the tabs and the banner's buttons.
    const order = [...document.querySelectorAll('[role="tablist"], [role="status"]')]
    expect(order).toEqual([tablist, banner])
    expect(banner.compareDocumentPosition(screen.getByTestId('monaco'))).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    )
  })

  it('does not show a file’s banner on the review tab', () => {
    useIdeStore.getState().openFile('a.ts')
    useIdeStore.getState().setDraft('a.ts', 'mine', 'stale')
    useIdeStore.getState().openReview()
    renderGroup()
    expect(screen.queryByText(/changed on the server/)).toBeNull()
  })

  it('a refused save is announced as an alert, not a status', () => {
    useIdeStore.getState().openFile('a.ts')
    useIdeStore.getState().setDraft('a.ts', 'mine', 'h1')
    useIdeStore.getState().setConflict('a.ts', { currentHash: 'h9' })
    renderGroup()
    expect(screen.getByRole('alert')).toHaveTextContent('Couldn’t save a.ts')
  })
})

describe('EditorTabs for the review and Compare tabs', () => {
  it('names them, and does not offer file-only menu items', async () => {
    const store = useIdeStore.getState()
    store.openFile('a.ts')
    store.openReview()
    store.openCompare('a.ts')
    render(<EditorTabs files={files} dirty={new Set()} onRevertFile={vi.fn()} />)
    expect(screen.getByRole('tab', { name: /Unsaved changes/ })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /Compare · a\.ts/ })).toBeInTheDocument()
    await userEvent.pointer({ keys: '[MouseRight]', target: screen.getAllByRole('tab')[1]! })
    expect(await screen.findByRole('menuitem', { name: 'Close all' })).toBeInTheDocument()
    expect(screen.queryByRole('menuitem', { name: 'Copy path' })).toBeNull()
    expect(screen.queryByRole('menuitem', { name: 'Revert file' })).toBeNull()
  })

  it('closing the review tab never asks about unsaved text (it holds none of its own)', () => {
    const store = useIdeStore.getState()
    store.openReview()
    store.setDraft('a.ts', 'x', 'h')
    useIdeStore.getState().requestClose(['ide:review'])
    expect(useIdeStore.getState().closeRequest).toBeNull()
    expect(useIdeStore.getState().openPaths).toEqual([])
  })
})
