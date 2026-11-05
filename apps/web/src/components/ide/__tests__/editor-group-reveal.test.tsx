import { act, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { GeneratedFile } from '@awaitstep/codegen'
import { useIdeStore } from '../../../stores/ide-store'
import { EditorGroup } from '../editor-group'
import { makeReviewBindings } from './fixtures/review-bindings'

/**
 * Just enough of Monaco's editor, and of `@monaco-editor/react`'s habit of
 * swapping models and *then* restoring that file's saved view state, which
 * is what used to overwrite a reveal.
 */
const fake = vi.hoisted(() => {
  const state = {
    selection: null as unknown,
    revealed: null as unknown,
    modelListeners: [] as (() => void)[],
    model: null as { uri: { toString: () => string } } | null,
    focused: 0,
  }
  return state
})

vi.mock('@monaco-editor/react', async () => {
  const react = await import('react')
  function MockEditor({ path, onMount }: { path: string; onMount: (editor: unknown) => void }) {
    const viewStates = react.useRef(new Map<string, unknown>())
    const previous = react.useRef<string | null>(null)
    react.useEffect(() => {
      const editor = {
        onDidChangeCursorPosition: () => undefined,
        onDidChangeModel: (cb: () => void) => fake.modelListeners.push(cb),
        onDidDispose: () => undefined,
        getModel: () => fake.model,
        getPosition: () => ({ lineNumber: 1, column: 1 }),
        getSelection: () => fake.selection,
        setSelection: (range: unknown) => (fake.selection = range),
        setPosition: () => undefined,
        revealRangeInCenter: (range: unknown) => (fake.revealed = range),
        focus: () => (fake.focused += 1),
        getAction: () => undefined,
      }
      fake.model = { uri: { toString: () => path } }
      previous.current = path
      onMount(editor)
    }, [])
    react.useEffect(() => {
      if (previous.current === path) return
      viewStates.current.set(previous.current!, fake.selection)
      previous.current = path
      fake.model = { uri: { toString: () => path } }
      // The wrapper's order: setModel (fires the change event), then restore.
      fake.modelListeners.forEach((cb) => cb())
      fake.selection = viewStates.current.get(path) ?? null
    }, [path])
    return <div data-testid="monaco">{path}</div>
  }
  return { default: MockEditor, useMonaco: () => null }
})
vi.mock('../../../lib/monaco/theme', () => ({ useMonacoTheme: () => 'vs' }))
vi.mock('../../../lib/monaco/use-workflow-type-context', () => ({
  useWorkflowTypeContext: () => undefined,
}))
vi.mock('../../../lib/monaco/use-type-acquisition', () => ({ useTypeAcquisition: () => true }))

function file(path: string): GeneratedFile {
  return { path, source: 'const hello = 1\nconst x = 2\nconst needle = 3\n', role: 'module' }
}
const files = new Map([
  ['a.ts', file('a.ts')],
  ['b.ts', file('b.ts')],
])

function renderGroup() {
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
      review={makeReviewBindings()}
    />,
  )
}

beforeEach(() => {
  useIdeStore.getState().resetSession()
  fake.selection = null
  fake.revealed = null
  fake.modelListeners = []
  fake.model = null
  fake.focused = 0
})

describe('EditorGroup reveal', () => {
  it('selects a search hit in a file shown before, instead of the saved view state winning', async () => {
    useIdeStore.getState().openFile('a.ts')
    renderGroup()
    await screen.findByTestId('monaco')
    await waitFor(() => expect(fake.modelListeners).toHaveLength(1))
    // The user left a selection in a.ts, then went to b.ts.
    fake.selection = { startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: 6 }
    act(() => useIdeStore.getState().openFile('b.ts'))

    const hit = { startLineNumber: 3, startColumn: 7, endLineNumber: 3, endColumn: 13 }
    act(() =>
      useIdeStore.getState().revealLocation({ path: 'a.ts', line: 3, column: 7, endColumn: 13 }),
    )

    await waitFor(() => expect(useIdeStore.getState().reveal).toBeNull())
    expect(fake.selection).toEqual(hit)
    expect(fake.revealed).toEqual(hit)
    expect(fake.focused).toBeGreaterThan(0)
  })
})
