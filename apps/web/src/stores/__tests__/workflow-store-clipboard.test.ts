import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { WorkflowNode } from '@awaitstep/ir'
import { clearWorkflowHistory, useWorkflowStore } from '../workflow-store'

function irNode(id: string, x: number): WorkflowNode {
  return {
    id,
    type: 'step',
    name: id,
    position: { x, y: 0 },
    version: '1.0.0',
    data: { code: 'return 1;' },
  }
}

function seed(nodes: WorkflowNode[], readOnly = false) {
  useWorkflowStore.setState({
    nodes: nodes.map((n) => ({
      id: n.id,
      type: n.type,
      position: n.position!,
      data: { irNode: n },
    })),
    edges: [],
    isDirty: false,
    readOnly,
  } as never)
  clearWorkflowHistory()
}

const state = () => useWorkflowStore.getState()

/** A browser whose clipboard API refuses, as on plain http or without permission. */
function refuseClipboardApi() {
  vi.stubGlobal('navigator', {
    clipboard: {
      writeText: () => Promise.reject(new DOMException('denied', 'NotAllowedError')),
      readText: () => Promise.reject(new DOMException('denied', 'NotAllowedError')),
    },
  })
  vi.stubGlobal('document', {
    createElement: () => ({ style: {}, select: () => {} }),
    body: { appendChild: () => {}, removeChild: () => {} },
    execCommand: () => false,
  })
}

beforeEach(() => {
  state().reset()
  clearWorkflowHistory()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('canvas copy and paste', () => {
  it('pastes the text a copy produced as new nodes', () => {
    seed([irNode('a', 0)])
    const text = state().copyNodesText(['a'])
    expect(text).toBeTruthy()
    const pasted = state().pasteNodesFromText(text!)
    expect(pasted).toHaveLength(1)
    expect(pasted[0]).not.toBe('a')
    expect(state().nodes).toHaveLength(2)
    expect(state().isDirty).toBe(true)
  })

  it.each([
    ['plain text', 'hello'],
    ['JSON that is not copied nodes', '{"nodes":[]}'],
    ['nothing', ''],
  ])('pastes nothing from %s', (_, text) => {
    seed([irNode('a', 0)])
    expect(state().pasteNodesFromText(text)).toEqual([])
    expect(state().nodes).toHaveLength(1)
  })

  it('pastes nothing on a read-only canvas', () => {
    seed([irNode('a', 0)])
    const text = state().copyNodesText(['a'])!
    useWorkflowStore.setState({ readOnly: true })
    expect(state().pasteNodesFromText(text)).toEqual([])
  })

  it('copies and pastes from the menu when the clipboard API refuses', async () => {
    seed([irNode('a', 0)])
    refuseClipboardApi()
    await expect(state().copyNodesToClipboard(['a'])).resolves.toBe(true)
    const pasted = await state().pasteNodesFromClipboard({ x: 300, y: 0 })
    expect(pasted).toHaveLength(1)
    expect(state().nodes).toHaveLength(2)
  })

  it('pastes the system clipboard’s text, not the in-app copy, when it may be read', async () => {
    seed([irNode('a', 0)])
    state().copyNodesText(['a'])
    vi.stubGlobal('navigator', { clipboard: { readText: () => Promise.resolve('hello') } })
    await expect(state().pasteNodesFromClipboard()).resolves.toEqual([])
    expect(state().nodes).toHaveLength(1)
  })
})
