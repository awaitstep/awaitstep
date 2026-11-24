import {
  WAIT_ARM_FIELDS,
  isArmContainerType,
  isBuiltinNodeType,
  openArmSlots,
  waitArmEdgeOverridden,
  type ArtifactIR,
  type Edge,
  type NodeId,
  type WorkflowNode,
} from '@awaitstep/ir'
import { computeVarNames } from './context.js'
import { INLINE_STEP_SCAFFOLD, stepModuleTemplate } from './step-module.js'

/**
 * Where a new step goes, in the graph's own terms: on the way out of a node
 * (spliced into its only outgoing edge, or appended after it), at the front,
 * or starting an empty arm of a branching node. `edgeId` names which
 * connection when the node has several — a branch, a container's arms, a
 * fan-out. `arm` names an arm with nothing in it yet (`then` for after the
 * block; null for a new arm of a parallel or race).
 */
export type StepPlacement =
  { after: NodeId; edgeId?: string } | { after: NodeId; arm: string | null } | { first: true }

export interface NewStep {
  /** The node's id; the step's file is `steps/<id>.ts`. */
  id: string
  /** The display name; the module's function is named from it. */
  name: string
}

/**
 * A node to place: a `step` (its module code is scaffolded from its name) or
 * a custom or marketplace template node, which carries its field values and
 * no code — its code lives in the Library or the registry.
 */
export interface NewNode extends NewStep {
  type: string
  /**
   * A template node's field values. For a step only `code` and `inline` are
   * read: the module it starts with, instead of the scaffold named from its
   * variable name, and whether it runs in the body without a durable step. A pending Add keeps the scaffold it was first given this way, so
   * replaying it where the names differ never changes the text a draft of
   * it was started from.
   */
  data?: Record<string, unknown>
}

export type InsertStepResult =
  { ok: true; ir: ArtifactIR; node: WorkflowNode } | { ok: false; reason: string }

/** The canvas's column spacing, for a new arm beside a block's others. */
const STEP_X_OFFSET = 280
/** The canvas's row spacing (top to bottom): a step under the one it follows. */
const STEP_Y_OFFSET = 120
/** Where a position-less graph's first node lands, matching `fallbackPosition` on the canvas. */
const FALLBACK_POSITION = { x: 80, y: 80 }
const NEW_NODE_VERSION = '1.0.0'
const NEW_NODE_PROVIDER = 'cloudflare'

function refuse(reason: string): InsertStepResult {
  return { ok: false, reason }
}

/** An edge id derived from the new node's own, since this function is pure and takes no id generator. */
function uniqueEdgeId(used: Set<string>, base: string): string {
  let id = base
  for (let n = 2; used.has(id); n++) id = `${base}-${n}`
  used.add(id)
  return id
}

/** One row under `node`, `columns` columns to the right. */
function below(node: WorkflowNode | undefined, columns = 0): { x: number; y: number } {
  if (!node?.position) return { ...FALLBACK_POSITION }
  return { x: node.position.x + columns * STEP_X_OFFSET, y: node.position.y + STEP_Y_OFFSET }
}

/**
 * Where the blocks around `anchor` go on after their arms: the `then` target
 * of each block `anchor` sits inside (one whose way on does not lead back to
 * `anchor`), out to the outermost. A new step inside an arm makes the arm a
 * row longer, so these sit a row lower too.
 */
function afterEnclosingBlocks(
  nodesById: ReadonlyMap<NodeId, WorkflowNode>,
  edges: readonly Edge[],
  anchor: NodeId,
): NodeId[] {
  const into = new Map<NodeId, NodeId[]>()
  for (const edge of edges) {
    const from = into.get(edge.target)
    if (from) from.push(edge.source)
    else into.set(edge.target, [edge.source])
  }
  const before = new Set<NodeId>([anchor])
  const stack = [anchor]
  while (stack.length > 0) {
    for (const source of into.get(stack.pop()!) ?? []) {
      if (before.has(source)) continue
      before.add(source)
      stack.push(source)
    }
  }
  return edges
    .filter(
      (edge) =>
        edge.label === 'then' &&
        before.has(edge.source) &&
        !before.has(edge.target) &&
        isArmContainerType(nodesById.get(edge.source)?.type ?? ''),
    )
    .map((edge) => edge.target)
}

/**
 * The nodes with each of `starts` and every node after them along the edges
 * (paths, not the whole graph) a row lower: room for a new step put in a
 * start's place. However the canvas spaced them, nothing on those paths stays
 * where the new step lands.
 */
function shiftedDown(
  nodes: readonly WorkflowNode[],
  edges: readonly Edge[],
  starts: readonly NodeId[],
): WorkflowNode[] {
  if (starts.length === 0) return [...nodes]
  const next = new Map<NodeId, NodeId[]>()
  for (const edge of edges) {
    const out = next.get(edge.source)
    if (out) out.push(edge.target)
    else next.set(edge.source, [edge.target])
  }
  const moved = new Set<NodeId>(starts)
  const stack = [...starts]
  while (stack.length > 0) {
    for (const target of next.get(stack.pop()!) ?? []) {
      if (moved.has(target)) continue
      moved.add(target)
      stack.push(target)
    }
  }
  return nodes.map((node) =>
    moved.has(node.id) && node.position
      ? { ...node, position: { x: node.position.x, y: node.position.y + STEP_Y_OFFSET } }
      : node,
  )
}

/**
 * The graph with a new `step` node placed on it, created as one document so a
 * single version save writes the node, its edges and its module code — the
 * same shape the canvas's drop-on-an-edge makes. Splicing into `X → Y` gives
 * `X → new → Y` with the edge's label (a container's arm, a branch label)
 * kept on the first edge; a node with nothing after it gets `X → new`; an
 * empty graph gets the new entry node.
 *
 * Positions follow the canvas's top-to-bottom layout: put in front of `Y`,
 * the new node takes `Y`'s place and `Y` with the path after it moves a row
 * down (so nothing overlaps, however the canvas spaced them); at the end it
 * goes a row under the node it follows. Inside a block's arm, what runs
 * after the block moves a row down too. A node put first takes the entry's
 * place the same way; a new arm sits under its block, a column past the arms
 * it has. Nothing off that path moves.
 *
 * The new node is appended to `nodes` rather than inserted at its graph
 * position: variable names are assigned in that order, so appending leaves
 * every existing node's name — and its module's function — as it was.
 */
export function insertStep(
  ir: ArtifactIR,
  placement: StepPlacement,
  newStep: NewStep,
): InsertStepResult {
  return insertNode(ir, placement, { ...newStep, type: 'step' })
}

/**
 * `insertStep` for any node Code can add: a step, or a custom or marketplace
 * template node with its field values. Other builtins (branch, loop, sleep…)
 * keep their canvas-only flows and are refused. Placement, edges, names and
 * positions follow `insertStep` exactly.
 */
export function insertNode(
  ir: ArtifactIR,
  placement: StepPlacement,
  newStep: NewNode,
): InsertStepResult {
  const isStep = newStep.type === 'step'
  if (!isStep && (newStep.type === '' || isBuiltinNodeType(newStep.type))) {
    return refuse('Only a step or a custom node can be added here.')
  }
  const noun = isStep ? 'step' : 'node'
  const name = newStep.name.trim()
  if (name === '') return refuse(`Give the ${noun} a name.`)
  if (name.length > 256) return refuse(`A ${noun} name can be at most 256 characters.`)
  if (newStep.id === '') return refuse(`The ${noun} needs an id.`)
  if (ir.nodes.some((node) => node.id === newStep.id)) {
    return refuse('A node with that id is already in this version.')
  }

  const nodesById = new Map(ir.nodes.map((node) => [node.id, node]))
  const usedEdgeIds = new Set(ir.edges.map((edge) => edge.id))
  const anchor = 'after' in placement ? nodesById.get(placement.after) : undefined
  if ('after' in placement && !anchor) {
    return refuse('That step is not in this version any more.')
  }

  const names = computeVarNames([...ir.nodes, { id: newStep.id, name }])
  const varName = names.get(newStep.id)!
  if (varName === '') {
    return refuse(`This ${noun}’s name needs at least one letter or digit.`)
  }
  const givenCode = isStep && typeof newStep.data?.code === 'string' ? newStep.data.code : null
  const inline = isStep && newStep.data?.inline === true
  // An inline step holds statements, run in the workflow's own body: its
  // scaffold has no `return`, which would end the whole run.
  const scaffold = inline ? INLINE_STEP_SCAFFOLD : stepModuleTemplate(varName)
  const build = (position: { x: number; y: number }): WorkflowNode =>
    isStep
      ? buildNode(newStep.id, name, givenCode ?? scaffold, position, inline)
      : {
          id: newStep.id,
          type: newStep.type,
          name,
          position,
          version: NEW_NODE_VERSION,
          provider: NEW_NODE_PROVIDER,
          data: { ...newStep.data },
        }
  let node: WorkflowNode
  let edges: Edge[]
  let nodes: WorkflowNode[] = [...ir.nodes]
  let entryNodeId = ir.entryNodeId

  if ('first' in placement) {
    if (ir.nodes.length === 0) {
      node = build({ ...FALLBACK_POSITION })
      edges = [...ir.edges]
      entryNodeId = newStep.id
    } else {
      const entry = nodesById.get(ir.entryNodeId)
      if (!entry) return refuse('This workflow has no entry step to put one before.')
      node = build(entry.position ? { ...entry.position } : { ...FALLBACK_POSITION })
      if (entry.position) nodes = shiftedDown(nodes, ir.edges, [entry.id])
      edges = [
        ...ir.edges,
        {
          id: uniqueEdgeId(usedEdgeIds, `${newStep.id}-out`),
          source: newStep.id,
          target: entry.id,
        },
      ]
      entryNodeId = newStep.id
    }
  } else if ('arm' in placement) {
    const container = anchor!
    const outgoing = ir.edges.filter((edge) => edge.source === container.id)
    const open = openArmSlots(container, outgoing, (id) => nodesById.has(id))
    if (!open.some((slot) => slot.label === placement.arm)) {
      return refuse(
        isArmContainerType(container.type)
          ? `${container.name}’s ${armName(placement.arm)} is not empty any more.`
          : `${container.name} has no arms.`,
      )
    }
    node = build(below(container, outgoing.length))
    edges = [
      ...ir.edges,
      {
        id: uniqueEdgeId(usedEdgeIds, `${newStep.id}-in`),
        source: container.id,
        target: newStep.id,
        ...(placement.arm !== null && { label: placement.arm }),
      },
    ]
    nodes = withWaitArm(ir.nodes, container, placement.arm, null, newStep.id)
  } else {
    const outgoing = ir.edges.filter((edge) => edge.source === anchor!.id)
    if (placement.edgeId === undefined && isArmContainerType(anchor!.type)) {
      return refuse(`Choose which arm of ${anchor!.name} the new ${noun} goes in.`)
    }
    const matching =
      placement.edgeId === undefined ? [] : ir.edges.filter((edge) => edge.id === placement.edgeId)
    const chosen =
      placement.edgeId === undefined ? (outgoing.length > 1 ? undefined : outgoing[0]) : matching[0]

    // The API does not require edge ids to be unique; splicing by an id
    // that names two connections would drop one of them. This applies to the
    // auto-chosen single edge too, not only to an explicitly named one.
    if (chosen !== undefined && ir.edges.filter((edge) => edge.id === chosen.id).length !== 1) {
      return refuse('That connection is not unique in this version.')
    }
    if (placement.edgeId !== undefined) {
      if (!chosen) return refuse('That connection is not in this version any more.')
      if (chosen.source !== anchor!.id) {
        return refuse('That connection does not leave this step.')
      }
      if (waitArmEdgeOverridden(anchor!, chosen, (id) => nodesById.has(id))) {
        return refuse(
          `${anchor!.name}’s ${armName(chosen.label ?? null)} runs another node. Change it on the canvas.`,
        )
      }
    } else if (outgoing.length > 1) {
      return refuse(
        `This step has more than one outgoing connection. Choose where the new ${noun} goes.`,
      )
    }

    // In front of a node: its place (clear, whatever the spacing), and it and
    // what follows move a row down. At the end: a row under the node it follows.
    const ahead = chosen ? nodesById.get(chosen.target) : undefined
    node = build(ahead?.position ? { ...ahead.position } : below(anchor))
    if (!chosen) {
      edges = [
        ...ir.edges,
        {
          id: uniqueEdgeId(usedEdgeIds, `${newStep.id}-out`),
          source: anchor!.id,
          target: newStep.id,
        },
      ]
      // At the end of an arm: what runs after the block makes room.
      if (anchor!.position) {
        nodes = shiftedDown(nodes, ir.edges, afterEnclosingBlocks(nodesById, ir.edges, anchor!.id))
      }
    } else {
      const intoNew: Edge = {
        id: uniqueEdgeId(usedEdgeIds, `${newStep.id}-in`),
        source: chosen.source,
        target: newStep.id,
        ...(chosen.label !== undefined && { label: chosen.label }),
        // Each half keeps the canvas side of the old edge's end it still has.
        ...(chosen.sourceSide && { sourceSide: chosen.sourceSide }),
      }
      const outOfNew: Edge = {
        id: uniqueEdgeId(usedEdgeIds, `${newStep.id}-out`),
        source: newStep.id,
        target: chosen.target,
        ...(chosen.targetSide && { targetSide: chosen.targetSide }),
      }
      // Replace the edge where it sat, so the source's other connections keep
      // their order (a branch's arms, a container's arms).
      edges = ir.edges.flatMap((edge) => (edge.id === chosen.id ? [intoNew, outOfNew] : [edge]))
      nodes = withWaitArm(ir.nodes, anchor!, chosen.label, chosen.target, newStep.id)
      // Room in Y's place: Y and the path after it move a row down, and so
      // does what runs after any block this arm is in.
      if (ahead?.position) {
        nodes = shiftedDown(nodes, ir.edges, [
          chosen.target,
          ...afterEnclosingBlocks(nodesById, ir.edges, anchor!.id),
        ])
      }
    }
  }

  return {
    ok: true,
    ir: { ...ir, nodes: [...nodes, node], edges, entryNodeId },
    node,
  }
}

function armName(label: string | null): string {
  if (label === null) return 'new arm'
  if (label === 'then') return 'way on'
  return `“${label}” arm`
}

/**
 * A wait names each arm's first node twice: on the labelled edge and in its
 * `onEventNode` / `onTimeoutNode` field, which the generated code reads
 * first. When a new node takes an arm's first place (spliced in front of
 * `previousTarget`, or starting the empty arm when that is null), the field
 * follows it — unless it names some other node, the authored choice, which
 * stays. Any other node, or a label that is not a wait arm, comes back as is.
 */
export function followWaitArm(
  container: WorkflowNode,
  label: string | null | undefined,
  previousTarget: NodeId | null,
  newId: NodeId,
): WorkflowNode {
  if (container.type !== 'wait_for_event' || typeof label !== 'string') return container
  const field = Object.hasOwn(WAIT_ARM_FIELDS, label) ? WAIT_ARM_FIELDS[label] : undefined
  if (field === undefined) return container
  const current = container.data[field]
  const unset = typeof current !== 'string' || current === ''
  if (previousTarget !== null && !unset && current !== previousTarget) return container
  return { ...container, data: { ...container.data, [field]: newId } }
}

function withWaitArm(
  nodes: readonly WorkflowNode[],
  container: WorkflowNode,
  label: string | null | undefined,
  previousTarget: NodeId | null,
  newId: NodeId,
): WorkflowNode[] {
  return nodes.map((node) =>
    node.id === container.id ? followWaitArm(node, label, previousTarget, newId) : node,
  )
}

function buildNode(
  id: string,
  name: string,
  code: string,
  position: { x: number; y: number },
  inline: boolean,
): WorkflowNode {
  return {
    id,
    type: 'step',
    name,
    position,
    version: NEW_NODE_VERSION,
    provider: NEW_NODE_PROVIDER,
    // Unset rather than false, as the canvas stores it.
    data: { code, ...(inline && { inline: true }) },
  }
}
