import refundReviewIr from './fixtures/refund-review.ir.json' with { type: 'json' }

/** Node kinds the hero draws. Names match `BUILTIN_NODE_TYPE_LIST` in `@awaitstep/ir`. */
export type SceneNodeKind =
  | 'step'
  | 'sleep'
  | 'branch'
  | 'parallel'
  | 'http_request'
  | 'wait_for_event'
  | 'try_catch'
  | 'race'

const SCENE_KINDS: ReadonlySet<string> = new Set<SceneNodeKind>([
  'step',
  'sleep',
  'branch',
  'parallel',
  'http_request',
  'wait_for_event',
  'try_catch',
  'race',
])

/** A node on the canvas. `row` runs down with the flow, `lane` across it (0 is the middle). */
export interface SceneNode {
  id: string
  name: string
  kind: SceneNodeKind
  row: number
  lane: number
  /** The second line a canvas node shows: the duration, the request, the event it waits for. */
  detail?: string
  /** The error the card shows when this node's attempt fails (sample text, matching its code). */
  failure?: string
}

export interface SceneEdge {
  id: string
  from: string
  to: string
}

/** A workflow graph laid out top to bottom, like the dashboard canvas. */
export interface SceneGraph {
  name: string
  nodes: SceneNode[]
  edges: SceneEdge[]
}

/** Where a node sits on the canvas. */
export interface NodePlace {
  row: number
  lane: number
}

interface IrNode {
  id: string
  type: string
  name: string
  data?: Record<string, unknown>
}

interface IrEdge {
  id: string
  source: string
  target: string
}

const str = (v: unknown) => (typeof v === 'string' ? v : '')

/** The detail line the dashboard canvas prints under a node's name (components/canvas/nodes.tsx). */
export function nodeDetail(kind: string, data: Record<string, unknown> = {}): string | undefined {
  switch (kind) {
    case 'sleep':
      return str(data.duration) || undefined
    case 'http_request': {
      const url = str(data.url).replace(/^https?:\/\//, '')
      return url ? `${str(data.method) || 'GET'} ${url}` : undefined
    }
    case 'wait_for_event': {
      const timeout = str(data.timeout)
      return str(data.eventType) + (timeout ? ` (${timeout})` : '') || undefined
    }
    case 'branch': {
      const branches = Array.isArray(data.branches) ? data.branches : []
      const first = branches[0] as { label?: unknown } | undefined
      return first ? str(first.label) || undefined : undefined
    }
    default:
      return undefined
  }
}

/**
 * Builds a scene graph from a workflow IR and a layout. Every node keeps its IR name, type and
 * detail; the layout only places it.
 */
export function sceneGraphFromIr(
  ir: { metadata: { name: string }; nodes: IrNode[]; edges: IrEdge[] },
  layout: Record<string, NodePlace>,
): SceneGraph {
  const nodes = ir.nodes.map((n): SceneNode => {
    const place = layout[n.id]
    if (!place) throw new Error(`no layout for node ${n.id}`)
    if (!SCENE_KINDS.has(n.type)) throw new Error(`node ${n.id} has an undrawn kind ${n.type}`)
    return {
      id: n.id,
      name: n.name,
      kind: n.type as SceneNodeKind,
      detail: nodeDetail(n.type, n.data),
      ...place,
    }
  })
  const edges = ir.edges.map((e): SceneEdge => ({ id: e.id, from: e.source, to: e.target }))
  return { name: ir.metadata.name, nodes, edges }
}

/**
 * A symmetric tree in five rows: centred steps alternate with pairs (the branch and its wait,
 * the two parallel arms, the sleep and the follow-up).
 */
const REFUND_REVIEW_LAYOUT: Record<string, NodePlace> = {
  fetch_order: { row: 0, lane: 0 },
  check_amount: { row: 1, lane: -0.85 },
  wait_approval: { row: 1, lane: 0.85 },
  refund_and_notify: { row: 2, lane: 0 },
  issue_refund: { row: 3, lane: -0.85 },
  notify_team: { row: 3, lane: 0.85 },
  wait_three_days: { row: 4, lane: -0.85 },
  follow_up: { row: 4, lane: 0.85 },
}

/**
 * The `refund-review` workflow, from its IR. `issue_refund` throws `Stripe ${res.status}`; the
 * hero's run gets a 503 on the first attempt.
 */
export const REFUND_REVIEW: SceneGraph = (() => {
  const graph = sceneGraphFromIr(refundReviewIr, REFUND_REVIEW_LAYOUT)
  return {
    ...graph,
    nodes: graph.nodes.map((n) => (n.id === 'issue_refund' ? { ...n, failure: 'Stripe 503' } : n)),
  }
})()
