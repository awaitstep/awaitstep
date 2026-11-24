import type { NodeBox, NodeSide } from './node-sides'

/** The canvas's snap grid: nodes dragged or added with a + land on it. */
export const CANVAS_GRID = 40

/** Space between a node and one added beside it: whole grid steps. */
export const PLACE_GAP_X = 80
export const PLACE_GAP_Y = 80

const ceilGrid = (v: number) => Math.ceil(v / CANVAS_GRID) * CANVAS_GRID + 0
const floorGrid = (v: number) => Math.floor(v / CANVAS_GRID) * CANVAS_GRID + 0

function snap(value: number): number {
  // `+ 0` turns a rounded -0 into 0.
  return Math.round(value / CANVAS_GRID) * CANVAS_GRID + 0
}

function overlaps(a: NodeBox, b: NodeBox): boolean {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height
}

/**
 * Where a node added from `anchor`'s `side` lands: one step out on that side,
 * on the canvas grid, moved across until it covers no other node.
 */
export function placeBeside(
  anchor: NodeBox,
  side: NodeSide,
  size: { width: number; height: number },
  others: readonly NodeBox[],
): { x: number; y: number } {
  // The near edge goes on the first grid line at least a gap away, so the gap
  // never shrinks below its size — even from an anchor off the grid. The other
  // axis lines up with the anchor, snapped.
  const first: { x: number; y: number } = {
    right: { x: ceilGrid(anchor.x + anchor.width + PLACE_GAP_X), y: snap(anchor.y) },
    left: { x: floorGrid(anchor.x - PLACE_GAP_X - size.width), y: snap(anchor.y) },
    bottom: { x: snap(anchor.x), y: ceilGrid(anchor.y + anchor.height + PLACE_GAP_Y) },
    top: { x: snap(anchor.x), y: floorGrid(anchor.y - PLACE_GAP_Y - size.height) },
  }[side]
  // A taken spot fans out across the direction of travel, as siblings do:
  // below → further right, beside → further down.
  const across =
    side === 'left' || side === 'right'
      ? { dx: 0, dy: ceilGrid(size.height + PLACE_GAP_Y) }
      : { dx: ceilGrid(size.width + PLACE_GAP_X), dy: 0 }

  let box: NodeBox = { ...first, ...size }
  // Bounded: a canvas has far fewer nodes than this, so a free spot is always found.
  for (let i = 0; i < 200 && others.some((o) => overlaps(box, o)); i++) {
    box = { x: box.x + across.dx, y: box.y + across.dy, ...size }
  }
  return { x: box.x, y: box.y }
}
