import { clip, FACE, statusLine } from '../card-face.js'
import { GLYPHS, type GlyphName } from '../glyphs.js'
import type { SceneNode } from '../graph.js'
import type { NodeStatus } from '../timeline.js'
import { css, type Palette, type Rgb } from './palette.js'

/** Texture pixels per face pixel: crisp on a 2x screen at the hero's size. */
const FACE_SCALE = 3

function canvas2d(width: number, height: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas')
  c.width = width
  c.height = height
  const ctx = c.getContext('2d')
  if (!ctx) throw new Error('2d canvas unavailable')
  return [c, ctx]
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  ctx.beginPath()
  ctx.roundRect(x, y, w, h, r)
}

function drawGlyph(
  ctx: CanvasRenderingContext2D,
  name: GlyphName,
  x: number,
  y: number,
  size: number,
  color: string,
  width = 2,
) {
  ctx.save()
  ctx.translate(x, y)
  ctx.scale(size / 24, size / 24)
  ctx.strokeStyle = color
  ctx.lineWidth = width
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  for (const d of GLYPHS[name]) ctx.stroke(new Path2D(d))
  ctx.restore()
}

const STATUS_GLYPH: Partial<Record<NodeStatus, GlyphName>> = {
  done: 'done',
  failed: 'failed',
  retrying: 'retry',
}

/** Paints a canvas node's face in a run state. Returns the canvas the texture wraps. */
export function paintCard(
  node: SceneNode,
  status: NodeStatus,
  attempt: number,
  p: Palette,
  target?: HTMLCanvasElement,
): HTMLCanvasElement {
  const s = FACE_SCALE
  const [c, ctx] = target
    ? [target, target.getContext('2d') as CanvasRenderingContext2D]
    : canvas2d(FACE.width * s, FACE.height * s)
  ctx.setTransform(s, 0, 0, s, 0, 0)
  ctx.clearRect(0, 0, FACE.width, FACE.height)

  const tint: Rgb | undefined = p.status[status]
  const kind = p.kinds[node.kind]
  roundRect(ctx, 1, 1, FACE.width - 2, FACE.height - 2, FACE.radius)
  ctx.fillStyle = css(p.card)
  ctx.fill()
  ctx.lineWidth = tint ? 2.5 : 1.25
  ctx.strokeStyle = tint ? css(tint) : css(p.cardEdge)
  ctx.stroke()

  const t = FACE.tile
  roundRect(ctx, t.x, t.y, t.size, t.size, t.radius)
  ctx.fillStyle = css(kind, 0.18)
  ctx.fill()
  drawGlyph(
    ctx,
    node.kind,
    t.x + (t.size - t.icon) / 2,
    t.y + (t.size - t.icon) / 2,
    t.icon,
    css(kind),
  )

  ctx.fillStyle = css(p.ink, status === 'skipped' ? 0.45 : 1)
  ctx.font = `${FACE.name.weight} ${FACE.name.size}px ${p.fontBody}`
  ctx.textBaseline = 'alphabetic'
  ctx.fillText(clip(node.name, FACE.name.chars), FACE.name.x, FACE.name.y)

  const mark = STATUS_GLYPH[status]
  if (mark && tint) drawGlyph(ctx, mark, FACE.width - 30, 14, 16, css(tint), 2.4)

  ctx.fillStyle = css(p.cardEdge)
  ctx.fillRect(1, FACE.rule.y, FACE.width - 2, 1)

  const line = statusLine(node, status, attempt)
  if (line) {
    ctx.fillStyle = tint ? css(tint) : css(p.muted)
    ctx.font = `500 ${FACE.detail.size}px ${p.fontBody}`
    ctx.fillText(clip(line, FACE.detail.chars), FACE.detail.x, FACE.detail.y)
  }
  return c
}

/**
 * The canvas: the dashboard's dot grid, fading out toward its edges so it reads as an
 * open canvas, not a slab. `aspect` is width over depth.
 */
export function paintDotGrid(p: Palette, aspect = 3): HTMLCanvasElement {
  // Large enough that a dot stays a crisp disc at the hero's size on a 2x screen.
  // Capped near 4k on the long side, so a wide canvas does not cost a huge texture.
  const h = aspect > 1.5 ? 1024 : 2048
  const w = Math.round(h * aspect)
  const [c, ctx] = canvas2d(w, h)
  const step = h / 64
  const r = step * 0.05
  ctx.fillStyle = css(p.dot)
  for (let y = step / 2; y < h; y += step) {
    for (let x = step / 2; x < w; x += step) {
      ctx.beginPath()
      ctx.arc(x, y, r, 0, Math.PI * 2)
      ctx.fill()
    }
  }
  // Fade: keep the middle, dissolve every edge (one pass across, one along).
  ctx.globalCompositeOperation = 'destination-in'
  const across = ctx.createLinearGradient(0, 0, w, 0)
  const along = ctx.createLinearGradient(0, 0, 0, h)
  for (const g of [across, along]) {
    g.addColorStop(0, css(p.dot, 0))
    g.addColorStop(0.22, css(p.dot, 1))
    g.addColorStop(0.78, css(p.dot, 1))
    g.addColorStop(1, css(p.dot, 0))
  }
  ctx.fillStyle = across
  ctx.fillRect(0, 0, w, h)
  ctx.fillStyle = along
  ctx.fillRect(0, 0, w, h)
  ctx.globalCompositeOperation = 'source-over'
  return c
}

/** A soft contact shadow, laid flat under a card. */
export function paintShadow(p: Palette): HTMLCanvasElement {
  const [c, ctx] = canvas2d(256, 128)
  ctx.filter = 'blur(14px)'
  ctx.fillStyle = css(p.shadow, 0.55)
  roundRect(ctx, 40, 32, 176, 64, 18)
  ctx.fill()
  return c
}
