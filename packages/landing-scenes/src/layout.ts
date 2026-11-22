import type { SceneGraph, SceneNode } from './graph.js'

/** A point in scene space: x across the canvas, y up, z down the flow (toward the camera). */
export type Vec3 = readonly [number, number, number]

/** A node card's size: width across, depth down the flow, height off the canvas. */
export const CARD = { width: 1.22, depth: 0.41, height: 0.078 } as const

const ROW_GAP = 0.74
const LANE_GAP = 1.45

/** Where a node card's centre sits on the canvas, the graph's rows centred on the origin. */
export function nodePosition(node: SceneNode, graph: SceneGraph): Vec3 {
  const rows = Math.max(...graph.nodes.map((n) => n.row))
  return [node.lane * LANE_GAP, CARD.height / 2, (node.row - rows / 2) * ROW_GAP]
}

/** The size (x, z) of the canvas a graph needs, with room around it for the dot grid to fade. */
export function canvasSize(graph: SceneGraph): [number, number] {
  const rows = Math.max(...graph.nodes.map((n) => n.row)) + 1
  return [6.2, rows * ROW_GAP + 2.4]
}

/**
 * An edge between two cards as points `y` above the canvas, routed like the dashboard canvas:
 * straight down out of the source, a right-angle turn (slightly rounded) into a level run at
 * the midpoint, then straight down into the target. Cards side by side on one row get one level
 * connector from side to side.
 */
export function edgePoints(a: Vec3, b: Vec3, y: number): Vec3[] {
  if (Math.abs(b[2] - a[2]) < 1e-6) {
    const dir = Math.sign(b[0] - a[0]) || 1
    return [
      [a[0] + (dir * CARD.width) / 2, y, a[2]],
      [b[0] - (dir * CARD.width) / 2, y, b[2]],
    ]
  }
  const start: Vec3 = [a[0], y, a[2] + CARD.depth / 2]
  const end: Vec3 = [b[0], y, b[2] - CARD.depth / 2]
  const dx = end[0] - start[0]
  if (Math.abs(dx) < 1e-6) return [start, end]
  const mid = (start[2] + end[2]) / 2
  const s = Math.sign(dx)
  const r = Math.min(0.09, Math.abs(dx) / 2, (end[2] - start[2]) / 4)
  const corner = (from: Vec3, via: Vec3, to: Vec3): Vec3[] =>
    Array.from({ length: 7 }, (_, i) => {
      const t = i / 6
      const u = 1 - t
      return [0, 1, 2].map(
        (k) => u * u * from[k] + 2 * u * t * via[k] + t * t * to[k],
      ) as unknown as Vec3
    })
  return [
    start,
    ...corner([start[0], y, mid - r], [start[0], y, mid], [start[0] + s * r, y, mid]),
    ...corner([end[0] - s * r, y, mid], [end[0], y, mid], [end[0], y, mid + r]),
    end,
  ]
}

/** The hero graph's turn on its canvas: 50° clockwise seen from above (three's `rotation.y`). */
export const HERO_YAW = (-50 * Math.PI) / 180

/** Turns a point about the vertical axis through the origin, as three's `rotation.y` does. */
export function rotateY(p: Vec3, angle: number): Vec3 {
  const c = Math.cos(angle)
  const s = Math.sin(angle)
  return [p[0] * c + p[2] * s, p[1], -p[0] * s + p[2] * c]
}

export interface CameraSpec {
  position: Vec3
  target: Vec3
  /** Vertical field of view in degrees. */
  fov: number
}

/**
 * The hero camera: straight on from 45 degrees up with a 20 degree view, centred on the graph.
 * The scene fills the hero like a background video, so narrow frames crop the graph's sides.
 */
export const HERO_CAMERA: CameraSpec = {
  position: [-0.03, 6.123, 6.123],
  target: [-0.03, 0, 0.01],
  fov: 20,
}

/**
 * How far right (scene units) the hero graph sits from centre in a frame of this aspect: on wide
 * frames it moves clear of the hero text, which faces the left; narrow frames keep it centred.
 */
export function heroOffsetX(aspect: number): number {
  return aspect >= 1.6 ? 1.4 : 0
}

/**
 * How far to move a turned graph down the flow (along z) so it sits centred in the hero, top to
 * bottom: the middle of its cards' on-screen extent at the middle of the frame. Only the vertical
 * position matters, and the vertical field of view fixes it, so the frame's width plays no part.
 */
export function heroCentreZ(graph: SceneGraph, cam: CameraSpec, yaw = HERO_YAW): number {
  const H = 1000
  const project = projector(cam, H, H)
  const corners = graph.nodes.flatMap((n) => {
    const [x, y, z] = nodePosition(n, graph)
    return [-1, 1].flatMap((sx) =>
      [-1, 1].map((sz) =>
        rotateY([x + (sx * CARD.width) / 2, y + CARD.height / 2, z + (sz * CARD.depth) / 2], yaw),
      ),
    )
  })
  const middle = (dz: number) => {
    const ys = corners.map((c) => project([c[0], c[1], c[2] + dz])[1])
    return (Math.min(...ys) + Math.max(...ys)) / 2
  }
  // Moving the graph toward the camera moves it down the frame: bisect for the middle.
  let lo = -30
  let hi = 30
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2
    if (middle(mid) < H / 2) lo = mid
    else hi = mid
  }
  return (lo + hi) / 2
}

/**
 * A move of the turned scene root along world z, said in the root's own (turned) coordinates.
 * Adding it to a child's position undoes the root's move, so the child stays where it was on screen.
 */
export function rootShiftInLocal(worldShiftZ: number, yaw = HERO_YAW): Vec3 {
  return rotateY([0, 0, worldShiftZ], -yaw)
}

// ---- projection, for the build-time poster (the scene uses three's camera with the same spec) ----

function sub(a: Vec3, b: Vec3): Vec3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
}
function cross(a: Vec3, b: Vec3): Vec3 {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
}
function norm(a: Vec3): Vec3 {
  const l = Math.hypot(a[0], a[1], a[2]) || 1
  return [a[0] / l, a[1] / l, a[2] / l]
}
function dot(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
}

/**
 * Projects scene points to pixel coordinates for a frame `width` x `height`, matching a three
 * perspective camera set up from `cam`.
 */
export function projector(
  cam: CameraSpec,
  width: number,
  height: number,
): (p: Vec3) => [number, number] {
  const zAxis = norm(sub(cam.position, cam.target))
  const xAxis = norm(cross([0, 1, 0], zAxis))
  const yAxis = cross(zAxis, xAxis)
  const f = 1 / Math.tan((cam.fov * Math.PI) / 360)
  const aspect = width / height
  return (p) => {
    const rel = sub(p, cam.position)
    const x = dot(xAxis, rel)
    const y = dot(yAxis, rel)
    const z = dot(zAxis, rel)
    const ndcX = (f / aspect) * (x / -z)
    const ndcY = f * (y / -z)
    return [(ndcX * 0.5 + 0.5) * width, (1 - (ndcY * 0.5 + 0.5)) * height]
  }
}
