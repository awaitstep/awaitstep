import { describe, expect, it } from 'vitest'
import { orderSteps, visibleRows, type OrderEdge, type OrderNode } from '../ide/step-order'

function n(id: string, type = 'step', x = 0, y = 0): OrderNode {
  return { id, type, position: { x, y } }
}
function e(source: string, target: string, label?: string): OrderEdge {
  return { source, target, ...(label && { label }) }
}
function shape(rows: ReturnType<typeof orderSteps>) {
  return rows.map((r) => `${'  '.repeat(r.depth)}${r.nodeId}`)
}

describe('orderSteps', () => {
  it('follows the edges from the trigger, not the order nodes were stored', () => {
    const rows = orderSteps([n('c'), n('a'), n('b')], [e('a', 'b'), e('b', 'c')])
    expect(rows.map((r) => r.nodeId)).toEqual(['a', 'b', 'c'])
    expect(rows.every((r) => r.depth === 0 && r.parentId === null && !r.container)).toBe(true)
  })

  it('nests a branch’s arms and continues at the join, back at the top level', () => {
    const nodes = [n('start'), n('check', 'branch'), n('yes'), n('no'), n('join'), n('end')]
    const edges = [
      e('start', 'check'),
      e('check', 'yes', 'approved'),
      e('check', 'no', 'rejected'),
      e('yes', 'join'),
      e('no', 'join'),
      e('join', 'end'),
    ]
    const rows = orderSteps(nodes, edges)
    expect(shape(rows)).toEqual(['start', 'check', '  yes', '  no', 'join', 'end'])
    expect(rows.find((r) => r.nodeId === 'check')?.container).toBe(true)
    expect(rows.find((r) => r.nodeId === 'yes')).toMatchObject({
      parentId: 'check',
      arm: 'approved',
    })
    expect(rows.find((r) => r.nodeId === 'join')).toMatchObject({ parentId: null, depth: 0 })
  })

  it('keeps a branch whose arms never rejoin nested to the end of each arm', () => {
    const nodes = [n('b', 'branch'), n('x1'), n('x2'), n('y1')]
    const edges = [e('b', 'x1', 'x'), e('x1', 'x2'), e('b', 'y1', 'y')]
    expect(shape(orderSteps(nodes, edges))).toEqual(['b', '  x1', '  x2', '  y1'])
  })

  it('puts a loop’s body under it and its way on after it', () => {
    const nodes = [n('loop', 'loop'), n('body1'), n('body2'), n('after')]
    const edges = [e('loop', 'body1', 'body'), e('body1', 'body2'), e('loop', 'after', 'then')]
    const rows = orderSteps(nodes, edges)
    expect(shape(rows)).toEqual(['loop', '  body1', '  body2', 'after'])
    expect(rows[1]).toMatchObject({ parentId: 'loop', arm: 'body' })
  })

  it('nests try, catch and finally, then continues', () => {
    const nodes = [n('tc', 'try_catch'), n('t'), n('c'), n('f'), n('next')]
    const edges = [
      e('tc', 't', 'try'),
      e('tc', 'c', 'catch'),
      e('tc', 'f', 'finally'),
      e('tc', 'next', 'then'),
    ]
    expect(shape(orderSteps(nodes, edges))).toEqual(['tc', '  t', '  c', '  f', 'next'])
  })

  it('nests containers inside containers and rejoins each at its own level', () => {
    const nodes = [
      n('outer', 'branch'),
      n('left', 'parallel'),
      n('l1'),
      n('l2'),
      n('lj'),
      n('right'),
      n('oj'),
    ]
    const edges = [
      e('outer', 'left', 'a'),
      e('outer', 'right', 'b'),
      e('left', 'l1'),
      e('left', 'l2'),
      e('l1', 'lj'),
      e('l2', 'lj'),
      e('lj', 'oj'),
      e('right', 'oj'),
    ]
    expect(shape(orderSteps(nodes, edges))).toEqual([
      'outer',
      '  left',
      '    l1',
      '    l2',
      '  lj',
      '  right',
      'oj',
    ])
  })

  it('treats a branch’s then edge as what runs after it, not as another arm', () => {
    const nodes = [n('s'), n('b', 'branch'), n('y'), n('no'), n('after'), n('end')]
    const edges = [
      e('s', 'b'),
      e('b', 'y', 'yes'),
      e('b', 'no', 'no'),
      e('b', 'after', 'then'),
      e('after', 'end'),
    ]
    const rows = orderSteps(nodes, edges)
    expect(shape(rows)).toEqual(['s', 'b', '  y', '  no', 'after', 'end'])
    // Folding the branch must not hide the rest of the workflow.
    expect(visibleRows(rows, new Set(['b'])).map((r) => r.nodeId)).toEqual([
      's',
      'b',
      'after',
      'end',
    ])
  })

  it.each(['parallel', 'race'])('treats a %s then edge as what runs after it', (type) => {
    const nodes = [n('p', type), n('a'), n('b'), n('after')]
    const edges = [e('p', 'a'), e('p', 'b'), e('p', 'after', 'then')]
    expect(shape(orderSteps(nodes, edges))).toEqual(['p', '  a', '  b', 'after'])
  })

  it('continues after a branch that has only a then edge', () => {
    const rows = orderSteps([n('b', 'branch'), n('after')], [e('b', 'after', 'then')])
    expect(shape(rows)).toEqual(['b', 'after'])
    expect(rows[0]!.container).toBe(false)
  })

  it('follows a loop’s and a try/catch’s then edge at their own level', () => {
    const nodes = [n('l', 'loop'), n('body'), n('t', 'try_catch'), n('tr'), n('ca'), n('end')]
    const edges = [
      e('l', 'body', 'body'),
      e('l', 't', 'then'),
      e('t', 'tr', 'try'),
      e('t', 'ca', 'catch'),
      e('t', 'end', 'then'),
    ]
    expect(shape(orderSteps(nodes, edges))).toEqual(['l', '  body', 't', '  tr', '  ca', 'end'])
  })

  it('puts a join fed by an inner container’s arms and an outer arm at the outer level', () => {
    const nodes = [n('o', 'branch'), n('x'), n('i', 'branch'), n('p'), n('q'), n('J'), n('end')]
    const edges = [
      e('o', 'x', 'a'),
      e('o', 'i', 'b'),
      e('x', 'J'),
      e('i', 'p', 'p'),
      e('i', 'q', 'q'),
      e('p', 'J'),
      e('q', 'J'),
      e('J', 'end'),
    ]
    expect(shape(orderSteps(nodes, edges))).toEqual([
      'o',
      '  x',
      '  i',
      '    p',
      '    q',
      'J',
      'end',
    ])
  })

  it('keeps a join inside the inner container when only its arms feed it', () => {
    const nodes = [n('o', 'branch'), n('i', 'branch'), n('p'), n('q'), n('J'), n('z')]
    const edges = [
      e('o', 'i', 'a'),
      e('o', 'z', 'b'),
      e('i', 'p', 'p'),
      e('i', 'q', 'q'),
      e('p', 'J'),
      e('q', 'J'),
    ]
    expect(shape(orderSteps(nodes, edges))).toEqual(['o', '  i', '    p', '    q', '  J', '  z'])
  })

  it('lists a node nothing leads to last instead of dropping it', () => {
    const rows = orderSteps([n('a'), n('stray', 'step', 0, 99), n('b')], [e('a', 'b')])
    expect(rows.map((r) => r.nodeId)).toEqual(['a', 'b', 'stray'])
  })

  it('breaks ties between several triggers top to bottom', () => {
    const rows = orderSteps([n('low', 'step', 0, 200), n('high', 'step', 0, 10)], [])
    expect(rows.map((r) => r.nodeId)).toEqual(['high', 'low'])
  })

  it('terminates on a cycle', () => {
    const rows = orderSteps([n('a'), n('b')], [e('a', 'b'), e('b', 'a')])
    expect(rows.map((r) => r.nodeId).sort()).toEqual(['a', 'b'])
  })

  it('ignores edges to nodes that are not there', () => {
    expect(orderSteps([n('a')], [e('a', 'gone')]).map((r) => r.nodeId)).toEqual(['a'])
  })

  it('returns nothing for an empty graph', () => {
    expect(orderSteps([], [])).toEqual([])
  })
})

describe('visibleRows', () => {
  const nodes = [n('b', 'branch'), n('x', 'branch'), n('x1'), n('y'), n('after')]
  const edges = [
    e('b', 'x', 'one'),
    e('b', 'y', 'two'),
    e('x', 'x1', 'deep'),
    e('x', 'x2', 'deeper'),
  ]
  const rows = orderSteps(nodes, edges)

  it('shows everything when nothing is folded', () => {
    expect(visibleRows(rows, new Set())).toEqual(rows)
  })

  it('hides a folded container’s whole subtree, not just its children', () => {
    expect(visibleRows(rows, new Set(['b'])).map((r) => r.nodeId)).toEqual(['b', 'after'])
  })

  it('hides only the folded inner container’s contents', () => {
    const shown = visibleRows(rows, new Set(['x'])).map((r) => r.nodeId)
    expect(shown).toContain('x')
    expect(shown).toContain('y')
    expect(shown).not.toContain('x1')
  })
})

describe('orderSteps with prototype-named node types', () => {
  it.each(['constructor', 'toString', '__proto__', 'hasOwnProperty'])(
    'lists a node of type %s as a plain step',
    (type) => {
      const rows = orderSteps([n('a', type), n('b')], [e('a', 'b')])
      expect(rows.map((r) => r.nodeId)).toEqual(['a', 'b'])
    },
  )
})

describe('orderSteps on absurdly nested graphs', () => {
  it('lists every node of a very deeply nested chain without overflowing the stack', () => {
    const depth = 20_000
    const nodes: OrderNode[] = []
    const edges: OrderEdge[] = []
    for (let i = 0; i < depth; i++) {
      nodes.push(n(`l${i}`, 'loop', 0, i))
      if (i > 0) edges.push(e(`l${i - 1}`, `l${i}`, 'body'))
    }
    const rows = orderSteps(nodes, edges)
    expect(rows).toHaveLength(depth)
    expect(new Set(rows.map((r) => r.nodeId)).size).toBe(depth)
  })
})
