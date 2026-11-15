import { describe, expect, it } from 'vitest'
import type { ArtifactIR, WorkflowNode } from '@awaitstep/ir'
import { insertStep } from '@awaitstep/codegen'
import { orderSteps, type StepRow } from '../ide/step-order'
import {
  appendsAfter,
  isArmEdge,
  openSlotsFor,
  placementChoices,
  type PlacementEdge,
} from '../ide/step-placements'

function node(id: string, name: string, type = 'step'): WorkflowNode {
  return { id, type, name, version: '1.0.0', provider: 'cloudflare', data: {} }
}

function graph(
  nodes: WorkflowNode[],
  edges: PlacementEdge[],
): { rows: StepRow[]; nodes: ReadonlyMap<string, WorkflowNode>; edges: PlacementEdge[] } {
  const rows = orderSteps(
    nodes.map((n, i) => ({ id: n.id, type: n.type, position: { x: 0, y: i * 80 } })),
    edges,
  )
  return { rows, nodes: new Map(nodes.map((n) => [n.id, n])), edges }
}

describe('placementChoices', () => {
  it('offers the first step when the graph has no nodes', () => {
    expect(placementChoices([], new Map(), [])).toEqual([
      {
        placement: { first: true },
        label: 'Before the first step',
        nodeId: null,
        nodeName: null,
        nodeType: null,
      },
    ])
  })

  it('offers one “after” per node in graph order', () => {
    const g = graph(
      [node('a', 'Fetch user'), node('b', 'Charge card'), node('c', 'Send mail')],
      [
        { id: 'e1', source: 'a', target: 'b' },
        { id: 'e2', source: 'b', target: 'c' },
      ],
    )
    const choices = placementChoices(g.rows, g.nodes, g.edges)
    expect(choices.map((c) => [c.label, c.placement])).toEqual([
      ['After Fetch user', { after: 'a' }],
      ['After Charge card', { after: 'b' }],
      ['After Send mail', { after: 'c' }],
    ])
    expect(choices.map((c) => c.nodeType)).toEqual(['step', 'step', 'step'])
  })

  it('lists one choice per connection for a branch, by label', () => {
    const g = graph(
      [node('gate', 'Paid?', 'branch'), node('x', 'Ship'), node('y', 'Wait')],
      [
        { id: 'yes', source: 'gate', target: 'x', label: 'paid' },
        { id: 'no', source: 'gate', target: 'y', label: 'late' },
      ],
    )
    const choices = placementChoices(g.rows, g.nodes, g.edges)
    expect(choices.filter((c) => c.nodeId === 'gate')).toEqual([
      {
        placement: { after: 'gate', edgeId: 'yes' },
        label: 'Into paid',
        nodeId: 'gate',
        nodeName: 'Paid?',
        nodeType: 'branch',
      },
      {
        placement: { after: 'gate', edgeId: 'no' },
        label: 'Into late',
        nodeId: 'gate',
        nodeName: 'Paid?',
        nodeType: 'branch',
      },
      {
        placement: { after: 'gate', arm: 'then' },
        label: 'After Paid?',
        nodeId: 'gate',
        nodeName: 'Paid?',
        nodeType: 'branch',
      },
    ])
  })

  it('names an unlabelled connection by the node it leads to', () => {
    const g = graph(
      [node('gate', 'Race', 'parallel'), node('x', 'First'), node('y', 'Second')],
      [
        { id: 'e1', source: 'gate', target: 'x' },
        { id: 'e2', source: 'gate', target: 'y' },
      ],
    )
    const choices = placementChoices(g.rows, g.nodes, g.edges)
    expect(choices.filter((c) => c.nodeId === 'gate').map((c) => c.label)).toEqual([
      'Before First',
      'Before Second',
      'New arm of Race',
      'After Race',
    ])
  })

  it('offers a wait’s empty arm, filled by an edge or by its field', () => {
    const wait = {
      ...node('w', 'Wait', 'wait_for_event'),
      data: { onTimeoutNode: 'late' },
    }
    const g = graph(
      [wait, node('s', 'Sunny'), node('late', 'Late')],
      [{ id: 'e1', source: 'w', target: 's', label: 'onEvent' }],
    )
    expect(
      placementChoices(g.rows, g.nodes, g.edges).filter((c) => c.nodeId === 'w'),
    ).toMatchObject([
      { placement: { after: 'w', edgeId: 'e1' }, label: 'Into onEvent' },
      { placement: { after: 'w', arm: 'then' }, label: 'After Wait' },
    ])
    const empty = graph(
      [node('w', 'Wait', 'wait_for_event'), node('s', 'Sunny')],
      [{ id: 'e1', source: 'w', target: 's', label: 'onEvent' }],
    )
    expect(
      placementChoices(empty.rows, empty.nodes, empty.edges)
        .filter((c) => c.nodeId === 'w')
        .map((c) => [c.label, c.placement]),
    ).toEqual([
      ['Into onEvent', { after: 'w', edgeId: 'e1' }],
      ['Into onTimeout', { after: 'w', arm: 'onTimeout' }],
      ['After Wait', { after: 'w', arm: 'then' }],
    ])
  })

  it('offers no after for a branch or wait whose arms already meet', () => {
    const branch = {
      ...node('g', 'Gate', 'branch'),
      data: {
        branches: [
          { label: 'yes', condition: 'a' },
          { label: 'no', condition: '' },
        ],
      },
    }
    const g = graph(
      [branch, node('x', 'X'), node('y', 'Y'), node('j', 'Join')],
      [
        { id: 'e1', source: 'g', target: 'x', label: 'yes' },
        { id: 'e2', source: 'g', target: 'y', label: 'no' },
        { id: 'e3', source: 'x', target: 'j' },
        { id: 'e4', source: 'y', target: 'j' },
      ],
    )
    const labels = placementChoices(g.rows, g.nodes, g.edges).map((c) => c.label)
    expect(labels).not.toContain('After Gate')
    expect(labels).toContain('After Join')
    const wait = {
      ...node('w', 'Wait', 'wait_for_event'),
      data: { onEventNode: 'x', onTimeoutNode: 'y' },
    }
    const w = graph(
      [wait, node('x', 'X'), node('y', 'Y'), node('j', 'Join')],
      [
        { id: 'e1', source: 'w', target: 'x', label: 'onEvent' },
        { id: 'e2', source: 'w', target: 'y', label: 'onTimeout' },
        { id: 'e3', source: 'x', target: 'j' },
        { id: 'e4', source: 'y', target: 'j' },
      ],
    )
    expect(placementChoices(w.rows, w.nodes, w.edges).map((c) => c.label)).not.toContain(
      'After Wait',
    )
  })

  it('still offers a parallel whose arms meet an after: its code runs the join after the block', () => {
    const g = graph(
      [node('p', 'Fan', 'parallel'), node('x', 'X'), node('y', 'Y'), node('j', 'Join')],
      [
        { id: 'e1', source: 'p', target: 'x' },
        { id: 'e2', source: 'p', target: 'y' },
        { id: 'e3', source: 'x', target: 'j' },
        { id: 'e4', source: 'y', target: 'j' },
      ],
    )
    expect(placementChoices(g.rows, g.nodes, g.edges).map((c) => c.label)).toContain('After Fan')
  })

  it('stays fast on a graph with a hub of many connections and several waits', () => {
    const hub = node('hub', 'Hub')
    const leaves = Array.from({ length: 20_000 }, (_, i) => node(`l${i}`, `L${i}`))
    const waits = Array.from({ length: 5 }, (_, i) => ({
      ...node(`w${i}`, `Wait ${i}`, 'wait_for_event'),
      data: { onEventNode: 'hub', onTimeoutNode: 'l0' },
    }))
    const edges: PlacementEdge[] = [
      ...leaves.map((leaf, i) => ({ id: `h${i}`, source: 'hub', target: leaf.id })),
      ...waits.flatMap((w, i) => [
        { id: `we${i}`, source: w.id, target: 'hub', label: 'onEvent' },
        { id: `wt${i}`, source: w.id, target: 'l0', label: 'onTimeout' },
      ]),
    ]
    const all = [...waits, hub, ...leaves]
    const nodes = new Map(all.map((n) => [n.id, n]))
    const started = performance.now()
    for (const w of waits) {
      openSlotsFor(
        w,
        edges.filter((e) => e.source === w.id),
        edges,
        (id) => nodes.has(id),
      )
    }
    expect(performance.now() - started).toBeLessThan(1000)
  })

  it('offers no splice on a wait arm its field sends elsewhere', () => {
    const wait = { ...node('w', 'Wait', 'wait_for_event'), data: { onEventNode: 'other' } }
    const g = graph(
      [wait, node('s', 'Sunny'), node('other', 'Other')],
      [{ id: 'e1', source: 'w', target: 's', label: 'onEvent' }],
    )
    const placements = placementChoices(g.rows, g.nodes, g.edges).map((c) => c.placement)
    expect(placements).not.toContainEqual({ after: 'w', edgeId: 'e1' })
  })

  it('offers an empty loop its body and its way on, never a plain after', () => {
    const g = graph([node('loop', 'Loop', 'loop')], [])
    expect(placementChoices(g.rows, g.nodes, g.edges).map((c) => [c.label, c.placement])).toEqual([
      ['Into body', { after: 'loop', arm: 'body' }],
      ['After Loop', { after: 'loop', arm: 'then' }],
    ])
  })

  it('appends after a step with a single plain connection', () => {
    const g = graph([node('a', 'A'), node('b', 'B')], [{ id: 'e1', source: 'a', target: 'b' }])
    const choices = placementChoices(g.rows, g.nodes, g.edges)
    expect(choices.find((c) => c.nodeId === 'a')).toMatchObject({
      label: 'After A',
      placement: { after: 'a' },
    })
  })

  it('puts a step into a loop’s only body, not after the loop', () => {
    // A loop at the end of a chain legitimately has only its body edge.
    const g = graph(
      [node('loop', 'Loop', 'loop'), node('body', 'Body')],
      [{ id: 'body', source: 'loop', target: 'body', label: 'body' }],
    )
    const choices = placementChoices(g.rows, g.nodes, g.edges)
    expect(choices.find((c) => c.nodeId === 'loop')).toMatchObject({
      label: 'Into body',
      placement: { after: 'loop', edgeId: 'body' },
    })
  })

  it('names a single unlabelled arm by the node it leads to', () => {
    const g = graph(
      [node('p', 'Parallel', 'parallel'), node('x', 'X')],
      [{ id: 'e1', source: 'p', target: 'x' }],
    )
    const choices = placementChoices(g.rows, g.nodes, g.edges)
    expect(choices.find((c) => c.nodeId === 'p')).toMatchObject({
      label: 'Before X',
      placement: { after: 'p', edgeId: 'e1' },
    })
  })

  it('leaves out a connection id shared by two edges', () => {
    const g = graph(
      [node('a', 'A'), node('b', 'B'), node('c', 'C'), node('d', 'D')],
      [
        { id: 'dup', source: 'a', target: 'b' },
        { id: 'dup', source: 'a', target: 'c' },
        { id: 'e', source: 'd', target: 'b' },
      ],
    )
    const choices = placementChoices(g.rows, g.nodes, g.edges)
    // "A" has one outgoing edge (the first `dup`) but its id is shared, so
    // no safe insertion point is offered there.
    expect(choices.some((c) => c.nodeId === 'a')).toBe(false)
    expect(choices.some((c) => c.nodeId === 'd')).toBe(true)
  })
})

describe('isArmEdge', () => {
  it.each([
    ['loop', 'body', true],
    ['loop', 'then', false],
    ['try_catch', 'try', true],
    ['try_catch', 'catch', true],
    ['try_catch', 'finally', true],
    ['try_catch', 'then', false],
    ['branch', 'paid', true],
    ['branch', undefined, true],
    ['branch', 'then', false],
    ['parallel', undefined, true],
    ['race', 'then', false],
    ['step', 'body', false],
  ] as const)('%s + %s → %s', (type, label, arm) => {
    expect(isArmEdge({ type }, label === undefined ? {} : { label })).toBe(arm)
  })
})

describe('appendsAfter', () => {
  const edges: PlacementEdge[] = [{ id: 'e1', source: 'a', target: 'b' }]
  const counts = (list: readonly PlacementEdge[]) => {
    const map = new Map<string, number>()
    for (const edge of list) map.set(edge.id, (map.get(edge.id) ?? 0) + 1)
    return map
  }

  it('appends when nothing or one plain connection follows', () => {
    expect(appendsAfter({ type: 'step' }, [], counts([]))).toBe(true)
    expect(appendsAfter({ type: 'step' }, edges, counts(edges))).toBe(true)
  })

  it('needs an explicit edge for an arm, a fan-out or a shared id', () => {
    const arm: PlacementEdge = { id: 'body', source: 'a', target: 'b', label: 'body' }
    expect(appendsAfter({ type: 'loop' }, [arm], counts([arm]))).toBe(false)
    const fanOut = edges.concat(edges)
    expect(appendsAfter({ type: 'branch' }, fanOut, counts(fanOut))).toBe(false)
    const shared: PlacementEdge[] = [edges[0]!, { ...edges[0]!, target: 'c' }]
    expect(appendsAfter({ type: 'step' }, [edges[0]!], counts(shared))).toBe(false)
  })
})

describe('placementChoices × insertStep', () => {
  it('every choice is accepted by the graph edit', () => {
    const nodes = [
      node('a', 'A'),
      node('b', 'B'),
      node('gate', 'Gate', 'branch'),
      node('x', 'X'),
      node('y', 'Y'),
      node('loop', 'Loop', 'loop'),
      node('body', 'Body'),
      node('p', 'Parallel', 'parallel'),
      node('u', 'U'),
      node('v', 'V'),
    ]
    const edges: PlacementEdge[] = [
      { id: 'e1', source: 'a', target: 'b' },
      { id: 'gx', source: 'gate', target: 'x', label: 'paid' },
      { id: 'gy', source: 'gate', target: 'y', label: 'late' },
      { id: 'lb', source: 'loop', target: 'body', label: 'body' },
      { id: 'pu', source: 'p', target: 'u' },
      { id: 'pv', source: 'p', target: 'v' },
    ]
    const g = graph(nodes, edges)
    const ir: ArtifactIR = {
      kind: 'workflow',
      metadata: { name: 'orders', version: 1, createdAt: 't', updatedAt: 't' },
      nodes: nodes.map((n, i) => ({ ...n, position: { x: 0, y: i * 80 } })),
      edges,
      entryNodeId: 'a',
    }
    const choices = placementChoices(g.rows, g.nodes, g.edges)
    expect(choices.length).toBeGreaterThan(0)
    for (const choice of choices) {
      expect(insertStep(ir, choice.placement, { id: 'new', name: 'New step' })).toMatchObject({
        ok: true,
      })
    }
  })
})
