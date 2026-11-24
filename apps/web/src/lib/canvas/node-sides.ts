/**
 * Canvas node sides: entries on the top and left, exits on the bottom and
 * right (board 31b). An edge a person drew by dragging keeps the sides they
 * used (the IR edge's `sourceSide` / `targetSide`); any other edge's sides are
 * worked out from where its two nodes sit.
 */

export type EntrySide = 'top' | 'left'
export type ExitSide = 'bottom' | 'right'
export type NodeSide = EntrySide | ExitSide

/** React Flow handle ids, one per side. */
export const HANDLE_ID: Record<NodeSide, string> = {
  top: 'in-top',
  left: 'in-left',
  bottom: 'out-bottom',
  right: 'out-right',
}

/**
 * The size a node is taken to be before React Flow has measured it (board
 * 31a, a little smaller): 220px wide, and as tall as a node with its config
 * line (about 52px without one), so a spot judged free is free whichever it turns out to be.
 */
export const NODE_WIDTH = 220
export const NODE_HEIGHT = 80

export interface NodeBox {
  x: number
  y: number
  width: number
  height: number
}

interface PositionedNode {
  position: { x: number; y: number }
  measured?: { width?: number; height?: number }
  width?: number
  height?: number
}

export function nodeBox(node: PositionedNode): NodeBox {
  return {
    x: node.position.x,
    y: node.position.y,
    width: node.measured?.width ?? node.width ?? NODE_WIDTH,
    height: node.measured?.height ?? node.height ?? NODE_HEIGHT,
  }
}

/**
 * The sides an edge leaves and enters by. A target that starts past the
 * source's right edge, and not wholly below it, sits beside it: right → left.
 * Anything else reads as further down the flow: bottom → top.
 */
export function edgeSides(source: NodeBox, target: NodeBox): { exit: ExitSide; entry: EntrySide } {
  const beside = target.x >= source.x + source.width && target.y < source.y + source.height
  return beside ? { exit: 'right', entry: 'left' } : { exit: 'bottom', entry: 'top' }
}

/**
 * The sides of `nodeId` some drawn edge uses, read from the handles the edges
 * were given (see `withEdgeSides`), so the dots always match the lines.
 */
export function usedSides(
  nodeId: string,
  edges: readonly {
    source: string
    target: string
    sourceHandle?: string | null
    targetHandle?: string | null
  }[],
): Set<NodeSide> {
  const used = new Set<NodeSide>()
  for (const edge of edges) {
    const side =
      edge.source === nodeId
        ? exitSideOf(edge.sourceHandle ?? HANDLE_ID.bottom)
        : edge.target === nodeId
          ? entrySideOf(edge.targetHandle ?? HANDLE_ID.top)
          : undefined
    if (side) used.add(side)
  }
  return used
}

const EXIT_OF_HANDLE: Record<string, ExitSide> = {
  [HANDLE_ID.bottom]: 'bottom',
  [HANDLE_ID.right]: 'right',
}
const ENTRY_OF_HANDLE: Record<string, EntrySide> = {
  [HANDLE_ID.top]: 'top',
  [HANDLE_ID.left]: 'left',
}

/** The exit side a handle id names, or undefined for anything else (an entry, a stray id). */
export function exitSideOf(handle: string | null | undefined): ExitSide | undefined {
  return handle && Object.hasOwn(EXIT_OF_HANDLE, handle) ? EXIT_OF_HANDLE[handle] : undefined
}

/** The entry side a handle id names, or undefined for anything else. */
export function entrySideOf(handle: string | null | undefined): EntrySide | undefined {
  return handle && Object.hasOwn(ENTRY_OF_HANDLE, handle) ? ENTRY_OF_HANDLE[handle] : undefined
}

/**
 * An IR edge's chosen sides as React Flow handle ids, for the store. The
 * sides may come from an unchecked document (a legacy save, a pasted
 * clipboard), so anything but a real side is dropped.
 */
export function pinnedHandles(edge: { sourceSide?: unknown; targetSide?: unknown }): {
  sourceHandle?: string
  targetHandle?: string
} {
  const exit = edge.sourceSide === 'bottom' || edge.sourceSide === 'right' ? edge.sourceSide : null
  const entry = edge.targetSide === 'top' || edge.targetSide === 'left' ? edge.targetSide : null
  return {
    ...(exit && { sourceHandle: HANDLE_ID[exit] }),
    ...(entry && { targetHandle: HANDLE_ID[entry] }),
  }
}

/** A store edge's pinned handles as IR sides, for saving. */
export function pinnedSides(edge: { sourceHandle?: string | null; targetHandle?: string | null }): {
  sourceSide?: ExitSide
  targetSide?: EntrySide
} {
  const sourceSide = exitSideOf(edge.sourceHandle)
  const targetSide = entrySideOf(edge.targetHandle)
  return { ...(sourceSide && { sourceSide }), ...(targetSide && { targetSide }) }
}

/**
 * `edge` arriving at `target` instead. The entry side it had picked belonged
 * to the old target, so it goes; its exit side stays. Every writer that
 * re-points an edge goes through here (codegen's graph edits follow the same
 * rule for `targetSide`).
 */
export function retargetEdge<E extends { target: string; targetHandle?: string | null }>(
  edge: E,
  target: string,
): E {
  if (edge.target === target) return edge
  const { targetHandle: _targetHandle, ...rest } = edge
  return { ...rest, target } as E
}

/**
 * `edges` with a handle on each end: the one a person picked, kept as it is,
 * or else the one the nodes' positions call for. Edges to a missing node are
 * left as they are.
 */
export function withEdgeSides<
  E extends {
    source: string
    target: string
    sourceHandle?: string | null
    targetHandle?: string | null
  },
>(nodes: readonly (PositionedNode & { id: string })[], edges: readonly E[]): E[] {
  const boxes = new Map(nodes.map((n) => [n.id, nodeBox(n)]))
  return edges.map((edge) => {
    const source = boxes.get(edge.source)
    const target = boxes.get(edge.target)
    if (!source || !target) return edge
    const { exit, entry } = edgeSides(source, target)
    return {
      ...edge,
      sourceHandle: HANDLE_ID[exitSideOf(edge.sourceHandle) ?? exit],
      targetHandle: HANDLE_ID[entrySideOf(edge.targetHandle) ?? entry],
    }
  })
}
