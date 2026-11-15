import { describe, expect, it } from 'vitest'
import type { WorkflowNode } from '@awaitstep/ir'
import {
  expressionDiagnostics,
  graphExpressionProblems,
  topologicalRanks,
} from '../expression-scope.js'

function node(id: string, name: string, data: Record<string, unknown> = {}): WorkflowNode {
  return { id, type: 'step', name, version: '1.0.0', provider: 'cloudflare', data }
}

describe('graphExpressionProblems', () => {
  const nodes = [
    node('a', 'Fetch user'),
    node('b', 'Greet', { greeting: 'Hi {{Fetch_user.name}} {{c.x}}', label: '{{}}' }),
    node('c', 'Send'),
  ]
  const edges = [
    { source: 'a', target: 'b' },
    { source: 'b', target: 'c' },
  ]

  it('checks every node against the steps before it', () => {
    expect(graphExpressionProblems({ nodes, edges }).map((p) => [p.nodeId, p.field])).toEqual([
      ['b', 'greeting'],
      ['b', 'label'],
    ])
  })

  it('words diagnostics with the node name', () => {
    expect(expressionDiagnostics({ nodes, edges })[0]).toEqual({
      source: 'ir',
      nodeId: 'b',
      message: 'Greet: “c” runs after this node. Use a step that runs before it.',
    })
  })

  it('treats a node on a cycle as having nothing before it', () => {
    const cyclic = [
      { source: 'a', target: 'b' },
      { source: 'b', target: 'a' },
    ]
    const problems = graphExpressionProblems({
      nodes: [node('a', 'A', { x: '{{b.y}}' }), node('b', 'B')],
      edges: cyclic,
    })
    expect(problems).toHaveLength(1)
  })

  it('leaves a node of an unknown type to the check that says it isn’t installed', () => {
    const custom = { ...node('x', 'Mystery', { script: 'return {{}}' }), type: 'custom:gone' }
    const graph = { nodes: [custom], edges: [] }
    expect(graphExpressionProblems(graph, () => undefined)).toEqual([])
    expect(graphExpressionProblems(graph)).toHaveLength(1)
  })

  it('ranks a large graph without copying a set per node', () => {
    const many = Array.from({ length: 5000 }, (_, i) => ({ id: `n${i}` }))
    const chain = many.slice(1).map((n, i) => ({ source: `n${i}`, target: n.id }))
    const started = performance.now()
    const ranks = topologicalRanks(many, chain)
    expect(ranks.get('n4999')).toBe(4999)
    expect(performance.now() - started).toBeLessThan(500)
  })
})

describe('expressionDiagnostics on a graph with many problems', () => {
  it('lists a limited number and counts the rest', () => {
    const many = Array.from({ length: 80 }, (_, i) => node(`n${i}`, `N${i}`, { x: '{{}}' }))
    const diagnostics = expressionDiagnostics({ nodes: many, edges: [] })
    expect(diagnostics).toHaveLength(51)
    expect(diagnostics.at(-1)).toEqual({
      source: 'ir',
      message: 'Fix these first: more expressions may need fixing.',
    })
  })
})
