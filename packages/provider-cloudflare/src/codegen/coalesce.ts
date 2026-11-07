import type { WorkflowIR, WorkflowNode } from '@awaitstep/ir'
import { childContext, type GenerationContext } from '@awaitstep/codegen'
import { computeInDegree } from './generators/branch.js'
import { generateStepGroup, resolveStepConfig } from './generators/step.js'

/**
 * A node may join a coalesced step group only when it is a plain `step`
 * node (other kinds carry their own wrappers and lifecycles), not inline
 * (inline already opts out of durability), carries no retry/timeout config,
 * and has not opted out via `data.coalesce === false`.
 *
 * Merging DOES coarsen durability: Cloudflare applies its default retry
 * policy to a config-less durable step, so when a later member throws, the whole
 * group's callback retries and earlier members' side effects re-execute —
 * previously each had its own durably-cached step. That is the accepted
 * cost of paying for one step instead of N; nodes whose side effects must
 * never replay with a neighbor's failure should keep explicit step config
 * or set `coalesce: false`.
 */
export function isCoalescible(node: WorkflowNode): boolean {
  return (
    node.type === 'step' &&
    node.data.inline !== true &&
    node.data.coalesce !== false &&
    resolveStepConfig(node) === undefined
  )
}

interface ChainIndex {
  inDegree: Map<string, number>
  outDegree: Map<string, number>
  plainEdges: Set<string>
}

// One edge sweep per IR object per generation — loop bodies and container
// arms all group against the same resolved IR instance.
const chainIndexCache = new WeakMap<WorkflowIR, ChainIndex>()

function chainIndex(ir: WorkflowIR): ChainIndex {
  const cached = chainIndexCache.get(ir)
  if (cached) return cached
  const outDegree = new Map<string, number>()
  const plainEdges = new Set<string>()
  for (const edge of ir.edges) {
    outDegree.set(edge.source, (outDegree.get(edge.source) ?? 0) + 1)
    if (!edge.label) plainEdges.add(`${edge.source}\u0000${edge.target}`)
  }
  const index = { inDegree: computeInDegree(ir), outDegree, plainEdges }
  chainIndexCache.set(ir, index)
  return index
}

/**
 * Splits an ordered emission chain into groups: maximal runs of adjacent
 * coalescible steps joined by a single unlabeled edge, where the leader is
 * the predecessor's only outgoing edge and the follower's only incoming one
 * — i.e. strictly linear flow with no fan-in/fan-out or container
 * continuations (labeled edges never merge). Everything else passes through
 * as a singleton group, so output is byte-identical for ineligible chains.
 */
export function groupChain(chain: WorkflowNode[], ir: WorkflowIR): WorkflowNode[][] {
  const { inDegree, outDegree, plainEdges } = chainIndex(ir)

  const groups: WorkflowNode[][] = []
  for (const node of chain) {
    const current = groups[groups.length - 1]
    const prev = current?.[current.length - 1]
    if (
      prev !== undefined &&
      isCoalescible(prev) &&
      isCoalescible(node) &&
      plainEdges.has(`${prev.id}\u0000${node.id}`) &&
      (outDegree.get(prev.id) ?? 0) === 1 &&
      (inDegree.get(node.id) ?? 0) === 1
    ) {
      current!.push(node)
    } else {
      groups.push([node])
    }
  }
  return groups
}

/**
 * Shared chain emission for container bodies (loop, branch arms, try/catch
 * blocks): adjacent coalescible steps emit as one merged step, everything
 * else goes through the per-node generator. Containers always inline their
 * children, so the group uses the inline context; container glue references
 * member vars, so lean return-pruning never applies here.
 */
export function emitGroupedChain(
  chain: WorkflowNode[],
  ir: WorkflowIR,
  ctx: GenerationContext,
  generateNode: (node: WorkflowNode, ir: WorkflowIR, ctx?: GenerationContext) => string,
  /** The children's context inside a container; a group's members are children too. */
  override?: GenerationContext,
): string[] {
  return groupChain(chain, ir).map((group) =>
    group.length > 1
      ? generateStepGroup(group, override ?? childContext(ctx))
      : generateNode(group[0]!, ir, override),
  )
}
