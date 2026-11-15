import { act, render, waitFor } from '@testing-library/react'
import { ReactFlow, type Node, type NodeChange } from '@xyflow/react'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import type { Monaco } from '@monaco-editor/react'
import { configureExpressionLanguage } from '../expression-language'
import { keepKeysInEditors, NO_GRAPH_KEYS_CLASS } from '../key-isolation'

// Real React Flow beside a stand-in for Monaco's EditContext input: a plain
// div inside `.monaco-editor`, exactly what React Flow fails to see as typing.
beforeAll(() => {
  class FakeResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  vi.stubGlobal('ResizeObserver', FakeResizeObserver)
  vi.stubGlobal(
    'DOMMatrixReadOnly',
    class {
      m22 = 1
    },
  )
})

afterEach(() => {
  document.body.innerHTML = ''
})

type CreateListener = (editor: { getContainerDomNode(): HTMLElement }) => void

function fakeMonaco(existing: HTMLElement[] = []) {
  const listeners: CreateListener[] = []
  const monaco = {
    editor: {
      onDidCreateEditor: vi.fn((listener: CreateListener) => {
        listeners.push(listener)
        return { dispose() {} }
      }),
      getEditors: () => existing.map((container) => ({ getContainerDomNode: () => container })),
    },
  }
  return {
    monaco,
    create(container: HTMLElement) {
      for (const listener of listeners) listener({ getContainerDomNode: () => container })
    },
  }
}

const selectedNode: Node[] = [{ id: 'step', position: { x: 0, y: 0 }, data: {}, selected: true }]

function renderGraphBesideEditor() {
  const onNodesChange = vi.fn<(changes: NodeChange[]) => void>()
  const view = render(
    <div>
      <div style={{ width: 400, height: 300 }}>
        <ReactFlow nodes={selectedNode} edges={[]} onNodesChange={onNodesChange} />
      </div>
      <div data-testid="editor" className="monaco-editor">
        <div data-testid="input" className="native-edit-context" tabIndex={0} />
      </div>
    </div>,
  )
  return {
    onNodesChange,
    editor: view.getByTestId('editor'),
    input: view.getByTestId('input'),
  }
}

// Key held down, no keyup: React Flow acts in an effect on the pressed state,
// and a keyup in the same tick would be batched away before it runs. `act`
// flushes that effect, so a test sees its outcome without waiting on timers.
async function press(target: HTMLElement, key: string, code: string): Promise<KeyboardEvent> {
  const event = new KeyboardEvent('keydown', { key, code, bubbles: true, cancelable: true })
  await act(async () => {
    target.dispatchEvent(event)
  })
  return event
}

function removals(onNodesChange: ReturnType<typeof renderGraphBesideEditor>['onNodesChange']) {
  return onNodesChange.mock.calls.flat(2).filter((change) => change.type === 'remove')
}

describe('keepKeysInEditors', () => {
  it('marks every editor the instance creates afterwards', () => {
    const { monaco, create } = fakeMonaco()
    keepKeysInEditors(monaco)
    const container = document.createElement('div')
    create(container)
    expect(container.classList.contains(NO_GRAPH_KEYS_CLASS)).toBe(true)
  })

  it('marks the editors that exist before it runs (a DiffEditor calls beforeMount after creating them)', () => {
    const container = document.createElement('div')
    const { monaco } = fakeMonaco([container])
    keepKeysInEditors(monaco)
    expect(container.classList.contains(NO_GRAPH_KEYS_CLASS)).toBe(true)
  })

  it('is wired into the expression editor setup', () => {
    const { monaco } = fakeMonaco()
    const languages = {
      register: vi.fn(),
      setMonarchTokensProvider: vi.fn(),
      setLanguageConfiguration: vi.fn(),
      registerCompletionItemProvider: vi.fn(),
      registerHoverProvider: vi.fn(),
      CompletionItemKind: {},
    }
    configureExpressionLanguage({ ...monaco, languages } as unknown as Monaco)
    expect(monaco.editor.onDidCreateEditor).toHaveBeenCalledTimes(1)
  })

  it('subscribes once per Monaco instance', () => {
    const { monaco } = fakeMonaco()
    keepKeysInEditors(monaco)
    keepKeysInEditors(monaco)
    expect(monaco.editor.onDidCreateEditor).toHaveBeenCalledTimes(1)
  })

  it('without the mark, React Flow swallows Space typed in the editor (the bug)', async () => {
    const { input } = renderGraphBesideEditor()
    expect((await press(input, ' ', 'Space')).defaultPrevented).toBe(true)
  })

  it('lets Space typed in a marked editor through', async () => {
    const { monaco, create } = fakeMonaco()
    keepKeysInEditors(monaco)
    const { editor, input } = renderGraphBesideEditor()
    create(editor)
    expect((await press(input, ' ', 'Space')).defaultPrevented).toBe(false)
  })

  it('does not delete the selected graph node on Backspace typed in a marked editor', async () => {
    const { monaco, create } = fakeMonaco()
    keepKeysInEditors(monaco)
    const { editor, input, onNodesChange } = renderGraphBesideEditor()
    create(editor)
    await press(input, 'Backspace', 'Backspace')
    expect(removals(onNodesChange)).toEqual([])
  })

  it('without the mark, Backspace in the editor deletes the selected graph node (the bug)', async () => {
    const { input, onNodesChange } = renderGraphBesideEditor()
    await press(input, 'Backspace', 'Backspace')
    await waitFor(() => {
      expect(removals(onNodesChange)).toEqual([expect.objectContaining({ id: 'step' })])
    })
  })
})
