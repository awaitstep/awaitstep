import { describe, it, expect } from 'vitest'
import type { WorkflowIR } from '@awaitstep/ir'
import {
  topologicalSort,
  buildAdjacencyList,
  upstreamVarNames,
  upstreamVarNamesOf,
  containerArms,
  blockChain,
} from '../dag.js'
import { GenerateInputError } from '../errors.js'
import simpleWorkflow from './fixtures/simple-workflow.json'

describe('topologicalSort', () => {
  it('returns nodes in dependency order', () => {
    const sorted = topologicalSort(simpleWorkflow as unknown as WorkflowIR)
    const ids = sorted.map((n) => n.id)
    expect(ids.indexOf('step-1')).toBeLessThan(ids.indexOf('sleep-1'))
    expect(ids.indexOf('sleep-1')).toBeLessThan(ids.indexOf('step-2'))
  })

  it('throws on cyclic graph', () => {
    const cyclic: WorkflowIR = {
      metadata: {
        name: 'cyclic',
        version: 1,
        createdAt: '',
        updatedAt: '',
      },
      nodes: [
        { id: 'a', type: 'step', name: 'A', position: { x: 0, y: 0 }, code: '1' },
        { id: 'b', type: 'step', name: 'B', position: { x: 0, y: 0 }, code: '2' },
      ],
      edges: [
        { id: 'e1', source: 'a', target: 'b' },
        { id: 'e2', source: 'b', target: 'a' },
      ],
      entryNodeId: 'a',
    }
    expect(() => topologicalSort(cyclic)).toThrow('cycle')
    // A fact about the workflow, not a generator malfunction: a caller
    // whose job is reporting answers it with a diagnostic, and rethrows
    // anything that is not marked this way.
    expect(() => topologicalSort(cyclic)).toThrow(GenerateInputError)
  })
})

describe('buildAdjacencyList', () => {
  it('builds correct adjacency list', () => {
    const adj = buildAdjacencyList(simpleWorkflow as unknown as WorkflowIR)
    expect(adj.get('step-1')).toEqual(['sleep-1'])
    expect(adj.get('sleep-1')).toEqual(['step-2'])
    expect(adj.get('step-2')).toEqual([])
  })
})

describe('upstreamVarNames', () => {
  const node = (
    id: string,
    type = 'step',
    data: Record<string, unknown> = {},
  ): WorkflowIR['nodes'][0] => ({
    id,
    type,
    name: id,
    position: { x: 0, y: 0 },
    version: '1.0.0',
    provider: 'cloudflare',
    data,
  })
  const ir = (nodes: WorkflowIR['nodes'], edges: WorkflowIR['edges']): WorkflowIR =>
    ({
      irVersion: 1,
      metadata: { name: 'w', version: 1, createdAt: '', updatedAt: '' },
      nodes,
      edges,
      entryNodeId: nodes[0]!.id,
    }) as unknown as WorkflowIR
  const names = (...ids: string[]) => new Map(ids.map((id) => [id, id]))
  const never = () => false
  const returned = (n: { data: Record<string, unknown> }) => n.data.export === true

  it('lists the earlier nodes at the same level, in run order', () => {
    const graph = ir(
      [node('a'), node('b'), node('c')],
      [
        { id: 'e1', source: 'a', target: 'b' },
        { id: 'e2', source: 'b', target: 'c' },
      ],
    )
    const up = upstreamVarNames(graph, names('a', 'b', 'c'), never)
    expect(up.get('a')).toEqual([])
    expect(up.get('c')).toEqual(['a', 'b'])
    expect(upstreamVarNamesOf(graph, names('a', 'b', 'c'), never, 'c')).toEqual(['a', 'b'])
    expect(upstreamVarNamesOf(graph, names('a', 'b', 'c'), never, 'missing')).toEqual([])
  })

  it('shows a child of a container what came before the container, and its earlier siblings', () => {
    const graph = ir(
      [node('first'), node('gate', 'branch'), node('x'), node('y')],
      [
        { id: 'e0', source: 'first', target: 'gate' },
        { id: 'e1', source: 'gate', target: 'x', label: 'yes' },
        { id: 'e2', source: 'x', target: 'y' },
      ],
    )
    const up = upstreamVarNames(graph, names('first', 'gate', 'x', 'y'), never)
    // The container itself has no value inside its own arms.
    expect(up.get('y')).toEqual(['first', 'x'])
  })

  it('keeps a block’s plain child out of the `then` continuation and out of a sibling arm', () => {
    const graph = ir(
      [node('gate', 'branch'), node('x'), node('other'), node('after')],
      [
        { id: 'e1', source: 'gate', target: 'x', label: 'yes' },
        { id: 'e2', source: 'gate', target: 'other', label: 'no' },
        { id: 'e3', source: 'gate', target: 'after', label: 'then' },
      ],
    )
    const up = upstreamVarNames(graph, names('gate', 'x', 'other', 'after'), never)
    expect(up.get('after')).toEqual(['gate'])
    expect(up.get('other')).toEqual([])
  })

  it('treats the node two arms join into as the container’s continuation', () => {
    const graph = ir(
      [node('first'), node('gate', 'branch'), node('x'), node('other'), node('joined')],
      [
        { id: 'e0', source: 'first', target: 'gate' },
        { id: 'e1', source: 'gate', target: 'x', label: 'yes' },
        { id: 'e2', source: 'gate', target: 'other', label: 'no' },
        { id: 'e3', source: 'x', target: 'joined' },
        { id: 'e4', source: 'other', target: 'joined' },
      ],
    )
    const up = upstreamVarNames(graph, names('first', 'gate', 'x', 'other', 'joined'), never)
    expect(up.get('joined')).toEqual(['first', 'gate'])
    expect(up.get('x')).toEqual(['first'])
  })

  it('treats a join as top level however deep its container, as the emitter does', () => {
    // O's arm A holds a0 and a nested branch X whose arms x1, x2 join at J.
    const graph = ir(
      [
        node('start'),
        node('O', 'branch'),
        node('a0'),
        node('X', 'branch'),
        node('x1'),
        node('x2'),
        node('J'),
        node('T'),
      ],
      [
        { id: 'e0', source: 'start', target: 'O' },
        { id: 'e1', source: 'O', target: 'a0', label: 'A' },
        { id: 'e2', source: 'a0', target: 'X' },
        { id: 'e3', source: 'X', target: 'x1', label: 'p' },
        { id: 'e4', source: 'X', target: 'x2', label: 'q' },
        { id: 'e5', source: 'x1', target: 'J' },
        { id: 'e6', source: 'x2', target: 'J' },
        { id: 'e7', source: 'O', target: 'T', label: 'then' },
      ],
    )
    const up = upstreamVarNames(graph, names('start', 'O', 'a0', 'X', 'x1', 'x2', 'J', 'T'), never)
    // J runs at the top level: it reads start, O and the `then` step T (emitted
    // before it, as the sort has them), not a0 inside the arm.
    expect(up.get('J')).toEqual(['start', 'O', 'T'])
    expect(up.get('T')).toEqual(['start', 'O'])
  })

  it('gives a join the same scope whichever edge comes first', () => {
    const nodes = () => [
      node('B', 'branch'),
      node('a1'),
      node('n1'),
      node('a2'),
      node('m'),
      node('X', 'branch'),
      node('y'),
      node('J'),
    ]
    const edges = [
      { id: 'e1', source: 'B', target: 'a1', label: 'p' },
      { id: 'e2', source: 'a1', target: 'n1' },
      { id: 'e3', source: 'B', target: 'a2', label: 'q' },
      { id: 'e4', source: 'a2', target: 'm' },
      { id: 'e5', source: 'm', target: 'X' },
      { id: 'e6', source: 'X', target: 'y', label: 'r' },
      { id: 'e7', source: 'n1', target: 'J' },
      { id: 'e8', source: 'y', target: 'J' },
    ]
    const all = names('B', 'a1', 'n1', 'a2', 'm', 'X', 'y', 'J')
    const shallowFirst = upstreamVarNames(ir(nodes(), edges), all, never).get('J')
    const deepFirst = upstreamVarNames(ir(nodes(), [...edges].reverse()), all, never).get('J')
    expect(shallowFirst).toEqual(['B'])
    expect(deepFirst).toEqual(shallowFirst)
  })

  it('puts the successors of a plain fan-out at the top level, where the emitter puts them', () => {
    const graph = ir(
      [node('a'), node('b'), node('c')],
      [
        { id: 'e1', source: 'a', target: 'b' },
        { id: 'e2', source: 'a', target: 'c' },
      ],
    )
    const up = upstreamVarNames(graph, names('a', 'b', 'c'), never)
    expect(up.get('b')).toEqual(['a'])
    expect(up.get('c')).toEqual(['a', 'b'])
  })

  it('keeps unlabelled parallel arms apart from each other', () => {
    const graph = ir(
      [node('P', 'parallel'), node('a'), node('a2'), node('b'), node('b2')],
      [
        { id: 'e1', source: 'P', target: 'a' },
        { id: 'e2', source: 'a', target: 'a2' },
        { id: 'e3', source: 'P', target: 'b' },
        { id: 'e4', source: 'b', target: 'b2' },
      ],
    )
    const up = upstreamVarNames(graph, names('P', 'a', 'a2', 'b', 'b2'), never)
    expect(up.get('b')).toEqual([])
    expect(up.get('b2')).toEqual(['b'])
    expect(up.get('a2')).toEqual(['a'])
  })

  it('lets a hoisted child reach a `then` continuation even when the sort puts the continuation first', () => {
    const graph = ir(
      [
        node('gate', 'branch'),
        node('inner'),
        node('shared', 'step', { export: true }),
        node('after'),
      ],
      [
        { id: 'e1', source: 'gate', target: 'inner', label: 'yes' },
        { id: 'e2', source: 'inner', target: 'shared' },
        { id: 'e3', source: 'gate', target: 'after', label: 'then' },
      ],
    )
    // Breadth-first, `after` sorts before `shared`; the block still runs first.
    expect(topologicalSort(graph).map((n) => n.id)).toEqual(['gate', 'inner', 'after', 'shared'])
    const up = upstreamVarNames(graph, names('gate', 'inner', 'shared', 'after'), returned)
    expect(up.get('after')).toEqual(['gate', 'shared'])
    expect(
      upstreamVarNames(graph, names('gate', 'inner', 'shared', 'after'), never).get('after'),
    ).toEqual(['gate'])
  })
})

describe('containerArms and the scope on graphs with unreachable parts', () => {
  const node = (id: string, type = 'step'): WorkflowIR['nodes'][0] => ({
    id,
    type,
    name: id,
    position: { x: 0, y: 0 },
    version: '1.0.0',
    provider: 'cloudflare',
    data: {},
  })
  const ir = (nodes: WorkflowIR['nodes'], edges: WorkflowIR['edges']): WorkflowIR =>
    ({
      irVersion: 1,
      metadata: { name: 'w', version: 1, createdAt: '', updatedAt: '' },
      nodes,
      edges,
      entryNodeId: nodes[0]!.id,
    }) as unknown as WorkflowIR
  const names = (...ids: string[]) => new Map(ids.map((id) => [id, id]))

  it('ignores a loop that cycles through itself off the reachable graph, instead of spinning', () => {
    // entry → L(loop) –body→ B; U(loop) –body→ S → U is a cycle nothing reaches.
    const graph = ir(
      [node('entry'), node('L', 'loop'), node('B'), node('U', 'loop'), node('S')],
      [
        { id: 'e1', source: 'entry', target: 'L' },
        { id: 'e2', source: 'L', target: 'B', label: 'body' },
        { id: 'e3', source: 'U', target: 'S', label: 'body' },
        { id: 'e4', source: 'S', target: 'U' },
      ],
    )
    const arms = containerArms(graph)
    expect(arms.get('B')).toEqual({ owner: 'L', arm: 'B' })
    expect(arms.has('U')).toBe(false)
    expect(arms.has('S')).toBe(false)
    expect(upstreamVarNamesOf(graph, names('entry', 'L', 'B', 'U', 'S'), () => false, 'B')).toEqual(
      ['entry'],
    )
  })

  it('does not let an unreachable container claim a reachable node as its arm', () => {
    // entry → R; U(parallel) → S → U and U → R, all off the reachable graph.
    const graph = ir(
      [node('entry'), node('R'), node('U', 'parallel'), node('S')],
      [
        { id: 'e1', source: 'entry', target: 'R' },
        { id: 'e2', source: 'U', target: 'S' },
        { id: 'e3', source: 'S', target: 'U' },
        { id: 'e4', source: 'U', target: 'R' },
      ],
    )
    expect(containerArms(graph).has('R')).toBe(false)
    expect(upstreamVarNamesOf(graph, names('entry', 'R'), () => false, 'R')).toEqual(['entry'])
  })

  it('bounds an owner chain even when a block names itself as owner', () => {
    const self = { owner: 'U', arm: 'S' }
    const blocks = new Map([
      ['S', self],
      ['U', self],
    ])
    expect(blockChain(blocks, 'S')).toEqual([self])
  })

  it('never puts a container inside its own arm when a reachable body loops back to it', () => {
    // The loop is the entry; its body returns to it, so the chain would reach the loop itself.
    const graph = ir(
      [node('U', 'loop'), node('S')],
      [
        { id: 'e1', source: 'U', target: 'S', label: 'body' },
        { id: 'e2', source: 'S', target: 'U' },
      ],
    )
    const arms = containerArms(graph)
    expect(arms.get('S')).toEqual({ owner: 'U', arm: 'S' })
    expect(arms.has('U')).toBe(false)
    expect(blockChain(arms, 'S')).toHaveLength(1)
  })

  it('stays linear-ish: deep nesting beside a long chain finishes well under a second', () => {
    const nodes: WorkflowIR['nodes'] = [node('root')]
    const edges: WorkflowIR['edges'] = []
    let parent = 'root'
    for (let i = 0; i < 300; i++) {
      const id = `p${i}`
      nodes.push(node(id, 'parallel'))
      edges.push({ id: `pe${i}`, source: parent, target: id, label: i === 0 ? undefined : 'a' })
      parent = id
    }
    let previous = 'root'
    for (let i = 0; i < 600; i++) {
      const id = `s${i}`
      nodes.push(node(id))
      edges.push({ id: `se${i}`, source: previous, target: id })
      previous = id
    }
    const graph = ir(nodes, edges)
    const all = new Map(nodes.map((n) => [n.id, n.id]))
    const started = performance.now()
    const scopes = upstreamVarNames(graph, all, () => false)
    expect(performance.now() - started).toBeLessThan(1000)
    expect(scopes.get('s599')!.length).toBeGreaterThan(599)
  })
})
