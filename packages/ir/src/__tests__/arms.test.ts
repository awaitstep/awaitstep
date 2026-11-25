import { describe, expect, it } from 'vitest'
import {
  armJoins,
  armMergeTargets,
  isArmEdgeOf,
  openArmSlots,
  validateArmsIntoJoins,
  waitArmEdgeOverridden,
  withoutWaitArmTo,
} from '../arms.js'
import { validateIR } from '../validate.js'
import branchingWorkflow from './fixtures/branching-workflow.json'

function node(id: string, type = 'step') {
  return {
    id,
    type,
    name: id,
    position: { x: 0, y: 0 },
    version: '1.0.0',
    provider: 'cloudflare',
    data: type === 'branch' ? { branches: [] } : { code: 'return 1;' },
  }
}

/** A branch whose conditions are the given labels, as its connections name them. */
function withConditions(branch: ReturnType<typeof node>, labels: string[]) {
  return { ...branch, data: { branches: labels.map((label) => ({ label, condition: 'true' })) } }
}

function doc(nodes: ReturnType<typeof node>[], edges: unknown[]) {
  return {
    metadata: {
      name: 'w',
      version: 1,
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
    },
    nodes,
    edges,
    entryNodeId: nodes[0]!.id,
  }
}

describe('isArmEdgeOf', () => {
  it('counts labelled arms for loops, try/catch and waits, and every non-then edge otherwise', () => {
    expect(isArmEdgeOf('loop', 'body')).toBe(true)
    expect(isArmEdgeOf('loop', 'then')).toBe(false)
    expect(isArmEdgeOf('try_catch', 'finally')).toBe(true)
    expect(isArmEdgeOf('wait_for_event', 'onTimeout')).toBe(true)
    expect(isArmEdgeOf('wait_for_event', undefined)).toBe(false)
    expect(isArmEdgeOf('parallel', undefined)).toBe(true)
    expect(isArmEdgeOf('branch', 'then')).toBe(false)
    expect(isArmEdgeOf('step', undefined)).toBe(false)
  })
})

describe('validateArmsIntoJoins', () => {
  it('accepts an arm leading straight into the node the other arms meet at', () => {
    // The generated code runs jj inside each arm: on "a" alone, on "b" after yy.
    const result = validateIR(
      doc(
        [withConditions(node('br', 'branch'), ['a', 'b']), node('yy'), node('jj')],
        [
          { id: 'a', source: 'br', target: 'jj', label: 'a' },
          { id: 'b', source: 'br', target: 'yy', label: 'b' },
          { id: 'yj', source: 'yy', target: 'jj' },
        ],
      ),
    )
    expect(result.ok).toBe(true)
  })

  it('accepts a wait whose timeout leads straight to where its event path ends', () => {
    const errors = validateArmsIntoJoins(
      doc(
        [node('w', 'wait_for_event'), node('sunny'), node('hello')],
        [
          { id: 'e', source: 'w', target: 'sunny', label: 'onEvent' },
          { id: 't', source: 'w', target: 'hello', label: 'onTimeout' },
          { id: 'sh', source: 'sunny', target: 'hello' },
        ],
      ),
    )
    expect(errors).toEqual([])
  })

  it('refuses an arm leading straight into a node another path also reaches', () => {
    const result = validateIR(
      doc(
        [node('start'), node('br', 'branch'), node('yy'), node('jj')],
        [
          { id: 's', source: 'start', target: 'br' },
          { id: 'a', source: 'br', target: 'jj', label: 'a' },
          { id: 'b', source: 'br', target: 'yy', label: 'b' },
          { id: 'yj', source: 'yy', target: 'jj' },
          // A path from outside the block reaches jj too.
          { id: 'sj', source: 'start', target: 'jj' },
        ],
      ),
    )
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.errors).toContainEqual({
      path: 'edges.a',
      message:
        'br’s “a” arm leads straight into jj, which another path also reaches. Add a step to that arm first.',
      nodeId: 'br',
    })
  })

  it('refuses an arm leading into the container’s own way on', () => {
    const errors = validateArmsIntoJoins(
      doc(
        [node('br', 'branch'), node('ss')],
        [
          { id: 'a', source: 'br', target: 'ss', label: 'a' },
          { id: 't', source: 'br', target: 'ss', label: 'then' },
        ],
      ),
    )
    expect(errors.map((e) => e.path)).toEqual(['edges.a'])
  })

  it('accepts arms that merge after a step each, and a then edge into a join', () => {
    expect(
      validateArmsIntoJoins(
        doc(
          [node('br', 'branch'), node('xx'), node('yy'), node('jj'), node('zz')],
          [
            { id: 'a', source: 'br', target: 'xx', label: 'a' },
            { id: 'b', source: 'br', target: 'yy', label: 'b' },
            { id: 'xj', source: 'xx', target: 'jj' },
            { id: 'yj', source: 'yy', target: 'jj' },
            { id: 't', source: 'br', target: 'zz', label: 'then' },
            { id: 'jz', source: 'jj', target: 'zz' },
          ],
        ),
      ),
    ).toEqual([])
  })

  it('reports a container and node once, caps the list, and cuts long labels', () => {
    const fanIn = Array.from({ length: 3 }, (_, i) => ({
      id: `e${i}`,
      source: 'p',
      target: 'jj',
      label: 'x'.repeat(100),
    }))
    const once = validateArmsIntoJoins(doc([node('p', 'parallel'), node('jj')], fanIn))
    expect(once).toHaveLength(1)
    expect(once[0]!.message).toBe(
      `p’s “${'x'.repeat(40)}…” arm leads straight into jj, which another path also reaches. Add a step to that arm first.`,
    )

    const containers = Array.from({ length: 60 }, (_, i) => node(`b${i}`, 'branch'))
    const many = validateArmsIntoJoins(
      doc(
        [...containers, node('jj')],
        containers.map((c) => ({ id: `${c.id}-j`, source: c.id, target: 'jj', label: 'a' })),
      ),
    )
    expect(many).toHaveLength(51)
    expect(many.at(-1)).toEqual({
      path: 'edges',
      message: '10 more arms lead straight into a step another path also reaches.',
    })
  })

  it('accepts the branching fixture', () => {
    expect(
      validateArmsIntoJoins(branchingWorkflow as Parameters<typeof validateArmsIntoJoins>[0]),
    ).toEqual([])
  })
})

describe('openArmSlots', () => {
  const exists = () => true

  it('lists a wait’s missing arms and its way on after them', () => {
    const wait = { type: 'wait_for_event', data: {} }
    expect(openArmSlots(wait, [{ label: 'onEvent' }], exists)).toEqual([
      { label: 'onTimeout' },
      { label: 'then' },
    ])
    expect(
      openArmSlots(wait, [{ label: 'onEvent' }, { label: 'onTimeout' }, { label: 'then' }], exists),
    ).toEqual([])
  })

  it('counts a wait arm chosen in its field as filled, unless the node is gone', () => {
    const wait = { type: 'wait_for_event', data: { onTimeoutNode: 'late' } }
    const filled = [{ label: 'onEvent' }, { label: 'then' }]
    expect(openArmSlots(wait, filled, exists)).toEqual([])
    expect(openArmSlots(wait, filled, () => false)).toEqual([{ label: 'onTimeout' }])
  })

  it('lists a loop’s body and then, and a try/catch’s missing arms in order', () => {
    expect(openArmSlots({ type: 'loop', data: {} }, [], exists)).toEqual([
      { label: 'body' },
      { label: 'then' },
    ])
    expect(
      openArmSlots({ type: 'try_catch', data: {} }, [{ label: 'try' }, { label: 'then' }], exists),
    ).toEqual([{ label: 'catch' }, { label: 'finally' }])
  })

  it('lists each branch condition with no connection, once', () => {
    const branch = {
      type: 'branch',
      data: {
        branches: [
          { label: 'yes', condition: 'a' },
          { label: 'no', condition: '' },
          { label: 'no', condition: '' },
        ],
      },
    }
    expect(openArmSlots(branch, [{ label: 'yes' }], exists)).toEqual([
      { label: 'no' },
      { label: 'then' },
    ])
  })

  it('always offers a parallel or race a new arm', () => {
    expect(
      openArmSlots({ type: 'parallel', data: {} }, [{}, {}, { label: 'then' }], exists),
    ).toEqual([{ label: null }])
    expect(openArmSlots({ type: 'race', data: {} }, [], exists)).toEqual([
      { label: null },
      { label: 'then' },
    ])
  })

  it('gives a plain node nothing', () => {
    expect(openArmSlots({ type: 'step', data: {} }, [], exists)).toEqual([])
  })
})

describe('waitArmEdgeOverridden', () => {
  const exists = () => true
  const wait = { type: 'wait_for_event', data: { onEventNode: 'other' } }

  it('is true only when the field names another node that exists', () => {
    expect(waitArmEdgeOverridden(wait, { label: 'onEvent', target: 's' }, exists)).toBe(true)
    expect(waitArmEdgeOverridden(wait, { label: 'onEvent', target: 'other' }, exists)).toBe(false)
    expect(waitArmEdgeOverridden(wait, { label: 'onEvent', target: 's' }, () => false)).toBe(false)
    expect(waitArmEdgeOverridden(wait, { label: 'onTimeout', target: 's' }, exists)).toBe(false)
    expect(
      waitArmEdgeOverridden({ type: 'loop', data: {} }, { label: 'body', target: 's' }, exists),
    ).toBe(false)
  })
})

describe('withoutWaitArmTo', () => {
  const wait = { type: 'wait_for_event', data: { onEventNode: 'x', onTimeoutNode: 'x' } }

  it('clears every field naming the node, or only the arm given', () => {
    expect(withoutWaitArmTo(wait, 'x').data).toEqual({ onEventNode: '', onTimeoutNode: '' })
    expect(withoutWaitArmTo(wait, 'x', 'onTimeout').data).toEqual({
      onEventNode: 'x',
      onTimeoutNode: '',
    })
  })

  it('returns the same node when nothing names it', () => {
    expect(withoutWaitArmTo(wait, 'y')).toBe(wait)
    const step = { type: 'step', data: {} }
    expect(withoutWaitArmTo(step, 'x')).toBe(step)
  })
})

describe('validateArmsIntoJoins: merges judged the way codegen follows arms', () => {
  it('refuses a merge one arm reaches only through a block’s body: codegen would skip it there', () => {
    const errors = validateArmsIntoJoins(
      doc(
        [node('gate', 'branch'), node('loop', 'loop'), node('inner'), node('join')],
        [
          { id: 'y', source: 'gate', target: 'join', label: 'yes' },
          { id: 'n', source: 'gate', target: 'loop', label: 'no' },
          { id: 'b', source: 'loop', target: 'inner', label: 'body' },
          { id: 'ij', source: 'inner', target: 'join' },
        ],
      ),
    )
    expect(errors.map((e) => e.path)).toEqual(['edges.y'])
  })

  it('accepts a merge one arm reaches through a block’s way on', () => {
    const errors = validateArmsIntoJoins(
      doc(
        [
          withConditions(node('gate', 'branch'), ['yes', 'no']),
          node('loop', 'loop'),
          node('inner'),
          node('join'),
        ],
        [
          { id: 'y', source: 'gate', target: 'join', label: 'yes' },
          { id: 'n', source: 'gate', target: 'loop', label: 'no' },
          { id: 'b', source: 'loop', target: 'inner', label: 'body' },
          { id: 't', source: 'loop', target: 'join', label: 'then' },
        ],
      ),
    )
    expect(errors).toEqual([])
  })

  it('reads a wait’s arms from its fields first, as codegen does', () => {
    const wait = { ...node('w', 'wait_for_event'), data: { onEventNode: 'x' } }
    const errors = validateArmsIntoJoins(
      doc(
        [wait as ReturnType<typeof node>, node('x'), node('a'), node('j')],
        [
          { id: 'e', source: 'w', target: 'j', label: 'onEvent' },
          { id: 't', source: 'w', target: 'a', label: 'onTimeout' },
          { id: 'aj', source: 'a', target: 'j' },
        ],
      ),
    )
    expect(errors.map((e) => e.path)).toEqual(['edges.e'])
  })

  it('stays linear on many branches sharing one long chain', () => {
    // Gates times chain would be quadratic. Compared with a quarter of the
    // graph, not against a clock: four times the graph takes about four times
    // as long when linear, sixteen when quadratic, however fast the machine.
    const graph = (scale: number) => {
      const chain = Array.from({ length: 250 * scale }, (_, i) => node(`c${i}`))
      const chainEdges = chain
        .slice(1)
        .map((n, i) => ({ id: `ce${i}`, source: `c${i}`, target: n.id }))
      const gates = Array.from({ length: 150 * scale }, (_, i) => node(`g${i}`, 'branch'))
      const joins = Array.from({ length: 20 }, (_, i) => node(`j${i}`))
      const gateEdges = gates.flatMap((g, i) => [
        { id: `a${i}`, source: g.id, target: 'c0', label: 'a' },
        ...joins.map((j, k) => ({ id: `b${i}-${k}`, source: g.id, target: j.id, label: `b${k}` })),
      ])
      return doc([...gates, ...chain, ...joins], [...chainEdges, ...gateEdges])
    }
    // The fastest of a few runs, so a pause of the machine does not count.
    const fastest = (ir: ReturnType<typeof graph>) => {
      let best = Infinity
      for (let run = 0; run < 5; run++) {
        const started = performance.now()
        validateArmsIntoJoins(ir)
        best = Math.min(best, performance.now() - started)
      }
      return best
    }
    const small = graph(1)
    const large = graph(4)
    validateArmsIntoJoins(small)
    expect(fastest(large) / fastest(small)).toBeLessThan(8)
  })
})

describe('armMergeTargets', () => {
  it('names the node a wait’s arms meet at, one arm leading straight there', () => {
    const merges = armMergeTargets(
      [
        { id: 'w', type: 'wait_for_event' },
        { id: 's', type: 'step' },
        { id: 'h', type: 'step' },
      ],
      [
        { source: 'w', target: 's', label: 'onEvent' },
        { source: 'w', target: 'h', label: 'onTimeout' },
        { source: 's', target: 'h' },
      ],
    )
    expect([...merges]).toEqual([['w', 'h']])
  })

  it('reads a large graph in one pass', () => {
    const gates = Array.from({ length: 2700 }, (_, i) => ({ id: `g${i}`, type: 'branch' }))
    const edges = gates.map((g, i) => ({ source: g.id, target: `t${i}`, label: 'yes' }))
    const targets = gates.map((_, i) => ({ id: `t${i}`, type: 'step' }))
    const started = performance.now()
    armMergeTargets([...gates, ...targets], edges)
    expect(performance.now() - started).toBeLessThan(200)
  })
})

describe('validateArmsIntoJoins: a wait arm set by its field alone', () => {
  // Choose: a → Wait (onEventNode: j, no onEvent connection; onTimeout → y → j), b → aa → j.
  function graph(onEventEdge: boolean) {
    const wait = node('w', 'wait_for_event')
    wait.data = { eventType: 'x', timeout: '30 seconds', onEventNode: 'j' }
    return doc(
      [withConditions(node('b0', 'branch'), ['a', 'b']), wait, node('y'), node('aa'), node('j')],
      [
        { id: '2', source: 'b0', target: 'w', label: 'a' },
        { id: '3', source: 'b0', target: 'aa', label: 'b' },
        ...(onEventEdge ? [{ id: '7', source: 'w', target: 'j', label: 'onEvent' }] : []),
        { id: '4', source: 'w', target: 'y', label: 'onTimeout' },
        { id: '5', source: 'y', target: 'j' },
        { id: '6', source: 'aa', target: 'j' },
      ],
    )
  }

  it('refuses it when another path reaches its node too, as with a connection', () => {
    const withField = validateArmsIntoJoins(graph(false))
    const withEdge = validateArmsIntoJoins(graph(true))
    expect(withEdge).toHaveLength(1)
    expect(withField).toHaveLength(1)
    expect(withField[0]!.path).toBe('nodes.w.data.onEventNode')
    expect(withField[0]!.message).toContain('leads straight into')
  })
})

describe('armJoins', () => {
  const branch = {
    id: 'b',
    type: 'branch',
    data: { branches: [{ label: 'a' }, { label: 'b' }] },
  }

  it('finds a join each arm reaches through its own steps, and one an arm leads straight into', () => {
    const through = armJoins(
      [branch, { id: 'a1', type: 'step' }, { id: 'b1', type: 'step' }, { id: 'j', type: 'step' }],
      [
        { source: 'b', target: 'a1', label: 'a' },
        { source: 'b', target: 'b1', label: 'b' },
        { source: 'a1', target: 'j' },
        { source: 'b1', target: 'j' },
      ],
    )
    expect(through.get('b')).toEqual({ join: 'j', straight: false })
    const straight = armJoins(
      [branch, { id: 'a1', type: 'step' }, { id: 'j', type: 'step' }],
      [
        { source: 'b', target: 'j', label: 'a' },
        { source: 'b', target: 'a1', label: 'b' },
        { source: 'a1', target: 'j' },
      ],
    )
    expect(straight.get('b')).toEqual({ join: 'j', straight: true })
  })

  it('finds none when the arms never meet', () => {
    const joins = armJoins(
      [branch, { id: 'a1', type: 'step' }, { id: 'b1', type: 'step' }],
      [
        { source: 'b', target: 'a1', label: 'a' },
        { source: 'b', target: 'b1', label: 'b' },
      ],
    )
    expect(joins.size).toBe(0)
  })
})
