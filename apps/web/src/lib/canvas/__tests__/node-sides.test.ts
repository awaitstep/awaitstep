import { describe, expect, it } from 'vitest'
import {
  edgeSides,
  nodeBox,
  pinnedHandles,
  pinnedSides,
  retargetEdge,
  usedSides,
  withEdgeSides,
  NODE_WIDTH,
  NODE_HEIGHT,
} from '../node-sides'

const box = (x: number, y: number) => ({ x, y, width: 248, height: 64 })

function node(id: string, x: number, y: number) {
  return { id, position: { x, y }, measured: { width: 248, height: 64 } }
}

describe('edgeSides', () => {
  it('joins a node below from the bottom to the top', () => {
    expect(edgeSides(box(0, 0), box(0, 160))).toEqual({ exit: 'bottom', entry: 'top' })
  })

  it('joins a node beside it from the right to the left', () => {
    expect(edgeSides(box(0, 0), box(340, 0))).toEqual({ exit: 'right', entry: 'left' })
  })

  it('still reads a node to the right but slightly lower as beside', () => {
    expect(edgeSides(box(0, 0), box(340, 40))).toEqual({ exit: 'right', entry: 'left' })
  })

  it('reads a node to the right but wholly below as further down the flow', () => {
    expect(edgeSides(box(0, 0), box(340, 64))).toEqual({ exit: 'bottom', entry: 'top' })
  })

  it('reads a node that overlaps the source horizontally as below', () => {
    expect(edgeSides(box(0, 0), box(200, 0))).toEqual({ exit: 'bottom', entry: 'top' })
  })

  it('never joins a node to the left from the right', () => {
    expect(edgeSides(box(340, 0), box(0, 0))).toEqual({ exit: 'bottom', entry: 'top' })
  })
})

describe('nodeBox', () => {
  it('falls back to the board size before the node is measured', () => {
    expect(nodeBox({ position: { x: 5, y: 6 } })).toEqual({
      x: 5,
      y: 6,
      width: NODE_WIDTH,
      height: NODE_HEIGHT,
    })
  })
})

describe('usedSides', () => {
  it('reads the sides from the handles the drawn edges were given', () => {
    const edges = [
      { source: 'a', target: 'beside', sourceHandle: 'out-right', targetHandle: 'in-left' },
      { source: 'before', target: 'a', sourceHandle: 'out-right', targetHandle: 'in-left' },
      { source: 'a', target: 'below', sourceHandle: 'out-bottom', targetHandle: 'in-top' },
      { source: 'x', target: 'y', sourceHandle: 'out-right', targetHandle: 'in-top' },
    ]
    expect([...usedSides('a', edges)].sort()).toEqual(['bottom', 'left', 'right'])
  })

  it('takes an edge with no handles as React Flow draws it: bottom to top', () => {
    const edges = [
      { source: 'a', target: 'b' },
      { source: 'z', target: 'a' },
    ]
    expect([...usedSides('a', edges)].sort()).toEqual(['bottom', 'top'])
  })
})

describe('withEdgeSides', () => {
  it('sets each edge’s handles from its nodes’ positions and leaves the rest of it alone', () => {
    const nodes = [node('a', 0, 0), node('b', 340, 0), node('c', 0, 160)]
    const edges = [
      { id: 'e1', source: 'a', target: 'b', label: 'onEvent' },
      { id: 'e2', source: 'a', target: 'c' },
      { id: 'e3', source: 'a', target: 'gone' },
    ]
    expect(withEdgeSides(nodes, edges)).toEqual([
      {
        id: 'e1',
        source: 'a',
        target: 'b',
        label: 'onEvent',
        sourceHandle: 'out-right',
        targetHandle: 'in-left',
      },
      { id: 'e2', source: 'a', target: 'c', sourceHandle: 'out-bottom', targetHandle: 'in-top' },
      { id: 'e3', source: 'a', target: 'gone' },
    ])
  })
})

describe('pinned sides', () => {
  it('keeps the sides a person picked and works out only the ones left open', () => {
    const nodes = [node('a', 0, 0), node('b', 0, 160)]
    expect(
      withEdgeSides(nodes, [{ id: 'e1', source: 'a', target: 'b', sourceHandle: 'out-right' }]),
    ).toEqual([
      { id: 'e1', source: 'a', target: 'b', sourceHandle: 'out-right', targetHandle: 'in-top' },
    ])
  })

  it('ignores a handle on the wrong end', () => {
    const nodes = [node('a', 0, 0), node('b', 0, 160)]
    const [edge] = withEdgeSides(nodes, [
      { source: 'a', target: 'b', sourceHandle: 'in-left', targetHandle: 'out-right' },
    ])
    expect(edge).toMatchObject({ sourceHandle: 'out-bottom', targetHandle: 'in-top' })
  })

  it('turns IR sides into handle ids and back', () => {
    const handles = pinnedHandles({ sourceSide: 'right', targetSide: 'top' })
    expect(handles).toEqual({ sourceHandle: 'out-right', targetHandle: 'in-top' })
    expect(pinnedSides(handles)).toEqual({ sourceSide: 'right', targetSide: 'top' })
    expect(pinnedSides({})).toEqual({})
  })

  it('drops sides that are not real ones, as an unchecked document may carry', () => {
    expect(pinnedHandles({ sourceSide: 'top', targetSide: 'constructor' })).toEqual({})
    expect(pinnedSides({ sourceHandle: 'toString', targetHandle: '__proto__' })).toEqual({})
  })
})

describe('retargetEdge', () => {
  it('drops the entry side picked for the old target and keeps the exit side', () => {
    const edge = {
      id: 'e',
      source: 'a',
      target: 'b',
      sourceHandle: 'out-right',
      targetHandle: 'in-left',
    }
    expect(retargetEdge(edge, 'c')).toEqual({
      id: 'e',
      source: 'a',
      target: 'c',
      sourceHandle: 'out-right',
    })
  })

  it('leaves an edge whose target does not change as it is', () => {
    const edge = { id: 'e', source: 'a', target: 'b', targetHandle: 'in-left' }
    expect(retargetEdge(edge, 'b')).toBe(edge)
  })
})

describe('usedSides with stray handle ids', () => {
  it('counts no side for a handle id that is not one', () => {
    const edges = [
      { source: 'a', target: 'b', sourceHandle: 'constructor', targetHandle: 'toString' },
    ]
    expect([...usedSides('a', edges)]).toEqual([])
    expect([...usedSides('b', edges)]).toEqual([])
  })
})
