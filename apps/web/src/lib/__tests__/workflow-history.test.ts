import { describe, it, expect, beforeEach } from 'vitest'
import {
  clearWorkflowHistory,
  describeTimeTravel,
  redoWorkflowEdit,
  undoWorkflowEdit,
  useWorkflowStore,
} from '../../stores/workflow-store'

function nodeCount(): number {
  return useWorkflowStore.getState().nodes.length
}

function history() {
  const t = useWorkflowStore.temporal.getState()
  return { past: t.pastStates.length, future: t.futureStates.length }
}

describe('workflow undo/redo', () => {
  beforeEach(() => {
    useWorkflowStore.getState().reset()
    clearWorkflowHistory()
  })

  it('undoes and redoes a structural edit', () => {
    useWorkflowStore.getState().addNode('step', { x: 0, y: 0 })
    expect(nodeCount()).toBe(1)

    undoWorkflowEdit()
    expect(nodeCount()).toBe(0)

    redoWorkflowEdit()
    expect(nodeCount()).toBe(1)
  })

  it('marks the workflow dirty and drops stale reports after time travel', () => {
    useWorkflowStore.getState().addNode('step', { x: 0, y: 0 })
    useWorkflowStore.setState({
      isDirty: false,
      validationResult: { canPublish: false, issues: [] },
      simulationResult: null,
    })

    undoWorkflowEdit()

    const state = useWorkflowStore.getState()
    expect(state.isDirty).toBe(true)
    // A report about nodes that may no longer exist must not survive.
    expect(state.validationResult).toBeNull()
  })

  it('ignores time travel on read-only workflows', () => {
    useWorkflowStore.getState().addNode('step', { x: 0, y: 0 })
    useWorkflowStore.setState({ readOnly: true })

    undoWorkflowEdit()
    expect(nodeCount()).toBe(1)
  })

  it('no-ops at the ends of history', () => {
    expect(history()).toEqual({ past: 0, future: 0 })
    undoWorkflowEdit()
    redoWorkflowEdit()
    expect(nodeCount()).toBe(0)
  })

  it('does not record selection changes as history entries', () => {
    useWorkflowStore.getState().addNode('step', { x: 0, y: 0 })
    const before = history().past
    const id = useWorkflowStore.getState().nodes[0]!.id

    useWorkflowStore.getState().selectNode(id)
    useWorkflowStore.getState().selectNode(null)

    expect(history().past).toBe(before)
  })

  it('collapses a drag into one history entry', () => {
    useWorkflowStore.getState().addNode('step', { x: 0, y: 0 })
    const id = useWorkflowStore.getState().nodes[0]!.id
    const before = history().past

    // In-flight pointer ticks carry dragging: true...
    for (let i = 1; i <= 5; i++) {
      useWorkflowStore
        .getState()
        .onNodesChange([
          { id, type: 'position', position: { x: i * 10, y: i * 10 }, dragging: true },
        ])
    }
    expect(history().past).toBe(before)

    // ...and the drop records exactly one entry for the whole drag.
    useWorkflowStore
      .getState()
      .onNodesChange([{ id, type: 'position', position: { x: 50, y: 50 }, dragging: false }])

    expect(history().past).toBe(before + 1)
    expect(useWorkflowStore.getState().nodes[0]!.position).toEqual({ x: 50, y: 50 })

    // One undo returns to the pre-drag position.
    undoWorkflowEdit()
    expect(useWorkflowStore.getState().nodes[0]!.position).toEqual({ x: 0, y: 0 })
  })

  it('records programmatic position writes (no drag flag) normally', () => {
    useWorkflowStore.getState().addNode('step', { x: 0, y: 0 })
    const id = useWorkflowStore.getState().nodes[0]!.id
    const before = history().past

    useWorkflowStore
      .getState()
      .onNodesChange([{ id, type: 'position', position: { x: 80, y: 80 } }])

    expect(history().past).toBe(before + 1)
  })

  it('ignores React Flow select and dimensions changes (clicks, mount measurement)', () => {
    useWorkflowStore.getState().addNode('step', { x: 0, y: 0 })
    const id = useWorkflowStore.getState().nodes[0]!.id
    const before = history().past

    useWorkflowStore.getState().onNodesChange([{ id, type: 'select', selected: true }])
    useWorkflowStore
      .getState()
      .onNodesChange([{ id, type: 'dimensions', dimensions: { width: 120, height: 40 } }])
    useWorkflowStore.getState().onNodesChange([{ id, type: 'select', selected: false }])

    expect(history().past).toBe(before)
  })

  it('add → select → drag → undo → undo removes the node (the reported scenario)', () => {
    useWorkflowStore.getState().addNode('step', { x: 0, y: 0 })
    const id = useWorkflowStore.getState().nodes[0]!.id
    // React Flow auto-selects and measures a freshly added node.
    useWorkflowStore.getState().onNodesChange([{ id, type: 'select', selected: true }])
    useWorkflowStore
      .getState()
      .onNodesChange([{ id, type: 'dimensions', dimensions: { width: 120, height: 40 } }])
    for (let i = 1; i <= 3; i++) {
      useWorkflowStore
        .getState()
        .onNodesChange([{ id, type: 'position', position: { x: i * 10, y: 0 }, dragging: true }])
    }
    useWorkflowStore
      .getState()
      .onNodesChange([{ id, type: 'position', position: { x: 30, y: 0 }, dragging: false }])

    undoWorkflowEdit()
    expect(useWorkflowStore.getState().nodes[0]!.position).toEqual({ x: 0, y: 0 })
    const summary = undoWorkflowEdit()
    expect(nodeCount()).toBe(0)
    expect(summary?.removedNodeNames).toHaveLength(1)
  })

  it('clears the selection when the undone node was the selected one', () => {
    useWorkflowStore.getState().addNode('step', { x: 0, y: 0 })
    const id = useWorkflowStore.getState().nodes[0]!.id
    useWorkflowStore.getState().selectNode(id)
    undoWorkflowEdit()
    expect(useWorkflowStore.getState().selectedNodeId).toBeNull()
  })

  it('describes node removals and restorations for the toast, and nothing for moves', () => {
    expect(
      describeTimeTravel({ direction: 'undo', removedNodeNames: ['Fetch'], addedNodeNames: [] }),
    ).toBe('Undo: removed node “Fetch”')
    expect(
      describeTimeTravel({ direction: 'redo', removedNodeNames: [], addedNodeNames: ['A', 'B'] }),
    ).toBe('Redo: restored 2 nodes')
    expect(
      describeTimeTravel({ direction: 'undo', removedNodeNames: [], addedNodeNames: [] }),
    ).toBe(null)
    expect(describeTimeTravel(null)).toBeNull()
  })

  it('clearWorkflowHistory drops past and future', () => {
    useWorkflowStore.getState().addNode('step', { x: 0, y: 0 })
    undoWorkflowEdit()
    expect(history().future).toBeGreaterThan(0)

    clearWorkflowHistory()
    expect(history()).toEqual({ past: 0, future: 0 })
  })
})
