import { describe, expect, it } from 'vitest'
import type { ArtifactIR, WorkflowNode } from '@awaitstep/ir'
import { insertStep } from '@awaitstep/codegen'
import { orderSteps, type StepRow } from '../ide/step-order'
import {
  appendsAfter,
  isArmEdge,
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
      trigger: { type: 'http' },
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
