import { clip, FACE, KIND_TOKENS } from './card-face.js'
import { GLYPHS, type GlyphName } from './glyphs.js'
import type { SceneGraph } from './graph.js'
import {
  CARD,
  edgePoints,
  nodePosition,
  projector,
  rotateY,
  type CameraSpec,
  type Vec3,
} from './layout.js'

export interface PosterOptions {
  graph: SceneGraph
  /** The SVG's accessible name: a one-line description of what the diagram shows. */
  title: string
  camera: CameraSpec
  width: number
  height: number
  /** Turn the graph about the vertical axis (radians, three's convention). */
  yaw?: number
  /** Move the turned graph on the canvas, as the live scene moves its graph group. */
  offset?: Vec3
  /** Extra class on the <svg>, to show one poster per breakpoint. */
  className?: string
}

type Project = (p: Vec3) => [number, number]

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const fmt = (n: number) => (Math.round(n * 100) / 100).toString()
const pts = (list: [number, number][]) => list.map(([x, y]) => `${fmt(x)},${fmt(y)}`).join(' ')

/** The side of a card facing the camera, as a screen polygon. */
function frontFace(project: Project, c: Vec3): [number, number][] {
  const top = c[1] + CARD.height / 2
  const bottom = c[1] - CARD.height / 2
  const z = c[2] + CARD.depth / 2
  const l = c[0] - CARD.width / 2
  const r = c[0] + CARD.width / 2
  return [
    project([l, top, z]),
    project([r, top, z]),
    project([r, bottom, z]),
    project([l, bottom, z]),
  ]
}

/** An affine map from the face's own pixel space onto the card's projected top. */
function faceMatrix(project: Project, c: Vec3): string {
  const y = c[1] + CARD.height / 2
  const p0 = project([c[0] - CARD.width / 2, y, c[2] - CARD.depth / 2])
  const pu = project([c[0] + CARD.width / 2, y, c[2] - CARD.depth / 2])
  const pv = project([c[0] - CARD.width / 2, y, c[2] + CARD.depth / 2])
  const m = [
    (pu[0] - p0[0]) / FACE.width,
    (pu[1] - p0[1]) / FACE.width,
    (pv[0] - p0[0]) / FACE.height,
    (pv[1] - p0[1]) / FACE.height,
    p0[0],
    p0[1],
  ]
  return `matrix(${m.map(fmt).join(' ')})`
}

function glyph(name: GlyphName, x: number, y: number, size: number): string {
  const paths = GLYPHS[name].map((d) => `<path d="${d}"/>`).join('')
  return `<g class="pst-icon" transform="translate(${fmt(x)} ${fmt(y)}) scale(${fmt(size / 24)})">${paths}</g>`
}

function cardFace(node: SceneGraph['nodes'][number]): string {
  const t = FACE.tile
  return [
    `<rect class="pst-card" width="${FACE.width}" height="${FACE.height}" rx="${FACE.radius}"/>`,
    `<g style="--kind: var(${KIND_TOKENS[node.kind]})">`,
    `<rect class="pst-tile" x="${t.x}" y="${t.y}" width="${t.size}" height="${t.size}" rx="${t.radius}"/>`,
    glyph(node.kind, t.x + (t.size - t.icon) / 2, t.y + (t.size - t.icon) / 2, t.icon),
    `</g>`,
    `<text class="pst-name" x="${FACE.name.x}" y="${FACE.name.y}">${esc(clip(node.name, FACE.name.chars))}</text>`,
    `<line class="pst-rule" x1="0" x2="${FACE.width}" y1="${FACE.rule.y}" y2="${FACE.rule.y}"/>`,
    node.detail
      ? `<text class="pst-detail" x="${FACE.detail.x}" y="${FACE.detail.y}">${esc(clip(node.detail, FACE.detail.chars))}</text>`
      : '',
  ].join('')
}

/**
 * The hero's first frame as a static SVG, drawn from the same layout and camera as the live
 * scene: the server-rendered image before the scene loads, and the view without WebGL or with
 * reduced motion.
 */
export function graphPosterSvg(opts: PosterOptions): string {
  const { graph, width, height } = opts
  const straight = projector(opts.camera, width, height)
  const yaw = opts.yaw ?? 0
  const [ox, oy, oz] = opts.offset ?? [0, 0, 0]
  // Turn first, then move: the live scene turns its graph group and moves it on the canvas.
  const project: Project = (p) => {
    const [x, y, z] = rotateY(p, yaw)
    return straight([x + ox, y + oy, z + oz])
  }
  const byId = new Map(graph.nodes.map((n) => [n.id, n]))
  const out: string[] = []
  for (const edge of graph.edges) {
    const from = byId.get(edge.from)
    const to = byId.get(edge.to)
    if (!from || !to) continue
    const a = nodePosition(from, graph)
    const b = nodePosition(to, graph)
    out.push(
      `<polyline class="pst-edge" points="${pts(edgePoints(a, b, a[1] + CARD.height / 2).map(project))}"/>`,
    )
  }
  for (const node of graph.nodes) {
    const c = nodePosition(node, graph)
    out.push(
      `<polygon class="pst-card-side" points="${pts(frontFace(project, c))}"/>`,
      `<g transform="${faceMatrix(project, c)}">${cardFace(node)}</g>`,
    )
  }
  const cls = opts.className ? ` ${opts.className}` : ''
  return `<svg class="scene-poster${cls}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${esc(opts.title)}" xmlns="http://www.w3.org/2000/svg">${out.join('')}</svg>`
}
