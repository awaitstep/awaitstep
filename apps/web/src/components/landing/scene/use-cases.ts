import {
  REFUND_REVIEW,
  type SceneEdge,
  type SceneGraph,
  type SceneNode,
  type SceneNodeKind,
} from './graph.js'
import { edgePulse, spanFrame, type RunFrame, type Span } from './timeline.js'

/**
 * A workflow the hero plays: its graph, one recorded run (the spans each node holds) and how
 * long the run lasts in seconds, including a short hold on the finished run.
 */
export interface UseCase {
  id: string
  graph: SceneGraph
  length: number
  spans: Record<string, Span[]>
}

const node = (
  id: string,
  name: string,
  kind: SceneNodeKind,
  row: number,
  lane = 0,
  detail?: string,
): SceneNode => ({
  id,
  name,
  kind,
  row,
  lane,
  detail,
})
const edge = (from: string, to: string): SceneEdge => ({ id: `${from}-${to}`, from, to })
/** A branch arm the run does not take: idle until the branch decides, then greyed out. */
const notTaken = (from: number): Span[] => [
  { status: 'skipped', from, to: Number.POSITIVE_INFINITY },
]

/** `refund-review`: the approval wait, a refund that fails once and retries, the 3-day sleep. */
const REFUND: UseCase = {
  id: 'refund-review',
  length: 12,
  graph: REFUND_REVIEW,
  spans: {
    fetch_order: [{ status: 'running', from: 0.6, to: 1.4 }],
    check_amount: [{ status: 'running', from: 1.6, to: 2.1 }],
    wait_approval: [{ status: 'waiting', from: 2.3, to: 4.2 }],
    refund_and_notify: [{ status: 'running', from: 4.4, to: 6.9 }],
    issue_refund: [
      { status: 'running', from: 4.6, to: 5.3, attempt: 1 },
      { status: 'failed', from: 5.3, to: 5.7, attempt: 1 },
      { status: 'retrying', from: 5.7, to: 6.0, attempt: 2 },
      { status: 'running', from: 6.0, to: 6.7, attempt: 2 },
    ],
    notify_team: [{ status: 'running', from: 4.6, to: 5.5 }],
    wait_three_days: [{ status: 'sleeping', from: 7.1, to: 8.9 }],
    follow_up: [{ status: 'running', from: 9.1, to: 9.8 }],
  },
}

/** The `order-processing` template (apps/docs/templates): this run's card is declined. */
const ORDER_PROCESSING: UseCase = {
  id: 'order-processing',
  length: 9.5,
  graph: {
    name: 'order-processing',
    nodes: [
      node('parse', 'Parse order', 'step', 0),
      node('charge', 'Charge card', 'step', 1, 0, 'Stripe: Create Charge'),
      node('decide', 'Payment decision', 'branch', 2, 0, 'charge.paid'),
      node('receipt', 'Send receipt', 'step', 3, -0.85, 'Resend: Send Email'),
      node('ops', 'Notify ops', 'step', 3, 0.85, 'Slack: Post Message'),
      node('status', 'Update order status', 'http_request', 4, 0, 'PATCH /orders/:id'),
    ],
    edges: [
      edge('parse', 'charge'),
      edge('charge', 'decide'),
      edge('decide', 'receipt'),
      edge('decide', 'ops'),
      edge('receipt', 'status'),
      edge('ops', 'status'),
    ],
  },
  spans: {
    parse: [{ status: 'running', from: 0.6, to: 1.4 }],
    charge: [{ status: 'running', from: 1.7, to: 3.4 }],
    decide: [{ status: 'running', from: 3.7, to: 4.3 }],
    receipt: notTaken(4.3),
    ops: [{ status: 'running', from: 4.6, to: 5.8 }],
    status: [{ status: 'running', from: 6.1, to: 7.2 }],
  },
}

/** The `human-approval` template (apps/docs/templates): the reviewer approves. */
const HUMAN_APPROVAL: UseCase = {
  id: 'human-approval',
  length: 10.5,
  graph: {
    name: 'human-approval',
    nodes: [
      node('create', 'Create request', 'step', 0),
      node('notify', 'Notify reviewer', 'step', 1, 0, 'Resend: Send Email'),
      node('wait', 'Wait for decision', 'wait_for_event', 2, 0, 'approval-decision'),
      node('route', 'Route decision', 'branch', 3, 0, 'approved'),
      node('approved', 'Run approved action', 'step', 4, -0.85),
      node('rejected', 'Notify requester', 'step', 4, 0.85, 'Resend: Send Email'),
    ],
    edges: [
      edge('create', 'notify'),
      edge('notify', 'wait'),
      edge('wait', 'route'),
      edge('route', 'approved'),
      edge('route', 'rejected'),
    ],
  },
  spans: {
    create: [{ status: 'running', from: 0.6, to: 1.4 }],
    notify: [{ status: 'running', from: 1.7, to: 2.6 }],
    wait: [{ status: 'waiting', from: 2.9, to: 6.2 }],
    route: [{ status: 'running', from: 6.5, to: 7.0 }],
    approved: [{ status: 'running', from: 7.3, to: 8.4 }],
    rejected: notTaken(7.0),
  },
}

/** The use cases the hero plays, in order. */
export const USE_CASES: readonly UseCase[] = [REFUND, ORDER_PROCESSING, HUMAN_APPROVAL]

/** One use case `r` seconds into its run: every node on the canvas, every edge drawn. */
export function useCaseFrame(useCase: UseCase, r: number): RunFrame {
  const nodes: RunFrame['nodes'] = {}
  for (const n of useCase.graph.nodes) nodes[n.id] = spanFrame(useCase.spans[n.id], r)
  const edges: RunFrame['edges'] = {}
  for (const e of useCase.graph.edges) {
    edges[e.id] = { drawn: 1, pulse: edgePulse(useCase.spans[e.from], useCase.spans[e.to], r) }
  }
  return { nodes, edges }
}
