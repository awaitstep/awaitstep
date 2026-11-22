/**
 * Lays out a workflow template's graph for the use cases page: each node a row below what leads
 * to it (a block's way on below everything inside the block), under its parent, and never closer
 * to a neighbour than a node's width and a gap.
 * The labels say what each node does, in the words the canvas uses.
 */
import { isArmContainerType, isArmEdgeOf, type WorkflowIR } from '@awaitstep/ir'

export interface FlowNode {
  id: string
  label: string
  /** What kind of step it is: "Step", "Resend", "Waits for payment-succeeded". */
  detail: string
  /** The registry integration it uses, for its icon. */
  integrationId?: string
  row: number
  /** Centre of the node across the drawing, in its units (`FlowLayout.width` wide). */
  x: number
}

export interface FlowEdge {
  from: string
  to: string
  label?: string
}

export interface FlowLayout {
  nodes: FlowNode[]
  edges: FlowEdge[]
  rows: number
  /** How wide the drawing is, so the widest row fits without overlap. */
  width: number
}

/** A node's name as a person would say it: `send_confirmation` reads "Send confirmation". */
export function stepLabel(id: string): string {
  const w = id.replace(/[_-]+/g, ' ').trim()
  return w.charAt(0).toUpperCase() + w.slice(1)
}

const str = (v: unknown) => (typeof v === 'string' ? v : '')

/** The second line under a node's name. */
export function nodeDetail(
  type: string,
  data: Record<string, unknown>,
  integrationNames: ReadonlyMap<string, string>,
): string {
  switch (type) {
    case 'step':
      return 'Step'
    case 'sleep':
      return `Sleeps ${str(data.duration)}`.trim()
    // The timeout is on the path out ("After 3 days"), so the node names only the event.
    case 'wait_for_event':
      return `Waits for ${str(data.eventType)}`
    case 'branch':
      return 'Branch'
    case 'parallel':
      return 'Parallel'
    case 'try_catch':
      return 'Try / catch'
    case 'loop':
      return 'Loop'
    case 'http_request':
      return 'HTTP request'
    default:
      return integrationNames.get(type) ?? stepLabel(type)
  }
}

/** An edge's label as the canvas would say it: wait paths read "Arrives" and "After 3 days". */
export function edgeLabel(
  label: string | undefined,
  source: { type: string; data: Record<string, unknown> },
): string | undefined {
  if (!label) return undefined
  if (source.type === 'wait_for_event') {
    if (label === 'onEvent') return 'Arrives'
    if (label === 'onTimeout') return `After ${str(source.data.timeout) || 'the timeout'}`
  }
  return stepLabel(label)
}

/** A node's size and the space between neighbours, in the drawing's units. */
export const FLOW_NODE_W = 200
export const FLOW_GAP = 28
/** The narrowest drawing: a single column still sits centred in this width. */
export const FLOW_MIN_WIDTH = 640
const PITCH = FLOW_NODE_W + FLOW_GAP

type LayoutIR = Pick<WorkflowIR, 'entryNodeId' | 'nodes' | 'edges'>

/**
 * Each node's row. A node sits one row below every node that leads to it; the node a block goes
 * on to (a try/catch's or a wait's `then`) sits below everything inside the block's arms, as the
 * code runs it.
 */
function rowsOf(ir: LayoutIR): Map<string, number> {
  const byId = new Map(ir.nodes.map((n) => [n.id, n]))
  const out = new Map<string, typeof ir.edges>()
  for (const e of ir.edges) out.set(e.source, [...(out.get(e.source) ?? []), e])

  // What a block's arms hold: every node reachable from an arm, short of where the block goes on.
  const inside = new Map<string, Set<string>>()
  for (const n of ir.nodes) {
    const edges = out.get(n.id) ?? []
    const after = new Set(edges.filter((e) => !isArmEdgeOf(n.type, e.label)).map((e) => e.target))
    if (!isArmContainerType(n.type) || after.size === 0) continue
    const held = new Set<string>()
    const stack = edges.filter((e) => isArmEdgeOf(n.type, e.label)).map((e) => e.target)
    while (stack.length > 0) {
      const id = stack.pop()!
      if (held.has(id) || after.has(id) || id === n.id) continue
      held.add(id)
      for (const e of out.get(id) ?? []) stack.push(e.target)
    }
    inside.set(n.id, held)
  }

  const row = new Map<string, number>([[ir.entryNodeId, 0]])
  // A graph without cycles settles in one pass per node; the bound keeps a bad one finite.
  for (let pass = 0; pass <= ir.nodes.length; pass++) {
    let moved = false
    for (const e of ir.edges) {
      const from = row.get(e.source)
      if (from === undefined) continue
      const source = byId.get(e.source)
      const held = source && !isArmEdgeOf(source.type, e.label) ? inside.get(e.source) : undefined
      const bottom = Math.max(from, ...[...(held ?? [])].map((id) => row.get(id) ?? from))
      if ((row.get(e.target) ?? -1) < bottom + 1) {
        row.set(e.target, bottom + 1)
        moved = true
      }
    }
    if (!moved) break
  }
  return row
}

export function layoutFlow(
  ir: LayoutIR,
  integrationNames: ReadonlyMap<string, string>,
): FlowLayout {
  const byId = new Map(ir.nodes.map((n) => [n.id, n]))
  const row = rowsOf(ir)
  const parents = new Map<string, string[]>()
  const arms = new Map<string, string[]>()
  for (const e of ir.edges) {
    parents.set(e.target, [...(parents.get(e.target) ?? []), e.source])
    const source = byId.get(e.source)
    // A block's way on sits under the block; its arms, and a step's next steps, spread beneath.
    if (!source || !isArmContainerType(source.type) || isArmEdgeOf(source.type, e.label))
      arms.set(e.source, [...(arms.get(e.source) ?? []), e.target])
  }

  // Order of first reach from the entry, so siblings keep their edge order.
  const order: string[] = []
  const seen = new Set<string>()
  const visit = (id: string) => {
    if (seen.has(id) || !byId.has(id)) return
    seen.add(id)
    order.push(id)
  }
  visit(ir.entryNodeId)
  for (let i = 0; i < order.length; i++)
    for (const e of ir.edges) if (e.source === order[i]) visit(e.target)
  for (const n of ir.nodes) visit(n.id)

  const rows = new Map<number, string[]>()
  for (const id of order) {
    const r = row.get(id) ?? 0
    rows.set(r, [...(rows.get(r) ?? []), id])
  }

  // Row by row, each node under its parents (an arm offset by its place among its siblings),
  // then pushed apart so no two in a row are closer than a node and a gap.
  const x = new Map<string, number>()
  const wanted = (id: string) => {
    const from = (parents.get(id) ?? []).filter((p) => x.has(p))
    if (from.length === 0) return 0
    const at = from.map((p) => {
      const siblings = arms.get(p) ?? []
      const i = siblings.indexOf(id)
      return x.get(p)! + (i < 0 ? 0 : (i - (siblings.length - 1) / 2) * PITCH)
    })
    return at.reduce((a, b) => a + b, 0) / at.length
  }
  for (const r of [...rows.keys()].sort((a, b) => a - b)) {
    const ids = rows.get(r)!
    const want = ids.map((id) => ({ id, at: wanted(id) })).sort((a, b) => a.at - b.at)
    const placed: number[] = []
    want.forEach((w, i) => placed.push(i === 0 ? w.at : Math.max(w.at, placed[i - 1] + PITCH)))
    const drift = placed.reduce((sum, p, i) => sum + p - want[i].at, 0) / placed.length
    want.forEach((w, i) => x.set(w.id, placed[i] - drift))
  }

  const xs = [...x.values()]
  const span = Math.max(...xs) - Math.min(...xs) + FLOW_NODE_W + 2 * FLOW_GAP
  const width = Math.max(FLOW_MIN_WIDTH, span)
  const shift = width / 2 - (Math.max(...xs) + Math.min(...xs)) / 2

  const nodes: FlowNode[] = order.map((id) => {
    const n = byId.get(id)!
    const data = (n.data ?? {}) as Record<string, unknown>
    return {
      id,
      label: stepLabel(n.name),
      detail: nodeDetail(n.type, data, integrationNames),
      ...(integrationNames.has(n.type) ? { integrationId: n.type } : {}),
      row: row.get(id) ?? 0,
      x: x.get(id)! + shift,
    }
  })

  const edges = ir.edges.map((e) => {
    const source = byId.get(e.source)!
    const label = edgeLabel(e.label, {
      type: source.type,
      data: (source.data ?? {}) as Record<string, unknown>,
    })
    return { from: e.source, to: e.target, ...(label ? { label } : {}) }
  })

  return { nodes, edges, rows: Math.max(...nodes.map((n) => n.row)) + 1, width }
}
