import { beforeEach, describe, expect, it } from 'vitest'
import type { WorkflowNode } from '@awaitstep/ir'
import { clearWorkflowHistory, undoWorkflowEdit, useWorkflowStore } from '../workflow-store'

function irNode(
  id: string,
  position: { x: number; y: number },
  extra: Partial<WorkflowNode> = {},
): WorkflowNode {
  return {
    id,
    type: 'step',
    name: id,
    position,
    version: '1.0.0',
    data: { code: 'return 1;' },
    ...extra,
  }
}

function seed(
  nodes: WorkflowNode[],
  edges: { id: string; source: string; target: string; label?: string }[] = [],
) {
  useWorkflowStore.setState({
    nodes: nodes.map((n) => ({
      id: n.id,
      type: n.type,
      position: n.position!,
      data: { irNode: n },
    })),
    edges,
    isDirty: false,
    readOnly: false,
  } as never)
  clearWorkflowHistory()
}

const state = () => useWorkflowStore.getState()
const edgesOf = () => state().edges.map(({ source, target, label }) => ({ source, target, label }))

beforeEach(() => {
  state().reset()
  clearWorkflowHistory()
})

describe('onConnect', () => {
  it('keeps the sides an edge was dragged between', () => {
    seed([irNode('a', { x: 0, y: 0 }), irNode('b', { x: 0, y: 160 })])
    state().onConnect({
      source: 'a',
      target: 'b',
      sourceHandle: 'out-right',
      targetHandle: 'in-top',
    })
    expect(state().edges[0]).toMatchObject({
      source: 'a',
      target: 'b',
      sourceHandle: 'out-right',
      targetHandle: 'in-top',
    })
  })

  it('drops a handle id that is not a side of that kind', () => {
    seed([irNode('a', { x: 0, y: 0 }), irNode('b', { x: 0, y: 160 })])
    state().onConnect({ source: 'a', target: 'b', sourceHandle: 'in-left', targetHandle: 'x' })
    const [edge] = state().edges
    expect(edge).not.toHaveProperty('sourceHandle')
    expect(edge).not.toHaveProperty('targetHandle')
  })

  // The case reported by hand: a step with its exit on the bottom could not
  // be moved to the right exit — the drag either did not start or was refused
  // as a second way out.
  it('moves an existing edge to the sides of a new drag between the same nodes', () => {
    seed(
      [irNode('a', { x: 0, y: 0 }), irNode('b', { x: 0, y: 160 })],
      [{ id: 'e1', source: 'a', target: 'b', label: 'then' }],
    )
    state().onConnect({ source: 'a', target: 'b', sourceHandle: 'out-right', targetHandle: null })
    expect(state().edges).toEqual([
      { id: 'e1', source: 'a', target: 'b', label: 'then', sourceHandle: 'out-right' },
    ])
    expect(state().isDirty).toBe(true)
  })

  it('refuses a second way out of a step, whichever exit it is dragged from', () => {
    seed(
      [irNode('a', { x: 0, y: 0 }), irNode('b', { x: 0, y: 160 }), irNode('c', { x: 340, y: 0 })],
      [{ id: 'e1', source: 'a', target: 'b' }],
    )
    state().onConnect({
      source: 'a',
      target: 'c',
      sourceHandle: 'out-right',
      targetHandle: 'in-left',
    })
    expect(state().edges).toHaveLength(1)
  })

  // Regression: the old rule read a break's outgoing edges from a list only
  // multi-edge nodes filled, so dragging from a break threw.
  it('connects from a break', () => {
    seed([
      irNode('brk', { x: 0, y: 0 }, { type: 'break', data: { condition: 'i > 3' } }),
      irNode('b', { x: 0, y: 160 }),
    ])
    state().onConnect({ source: 'brk', target: 'b', sourceHandle: null, targetHandle: null })
    expect(edgesOf()).toEqual([{ source: 'brk', target: 'b', label: 'else' }])
  })
})

describe('dragging again between joined nodes', () => {
  const pair = () =>
    seed([irNode('a', { x: 0, y: 0 }), irNode('b', { x: 0, y: 160 })], [
      { id: 'e1', source: 'a', target: 'b', sourceHandle: 'out-right', targetHandle: 'in-top' },
    ] as never)

  it('changes nothing, and leaves the workflow saved, when the sides are the same', () => {
    pair()
    const before = state().edges
    state().onConnect({
      source: 'a',
      target: 'b',
      sourceHandle: 'out-right',
      targetHandle: 'in-top',
    })
    expect(state().edges).toBe(before)
    expect(state().isDirty).toBe(false)
  })

  it('is undone in one step', () => {
    pair()
    state().onConnect({
      source: 'a',
      target: 'b',
      sourceHandle: 'out-bottom',
      targetHandle: 'in-left',
    })
    expect(state().edges[0]).toMatchObject({ sourceHandle: 'out-bottom', targetHandle: 'in-left' })
    undoWorkflowEdit()
    expect(state().edges[0]).toMatchObject({ sourceHandle: 'out-right', targetHandle: 'in-top' })
  })

  // Accepted: a branch with two arms into the same node moves the first; such
  // graphs are refused by arm-into-join validation anyway.
  it('moves the first of two edges between the same pair and adds none', () => {
    seed(
      [
        irNode('br', { x: 0, y: 0 }, { type: 'branch', data: { branches: [] } }),
        irNode('c', { x: 0, y: 160 }),
      ],
      [
        { id: 'e1', source: 'br', target: 'c', label: 'yes' },
        { id: 'e2', source: 'br', target: 'c', label: 'no' },
      ],
    )
    state().onConnect({ source: 'br', target: 'c', sourceHandle: 'out-right', targetHandle: null })
    expect(state().edges.map((e) => [e.id, e.sourceHandle])).toEqual([
      ['e1', 'out-right'],
      ['e2', undefined],
    ])
  })
})

describe('sides through other edits', () => {
  it('keeps each end’s side when a node is dropped onto a pinned edge', () => {
    seed([irNode('a', { x: 0, y: 0 }), irNode('b', { x: 0, y: 320 })], [
      { id: 'e1', source: 'a', target: 'b', sourceHandle: 'out-right', targetHandle: 'in-left' },
    ] as never)
    state().insertNodeOnEdge('step', { x: 0, y: 160 }, 'e1', undefined as never)
    const [first, second] = state().edges
    expect(first).toMatchObject({ source: 'a', sourceHandle: 'out-right' })
    expect(first).not.toHaveProperty('targetHandle')
    expect(second).toMatchObject({ target: 'b', targetHandle: 'in-left' })
    expect(second).not.toHaveProperty('sourceHandle')
  })

  it('carries the sides onto a duplicate', () => {
    seed([irNode('a', { x: 0, y: 0 }), irNode('b', { x: 0, y: 160 })], [
      { id: 'e1', source: 'a', target: 'b', sourceHandle: 'out-right', targetHandle: 'in-top' },
    ] as never)
    const ids = state().duplicateNodes(['a', 'b'])
    const copy = state().edges.find((e) => ids.includes(e.source))!
    expect(copy).toMatchObject({ sourceHandle: 'out-right', targetHandle: 'in-top' })
  })
})

describe('addNodeFromSide', () => {
  it('adds a node to the right of an exit, joined from it, and selects it', () => {
    seed([irNode('a', { x: 0, y: 0 })])
    const id = state().addNodeFromSide('a', 'right', 'sleep')!
    const added = state().nodes.find((n) => n.id === id)!
    // A 220px node plus the 80px gap, rounded up to the 40px grid.
    expect(added.position).toEqual({ x: 320, y: 0 })
    expect(added.selected).toBe(true)
    expect(state().selectedNodeId).toBe(id)
    expect(edgesOf()).toEqual([{ source: 'a', target: id, label: undefined }])
    expect(state().isDirty).toBe(true)
  })

  it('labels the edge as a drag would', () => {
    seed([irNode('loop', { x: 0, y: 0 }, { type: 'loop', data: { loopType: 'forEach' } })])
    const id = state().addNodeFromSide('loop', 'bottom', 'step')!
    expect(edgesOf()).toEqual([{ source: 'loop', target: id, label: 'body' }])
  })

  it('refuses an exit that cannot take one more edge', () => {
    seed(
      [irNode('a', { x: 0, y: 0 }), irNode('b', { x: 0, y: 160 })],
      [{ id: 'e1', source: 'a', target: 'b' }],
    )
    expect(state().addNodeFromSide('a', 'right', 'step')).toBeNull()
    expect(state().nodes).toHaveLength(2)
  })

  it('adds a node above a node with no way in, joined into it', () => {
    seed([irNode('a', { x: 0, y: 200 })])
    const id = state().addNodeFromSide('a', 'top', 'step')!
    // An 80px node plus the 80px gap above y=200.
    expect(state().nodes.find((n) => n.id === id)!.position).toEqual({ x: 0, y: 40 })
    expect(edgesOf()).toEqual([{ source: id, target: 'a', label: undefined }])
  })

  it('puts a node added at an entry between the node and the one before it', () => {
    const wait = irNode(
      'w',
      { x: 0, y: 0 },
      {
        type: 'wait_for_event',
        data: { eventType: 'sunny', timeout: '30 seconds', onEventNode: 's', onTimeoutNode: '' },
      },
    )
    seed(
      [wait, irNode('s', { x: 400, y: 0 })],
      [{ id: 'e1', source: 'w', target: 's', label: 'onEvent' }],
    )
    const id = state().addNodeFromSide('s', 'left', 'step')!
    expect(edgesOf()).toEqual([
      { source: 'w', target: id, label: 'onEvent' },
      { source: id, target: 's', label: undefined },
    ])
    // The wait names its arm's first node, which is now the new one.
    expect(state().nodes.find((n) => n.id === 'w')!.data.irNode.data.onEventNode).toBe(id)
  })

  it('drops the entry side a re-targeted edge had picked, keeping its exit side', () => {
    seed([irNode('a', { x: 0, y: 0 }), irNode('s', { x: 400, y: 0 })], [
      { id: 'e1', source: 'a', target: 's', sourceHandle: 'out-right', targetHandle: 'in-left' },
    ] as never)
    const id = state().addNodeFromSide('s', 'left', 'step')!
    const moved = state().edges.find((e) => e.id === 'e1')!
    expect(moved).toMatchObject({ target: id, sourceHandle: 'out-right' })
    expect(moved).not.toHaveProperty('targetHandle')
  })

  it('puts a node added at an entry before every way into the node', () => {
    seed(
      [irNode('x', { x: 0, y: 0 }), irNode('y', { x: 400, y: 0 }), irNode('j', { x: 200, y: 300 })],
      [
        { id: 'e1', source: 'x', target: 'j' },
        { id: 'e2', source: 'y', target: 'j' },
      ],
    )
    const id = state().addNodeFromSide('j', 'left', 'step')!
    expect(edgesOf()).toEqual([
      { source: 'x', target: id, label: undefined },
      { source: 'y', target: id, label: undefined },
      { source: id, target: 'j', label: undefined },
    ])
  })

  it('is undone in one step', () => {
    seed([irNode('a', { x: 0, y: 0 })])
    state().addNodeFromSide('a', 'bottom', 'step')
    undoWorkflowEdit()
    expect(state().nodes.map((n) => n.id)).toEqual(['a'])
    expect(state().edges).toEqual([])
  })

  it('does nothing on a read-only canvas', () => {
    seed([irNode('a', { x: 0, y: 0 })])
    useWorkflowStore.setState({ readOnly: true })
    expect(state().addNodeFromSide('a', 'bottom', 'step')).toBeNull()
    expect(state().nodes).toHaveLength(1)
  })
})
