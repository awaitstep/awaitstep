import { describe, expect, it } from 'vitest'
import {
  orderSteps,
  visibleRows,
  type OrderEdge,
  type OrderNode,
  type StepRow,
} from '../ide/step-order'
import { railRows } from '../ide/step-rail-layout'

function n(id: string, type = 'step'): OrderNode {
  return { id, type }
}
function e(source: string, target: string, label?: string): OrderEdge {
  return { source, target, ...(label !== undefined && { label }) }
}

/** The Steps view's fixture: a chain into a two-arm branch. */
function branchRows() {
  return orderSteps(
    [n('validate'), n('charge'), n('check', 'branch'), n('ship'), n('wait')],
    [
      e('validate', 'charge'),
      e('charge', 'check'),
      e('check', 'ship', 'paid'),
      e('check', 'wait', 'late'),
    ],
  )
}

describe('railRows', () => {
  it('draws a chain from the entry to the last dot, with no stub at either end', () => {
    const rows = orderSteps([n('a'), n('b'), n('c')], [e('a', 'b'), e('b', 'c')])
    expect(railRows(rows)).toEqual([
      { depth: 0, lanes: [], below: true, connector: false },
      { depth: 0, lanes: [{ level: 0, to: 'dot' }], below: true, connector: false },
      { depth: 0, lanes: [{ level: 0, to: 'dot' }], below: false, connector: false },
    ])
  })

  it('stops the trunk at the last fork and never joins two sibling arms', () => {
    const rail = railRows(branchRows())
    // The container's own way in still comes from above.
    expect(rail[2]).toMatchObject({
      depth: 0,
      lanes: [{ level: 0, to: 'dot' }],
      below: true,
    })
    // Ship (the first arm) gets the parent line behind it; wait is the last fork.
    expect(rail[3]).toEqual({
      depth: 1,
      lanes: [{ level: 0, to: 'bottom' }],
      below: false,
      connector: true,
    })
    expect(rail[4]).toEqual({
      depth: 1,
      lanes: [{ level: 0, to: 'dot' }],
      below: false,
      connector: true,
    })
  })

  it('keeps the trunk through both arms when they rejoin', () => {
    const rows = orderSteps(
      [n('start'), n('check', 'branch'), n('yes'), n('no'), n('join'), n('end')],
      [
        e('start', 'check'),
        e('check', 'yes', 'approved'),
        e('check', 'no', 'rejected'),
        e('yes', 'join'),
        e('no', 'join'),
        e('join', 'end'),
      ],
    )
    const rail = railRows(rows)
    expect(rail[2]).toMatchObject({ depth: 1, lanes: [{ level: 0, to: 'bottom' }] })
    expect(rail[3]).toMatchObject({ depth: 1, lanes: [{ level: 0, to: 'bottom' }] })
    // The rejoin continues the trunk at its own level.
    expect(rail[4]).toMatchObject({
      depth: 0,
      lanes: [{ level: 0, to: 'dot' }],
      below: true,
    })
  })

  it('keeps one lane per ancestor through a nested container', () => {
    const rows = orderSteps(
      [n('outer', 'branch'), n('left', 'parallel'), n('l1'), n('l2'), n('lj'), n('right'), n('oj')],
      [
        e('outer', 'left', 'a'),
        e('outer', 'right', 'b'),
        e('left', 'l1'),
        e('left', 'l2'),
        e('l1', 'lj'),
        e('l2', 'lj'),
        e('lj', 'oj'),
        e('right', 'oj'),
      ],
    )
    const rail = railRows(rows)
    expect(rail[2]).toMatchObject({
      depth: 2,
      lanes: [
        { level: 0, to: 'bottom' },
        { level: 1, to: 'bottom' },
      ],
      connector: true,
    })
  })

  it('connects an unlabelled arm like a labelled one', () => {
    const rows = orderSteps([n('p', 'parallel'), n('a'), n('b')], [e('p', 'a'), e('p', 'b')])
    const rail = railRows(rows)
    expect(rows[1]).toMatchObject({ arm: null, armStart: true })
    expect(rail[1]).toMatchObject({ connector: true })
    expect(rail[2]).toMatchObject({ connector: true })
  })

  it('shortens the lanes when a container is folded', () => {
    const rows = branchRows()
    const shown = visibleRows(rows, new Set(['check']))
    const rail = railRows(shown)
    // With the arms hidden the container's dot ends the trunk: no rejoin follows.
    expect(shown.map((row) => row.nodeId)).toEqual(['validate', 'charge', 'check'])
    expect(rail[2]).toMatchObject({
      depth: 0,
      lanes: [{ level: 0, to: 'dot' }],
      below: false,
    })
  })

  it('returns nothing for an empty list', () => {
    expect(railRows([])).toEqual([])
  })

  it('lays out thousands of rows at the depth cap without rescanning the tail', () => {
    // The shape a <=1 MiB version can reach: 100 levels, then ~8,000 leaves.
    // A per-row forward scan costs seconds here and trips the suite timeout.
    const rows: StepRow[] = []
    for (let depth = 0; depth < 100; depth++) {
      rows.push({
        nodeId: `n${depth}`,
        depth,
        parentId: depth === 0 ? null : `n${depth - 1}`,
        arm: null,
        armStart: false,
        continuesAbove: depth > 0,
        container: false,
      })
    }
    for (let leaf = 0; leaf < 8_000; leaf++) {
      rows.push({
        nodeId: `leaf${leaf}`,
        depth: 100,
        parentId: 'n99',
        arm: null,
        armStart: false,
        continuesAbove: false,
        container: false,
      })
    }
    const rail = railRows(rows)
    expect(rail).toHaveLength(8_100)
    expect(rail[8_099]!.depth).toBe(100)
  })
})
