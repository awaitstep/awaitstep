export interface FlowRect {
  x: number
  y: number
  width: number
  height: number
}

export interface FlowViewport {
  x: number
  y: number
  zoom: number
}

/**
 * Whether a node sits fully inside what the panel currently shows. The
 * viewport is React Flow's: `x` and `y` are the screen offset of the flow's
 * origin, so the visible flow area starts at `-x / zoom`.
 */
export function isRectVisible(
  rect: FlowRect,
  viewport: FlowViewport,
  panel: { width: number; height: number },
): boolean {
  if (viewport.zoom <= 0) return false
  const left = -viewport.x / viewport.zoom
  const top = -viewport.y / viewport.zoom
  const right = left + panel.width / viewport.zoom
  const bottom = top + panel.height / viewport.zoom
  return (
    rect.x >= left &&
    rect.y >= top &&
    rect.x + rect.width <= right &&
    rect.y + rect.height <= bottom
  )
}

/** The slice of React Flow's internal node the pan reads. */
export interface InternalNodeBox {
  measured: { width?: number; height?: number }
  internals: { positionAbsolute: { x: number; y: number } }
}

/**
 * Where a node is in flow space, or null until it has been measured. This
 * reads the internal node: `getNode` returns the node as the app supplied it,
 * which never carries a size here because the preview does not own one.
 */
export function internalNodeRect(node: InternalNodeBox | undefined): FlowRect | null {
  const width = node?.measured.width
  const height = node?.measured.height
  if (!node || width === undefined || height === undefined) return null
  const { x, y } = node.internals.positionAbsolute
  return { x, y, width, height }
}
