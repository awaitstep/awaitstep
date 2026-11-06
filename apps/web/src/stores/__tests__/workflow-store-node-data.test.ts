import { beforeEach, describe, expect, it } from 'vitest'
import type { WorkflowNode } from '@awaitstep/ir'
import { useWorkflowStore } from '../workflow-store'

function irNode(id: string, data: Record<string, unknown> = {}): WorkflowNode {
  return {
    id,
    type: 'step',
    name: id,
    position: { x: 0, y: 0 },
    version: '1.0.0',
    provider: 'cloudflare',
    data: { code: 'return 1;', ...data },
  }
}

function seed(...nodes: WorkflowNode[]) {
  useWorkflowStore.setState({
    nodes: nodes.map((n) => ({
      id: n.id,
      type: n.type,
      position: n.position,
      data: { irNode: n },
    })),
    edges: [],
    isDirty: false,
    readOnly: false,
  } as never)
}

function dataOf(id: string) {
  return useWorkflowStore.getState().nodes.find((n) => n.id === id)!.data.irNode.data
}

beforeEach(() => {
  useWorkflowStore.getState().reset()
})

describe('updateNodeData', () => {
  it('does nothing, and keeps the draft clean, for a node that is gone', () => {
    seed(irNode('a'))
    useWorkflowStore.getState().updateNodeData('gone', { data: { code: 'x' } })
    expect(useWorkflowStore.getState().isDirty).toBe(false)
    expect(dataOf('a')).toEqual({ code: 'return 1;' })
  })

  it('marks the draft dirty for a node that exists', () => {
    seed(irNode('a'))
    useWorkflowStore.getState().updateNodeData('a', { name: 'renamed' })
    expect(useWorkflowStore.getState().isDirty).toBe(true)
  })
})

describe('updateNodeField', () => {
  it('merges one field into the node as it is in the store now, not as a caller last saw it', () => {
    seed(irNode('a', { retryLimit: 1 }))
    // Something else changes the node first (a reload, another field's debounce).
    useWorkflowStore.getState().updateNodeField('a', 'timeout', '30 seconds')
    useWorkflowStore.getState().updateNodeField('a', 'code', 'return 2;')
    expect(dataOf('a')).toEqual({ code: 'return 2;', retryLimit: 1, timeout: '30 seconds' })
  })

  it('ignores a node that is gone and a read-only draft', () => {
    seed(irNode('a'))
    useWorkflowStore.getState().updateNodeField('gone', 'code', 'x')
    expect(useWorkflowStore.getState().isDirty).toBe(false)
    useWorkflowStore.setState({ readOnly: true })
    useWorkflowStore.getState().updateNodeField('a', 'code', 'x')
    expect(dataOf('a')).toEqual({ code: 'return 1;' })
    expect(useWorkflowStore.getState().isDirty).toBe(false)
  })
})
