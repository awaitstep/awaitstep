import {
  codeFieldsOf,
  isBuiltinNodeType,
  nodeExpressionProblems,
  type NodeDefinition,
  type ArtifactIR,
  type ExpressionScope,
  type FieldExpressionProblem,
  type NodeId,
} from '@awaitstep/ir'
import { computeVarNames } from './context.js'
import type { SourceDiagnostic } from './types.js'

/**
 * Each node's place in the order generated code runs the graph (a
 * topological order), the same semantics expression validation and codegen
 * share: a node may name any node earlier in it, its value being in scope
 * there. A node on a cycle has no place.
 */
export function topologicalRanks(
  nodes: readonly { id: string }[],
  edges: readonly { source: string; target: string }[],
): Map<string, number> {
  const next = new Map<string, string[]>()
  const inDegree = new Map<string, number>()
  for (const node of nodes) {
    next.set(node.id, [])
    inDegree.set(node.id, 0)
  }
  for (const edge of edges) {
    if (!next.has(edge.source) || !inDegree.has(edge.target)) continue
    next.get(edge.source)!.push(edge.target)
    inDegree.set(edge.target, inDegree.get(edge.target)! + 1)
  }
  const queue = [...inDegree].filter(([, degree]) => degree === 0).map(([id]) => id)
  const ranks = new Map<string, number>()
  for (let at = 0; at < queue.length; at++) {
    const current = queue[at]!
    ranks.set(current, at)
    for (const target of next.get(current) ?? []) {
      const degree = inDegree.get(target)! - 1
      inDegree.set(target, degree)
      if (degree === 0) queue.push(target)
    }
  }
  return ranks
}

/** Node ids by the variable name generated code gives each node (`fetch_user`). */
export function nodeIdsByVarName(
  nodes: readonly { id: string; name: string }[],
): Map<string, string> {
  const byName = new Map<string, string>()
  for (const [id, name] of computeVarNames([...nodes])) byName.set(name, id)
  return byName
}

/** What each node's expressions may name: built once for a graph, read per node. */
export interface ExpressionScopes {
  scopeOf(nodeId: NodeId): ExpressionScope
}

export function expressionScopes(
  nodes: readonly { id: string; name: string }[],
  edges: readonly { source: string; target: string }[],
): ExpressionScopes {
  const ranks = topologicalRanks(nodes, edges)
  const allNodeIds = new Set(nodes.map((node) => node.id))
  const idByName = nodeIdsByVarName(nodes)
  return {
    scopeOf(nodeId) {
      const own = ranks.get(nodeId)
      return {
        nodeId,
        allNodeIds,
        idByName,
        upstream: {
          has: (id: string) => {
            const rank = ranks.get(id)
            return own !== undefined && rank !== undefined && rank < own
          },
        },
      }
    },
  }
}

/** A field problem with the node it is on. */
export interface NodeExpressionProblem extends FieldExpressionProblem {
  nodeId: NodeId
  nodeName: string
}

/**
 * Every `{{ … }}` in the graph that wouldn't work: one that isn't a valid
 * expression, or names a node that doesn't exist, runs later, or is the node
 * itself. The one check the editors, the canvas's validation and a deploy
 * all run.
 */
export function graphExpressionProblems(
  ir: Pick<ArtifactIR, 'nodes' | 'edges'>,
  definitionOf?: (type: string) => Pick<NodeDefinition, 'configSchema'> | undefined,
): NodeExpressionProblem[] {
  const scopes = expressionScopes(ir.nodes, ir.edges)
  // A node whose definition isn't known (not installed) is reported as such
  // elsewhere; without its schema its code fields can't be told apart.
  const known = (type: string) => !definitionOf || isBuiltinNodeType(type) || !!definitionOf(type)
  return ir.nodes.flatMap((node) =>
    !known(node.type)
      ? []
      : nodeExpressionProblems(
          node.data,
          scopes.scopeOf(node.id),
          codeFieldsOf(definitionOf?.(node.type)?.configSchema, node.type),
        ).map((problem) => ({
          ...problem,
          nodeId: node.id,
          nodeName: node.name,
        })),
  )
}

/** At most this many diagnostics are listed; past it, one more line says there may be others. */
const SHOWN_DIAGNOSTICS = 50

/**
 * The same, as diagnostics a prepare reports: "<node>: <problem>". Listed up
 * to a limit, so a response never grows past what the request sent.
 */
export function expressionDiagnostics(
  ir: Pick<ArtifactIR, 'nodes' | 'edges'>,
  definitionOf?: (type: string) => Pick<NodeDefinition, 'configSchema'> | undefined,
): SourceDiagnostic[] {
  const problems = graphExpressionProblems(ir, definitionOf)
  const listed: SourceDiagnostic[] = problems.slice(0, SHOWN_DIAGNOSTICS).map((problem) => ({
    source: 'ir',
    nodeId: problem.nodeId,
    message: `${problem.nodeName}: ${problem.message}`,
  }))
  // Problems are already capped per value and per node, so a count would
  // undercount: past the limit, say only that there may be more.
  if (problems.length >= SHOWN_DIAGNOSTICS) {
    listed.push({ source: 'ir', message: 'Fix these first: more expressions may need fixing.' })
  }
  return listed
}
