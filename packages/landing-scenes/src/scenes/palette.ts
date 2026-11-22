import { readColor } from '../color.js'
import { KIND_TOKENS, STATUS_TOKENS } from '../card-face.js'
import type { SceneNodeKind } from '../graph.js'
import type { NodeStatus } from '../timeline.js'

export type Rgb = [number, number, number]

/** Every colour and the face the scene paints with, read from the page's tokens on the figure. */
export interface Palette {
  stage: Rgb
  dot: Rgb
  card: Rgb
  cardSide: Rgb
  cardEdge: Rgb
  ink: Rgb
  muted: Rgb
  edge: Rgb
  signal: Rgb
  shadow: Rgb
  kinds: Record<SceneNodeKind, Rgb>
  status: Partial<Record<NodeStatus, Rgb>>
  fontBody: string
}

const SCENE_TOKENS = {
  stage: '--scene-stage',
  dot: '--scene-dot',
  card: '--scene-card',
  cardSide: '--scene-card-side',
  cardEdge: '--scene-card-edge',
  ink: '--scene-ink',
  muted: '--scene-muted',
  edge: '--scene-edge',
  signal: '--color-accent',
  shadow: '--scene-shadow',
} as const

/** Reads the palette from the tokens in effect on `el` (they change with the theme). */
export function readPalette(el: Element): Palette {
  const base = Object.fromEntries(
    Object.entries(SCENE_TOKENS).map(([k, token]) => [k, readColor(el, token)]),
  ) as Record<keyof typeof SCENE_TOKENS, Rgb>
  const kinds = Object.fromEntries(
    Object.entries(KIND_TOKENS).map(([k, token]) => [k, readColor(el, token)]),
  ) as Record<SceneNodeKind, Rgb>
  const status: Partial<Record<NodeStatus, Rgb>> = {}
  for (const [k, token] of Object.entries(STATUS_TOKENS)) {
    status[k as NodeStatus] = readColor(el, token)
  }
  const style = getComputedStyle(el)
  return {
    ...base,
    kinds,
    status,
    fontBody: style.getPropertyValue('--font-body').trim() || 'sans-serif',
  }
}

/** An sRGB 0..1 colour as a CSS colour string for a 2D canvas. */
export function css(rgb: Rgb, alpha = 1): string {
  const [r, g, b] = rgb.map((v) => Math.round(v * 255))
  return alpha >= 1 ? `rgb(${r} ${g} ${b})` : `rgb(${r} ${g} ${b} / ${alpha})`
}
