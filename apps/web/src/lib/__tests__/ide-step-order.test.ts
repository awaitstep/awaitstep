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
    // The rail reads the walk's continuity, not just the depth.
    expect(rows.find((r) => r.nodeId === 'check')).toMatchObject({ continuesAbove: true })
    expect(rows.find((r) => r.nodeId === 'yes')).toMatchObject({
      arm: 'approved',
      armStart: true,
      continuesAbove: false,
    })
    expect(rows.find((r) => r.nodeId === 'join')).toMatchObject({ continuesAbove: true })
  })

  it('marks an unlabelled arm’s first row even though it has no chip label', () => {
    const rows = orderSteps([n('p', 'parallel'), n('a'), n('b')], [e('p', 'a'), e('p', 'b')])
    expect(rows.map((r) => r.nodeId)).toEqual(['p', 'a', 'b'])
    expect(rows[1]).toMatchObject({ arm: null, armStart: true })
    expect(rows[2]).toMatchObject({ arm: null, armStart: true })
  })

  it('marks a single-arm loop body as an arm start', () => {
    const rows = orderSteps([n('loop', 'loop'), n('body')], [e('loop', 'body', 'body')])
    expect(rows[1]).toMatchObject({ parentId: 'loop', arm: 'body', armStart: true })
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

describe('orderSteps: an arm leading straight into where the other arm ends', () => {
  it('shows the merge inside the wait under the arm that leads to it, and runs it after the other arm too', () => {
    const rows = orderSteps(
      [
        { id: 'sleep', type: 'sleep' },
        { id: 'w', type: 'wait_for_event' },
        { id: 'sunny', type: 'step' },
        { id: 'hello', type: 'custom:hello' },
      ],
      [
        { source: 'sleep', target: 'w' },
        { source: 'w', target: 'sunny', label: 'onEvent' },
        { source: 'w', target: 'hello', label: 'onTimeout' },
        { source: 'sunny', target: 'hello' },
      ],
    )
    expect(rows.map((r) => [r.nodeId, r.depth, r.arm, r.parentId])).toEqual([
      ['sleep', 0, null, null],
      ['w', 0, null, null],
      ['sunny', 1, 'onEvent', 'w'],
      ['hello', 1, 'onTimeout', 'w'],
    ])
    // The event path runs hello after sunny too, as the generated code does.
    expect(rows.find((r) => r.nodeId === 'sunny')?.thenRuns).toEqual(['hello'])
  })
})

describe('orderSteps: a merge with steps after it', () => {
  it('ends the other arm with the whole run the code repeats there', () => {
    const rows = orderSteps(
      [
        { id: 'w', type: 'wait_for_event' },
        { id: 'sunny', type: 'step' },
        { id: 'hello', type: 'custom:hello' },
        { id: 'next', type: 'step' },
      ],
      [
        { source: 'w', target: 'sunny', label: 'onEvent' },
        { source: 'w', target: 'hello', label: 'onTimeout' },
        { source: 'sunny', target: 'hello' },
        { source: 'hello', target: 'next' },
      ],
    )
    expect(rows.map((r) => [r.nodeId, r.depth, r.arm])).toEqual([
      ['w', 0, null],
      ['sunny', 1, 'onEvent'],
      ['hello', 1, 'onTimeout'],
      ['next', 1, null],
    ])
    expect(rows.find((r) => r.nodeId === 'sunny')?.thenRuns).toEqual(['hello', 'next'])
  })
})

describe('orderSteps: merged arms in the order the code runs them', () => {
  it('keeps a branch’s arm that leads straight into the merge in its own place', () => {
    const rows = orderSteps(
      [
        {
          id: 'b',
          type: 'branch',
          data: {
            branches: [
              { label: 'a', condition: 'x' },
              { label: 'b', condition: '' },
            ],
          },
        },
        { id: 'a1', type: 'step' },
        { id: 'j', type: 'step' },
      ],
      [
        { source: 'b', target: 'j', label: 'a' },
        { source: 'b', target: 'a1', label: 'b' },
        { source: 'a1', target: 'j' },
      ],
    )
    expect(rows.map((r) => [r.nodeId, r.depth, r.arm])).toEqual([
      ['b', 0, null],
      ['j', 1, 'a'],
      ['a1', 1, 'b'],
    ])
    expect(rows.find((r) => r.nodeId === 'a1')?.thenRuns).toEqual(['j'])
  })

  it('lists a merge every arm reaches through its own steps under the first arm, and runs it after the others', () => {
    const rows = orderSteps(
      [
        {
          id: 'b',
          type: 'branch',
          data: {
            branches: [
              { label: 'a', condition: 'x' },
              { label: 'b', condition: '' },
            ],
          },
        },
        { id: 'a1', type: 'step' },
        { id: 'b1', type: 'step' },
        { id: 'j', type: 'step' },
        { id: 'end', type: 'step' },
      ],
      [
        { source: 'b', target: 'a1', label: 'a' },
        { source: 'b', target: 'b1', label: 'b' },
        { source: 'a1', target: 'j' },
        { source: 'b1', target: 'j' },
        { source: 'j', target: 'end' },
      ],
    )
    // As workflow.ts runs it: j and end inside arm a after a1, and again after b1.
    expect(rows.map((r) => [r.nodeId, r.depth, r.arm])).toEqual([
      ['b', 0, null],
      ['a1', 1, 'a'],
      ['j', 1, null],
      ['end', 1, null],
      ['b1', 1, 'b'],
    ])
    expect(rows.find((r) => r.nodeId === 'j')?.continuesAbove).toBe(true)
    expect(rows.find((r) => r.nodeId === 'b1')?.thenRuns).toEqual(['j', 'end'])
    expect(rows.find((r) => r.nodeId === 'a1')?.thenRuns).toBeUndefined()
  })

  it('repeats only the chain codegen repeats: a block inside it whose arms meet again runs that meeting point once, after', () => {
    const rows = orderSteps(
      [
        {
          id: 'b',
          type: 'branch',
          data: { branches: [{ label: 'x' }, { label: 'y' }] },
        },
        { id: 'a1', type: 'step' },
        { id: 'b1', type: 'step' },
        { id: 'j', type: 'step' },
        { id: 'p', type: 'parallel' },
        { id: 'p1', type: 'step' },
        { id: 'p2', type: 'step' },
        { id: 'q', type: 'step' },
      ],
      [
        { source: 'b', target: 'a1', label: 'x' },
        { source: 'b', target: 'b1', label: 'y' },
        { source: 'a1', target: 'j' },
        { source: 'b1', target: 'j' },
        { source: 'j', target: 'p' },
        { source: 'p', target: 'p1' },
        { source: 'p', target: 'p2' },
        { source: 'p1', target: 'q' },
        { source: 'p2', target: 'q' },
      ],
    )
    // workflow.ts: each arm runs a1|b1, j, p{p1, p2}; q runs once after the if/else.
    expect(rows.map((r) => [r.nodeId, r.depth])).toEqual([
      ['b', 0],
      ['a1', 1],
      ['j', 1],
      ['p', 1],
      ['p1', 2],
      ['p2', 2],
      ['b1', 1],
      ['q', 0],
    ])
    expect(rows.find((r) => r.nodeId === 'b1')?.thenRuns).toEqual(['j', 'p'])
  })

  it('stops a merge an arm leads straight into where codegen’s chain stops, too', () => {
    const rows = orderSteps(
      [
        {
          id: 'b',
          type: 'branch',
          data: { branches: [{ label: 'x' }, { label: 'y' }] },
        },
        { id: 'b1', type: 'step' },
        { id: 'j', type: 'step' },
        { id: 'p', type: 'parallel' },
        { id: 'p1', type: 'step' },
        { id: 'p2', type: 'step' },
        { id: 'q', type: 'step' },
      ],
      [
        { source: 'b', target: 'j', label: 'x' },
        { source: 'b', target: 'b1', label: 'y' },
        { source: 'b1', target: 'j' },
        { source: 'j', target: 'p' },
        { source: 'p', target: 'p1' },
        { source: 'p', target: 'p2' },
        { source: 'p1', target: 'q' },
        { source: 'p2', target: 'q' },
      ],
    )
    expect(rows.find((r) => r.nodeId === 'q')).toMatchObject({ depth: 0, parentId: null })
    expect(rows.find((r) => r.nodeId === 'b1')?.thenRuns).toEqual(['j', 'p'])
  })

  it('runs the merge only on the branch’s own arms, not under a label that is not one of them', () => {
    const rows = orderSteps(
      [
        {
          id: 'b',
          type: 'branch',
          data: { branches: [{ label: 'x' }, { label: 'y' }] },
        },
        { id: 'z1', type: 'step' },
        { id: 'a1', type: 'step' },
        { id: 'b1', type: 'step' },
        { id: 'j', type: 'step' },
      ],
      [
        { source: 'b', target: 'z1', label: 'old' },
        { source: 'b', target: 'a1', label: 'x' },
        { source: 'b', target: 'b1', label: 'y' },
        { source: 'a1', target: 'j' },
        { source: 'b1', target: 'j' },
      ],
    )
    const order = rows.map((r) => r.nodeId)
    expect(order.indexOf('j')).toBe(order.indexOf('a1') + 1)
    expect(rows.find((r) => r.nodeId === 'z1')?.thenRuns).toBeUndefined()
    expect(rows.find((r) => r.nodeId === 'b1')?.thenRuns).toEqual(['j'])
  })

  it('lists a wait’s merge reached through each arm’s steps the same way', () => {
    const rows = orderSteps(
      [
        { id: 'w', type: 'wait_for_event', data: {} },
        { id: 'got', type: 'step' },
        { id: 'late', type: 'step' },
        { id: 'j', type: 'step' },
      ],
      [
        { source: 'w', target: 'got', label: 'onEvent' },
        { source: 'w', target: 'late', label: 'onTimeout' },
        { source: 'got', target: 'j' },
        { source: 'late', target: 'j' },
      ],
    )
    expect(rows.map((r) => [r.nodeId, r.depth])).toEqual([
      ['w', 0],
      ['got', 1],
      ['j', 1],
      ['late', 1],
    ])
    expect(rows.find((r) => r.nodeId === 'late')?.thenRuns).toEqual(['j'])
  })

  it('gives no shared run when a wait’s field names the merge but no arm goes there', () => {
    const rows = orderSteps(
      [
        { id: 'w', type: 'wait_for_event', data: { onTimeoutNode: 'hello' } },
        { id: 'sunny', type: 'step' },
        { id: 'hello', type: 'step' },
      ],
      [
        { source: 'w', target: 'sunny', label: 'onEvent' },
        { source: 'sunny', target: 'hello' },
      ],
    )
    expect(rows.every((r) => r.thenRuns === undefined)).toBe(true)
  })
})
