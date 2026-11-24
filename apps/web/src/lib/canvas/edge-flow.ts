import { MarkerType, type EdgeMarker } from '@xyflow/react'

/** A link at rest. */
export const EDGE_COLOR = 'var(--muted-foreground)'
/**
 * A link that is hovered or selected — the colour styles.css gives a selected
 * link's path, so the line, its arrow and its label agree. Colours here are
 * space-free CSS variables: React Flow builds each arrow's element id from its
 * colour, and an id with spaces is not found by every browser.
 */
export const EDGE_HIGHLIGHT_COLOR = 'var(--primary-ink)'

// One marker object per colour: React Flow draws one arrow definition for
// each, and the canvas reuses edge objects only while their fields are equal.
const markers = new Map<string, EdgeMarker>()

/**
 * The arrowhead at a link's target end, in `color`. Sized in the canvas's own
 * units rather than the link's stroke width, so a thin link and a highlighted
 * thick one get the same arrow (it still scales with zoom).
 */
export function arrowMarker(color: string): EdgeMarker {
  let marker = markers.get(color)
  if (!marker) {
    marker = {
      type: MarkerType.ArrowClosed,
      color,
      width: 18,
      height: 18,
      markerUnits: 'userSpaceOnUse',
    }
    markers.set(color, marker)
  }
  return marker
}

/** The colour a link is drawn in, which its arrow takes too. */
export function edgeColor(state: { highlighted: boolean; containerColor?: string }): string {
  if (state.highlighted) return EDGE_HIGHLIGHT_COLOR
  return state.containerColor ?? EDGE_COLOR
}

/**
 * The links that show moving dashes: those into and out of a node in focus
 * (selected or hovered), and, during a run, those into a step that is running.
 * Every link flowing at once would be noise; these say where things go next.
 */
export function flowingEdgeIds(
  edges: readonly { id: string; source: string; target: string }[],
  focusNodeIds: readonly (string | null | undefined)[],
  runningNodeIds: ReadonlySet<string>,
): Set<string> {
  const focus = new Set(focusNodeIds.filter((id): id is string => !!id))
  const flowing = new Set<string>()
  for (const edge of edges) {
    if (focus.has(edge.source) || focus.has(edge.target) || runningNodeIds.has(edge.target)) {
      flowing.add(edge.id)
    }
  }
  return flowing
}

/** The steps a run overlay shows as running; none while no run is shown. */
export function runningNodeIds(
  active: boolean,
  statuses: Readonly<Record<string, string>>,
): Set<string> {
  if (!active) return new Set()
  return new Set(Object.keys(statuses).filter((id) => statuses[id] === 'running'))
}

/**
 * `edges` with an arrow on each, in its container colour or `color`, and
 * moving dashes on the ones in `flowing`. For the read-only previews, which
 * have no hover or selection highlight.
 */
export function withFlow<E extends { id: string; data?: Record<string, unknown> }>(
  edges: readonly E[],
  flowing: ReadonlySet<string> = new Set(),
  color: string = EDGE_COLOR,
): E[] {
  return edges.map((edge) => {
    const containerColor = edge.data?.containerColor
    const tint = typeof containerColor === 'string' ? containerColor : color
    return { ...edge, markerEnd: arrowMarker(tint), animated: flowing.has(edge.id) }
  })
}
