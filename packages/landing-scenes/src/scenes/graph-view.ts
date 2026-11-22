import {
  CanvasTexture,
  CircleGeometry,
  Color,
  CurvePath,
  DoubleSide,
  Group,
  LineCurve3,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  RingGeometry,
  SphereGeometry,
  SRGBColorSpace,
  TubeGeometry,
  Vector3,
  type BufferGeometry,
  type Curve,
} from 'three'
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js'
import type { SceneGraph, SceneNode } from '../graph.js'
import { CARD, edgePoints, nodePosition } from '../layout.js'
import type { NodeStatus, RunFrame } from '../timeline.js'
import { paintCard, paintShadow } from './painter.js'
import type { Palette, Rgb } from './palette.js'

const CLOCK_SEGMENTS = 48
/** Run pulses that can travel at once (parallel arms start together). */
const PULSES = 4

/** Palette colours are sRGB (as the page paints them); three works in linear. */
const rgb = (c: Rgb) => new Color().setRGB(c[0], c[1], c[2], SRGBColorSpace)

/** A card as animations see it: its group, where it rests and its shadow. */
export interface CardHandle {
  id: string
  group: Group
  base: Vector3
  shadow: Mesh<PlaneGeometry, MeshBasicMaterial>
}

interface CardView extends CardHandle {
  node: SceneNode
  body: Mesh<BufferGeometry, MeshStandardMaterial>
  face: Mesh<PlaneGeometry, MeshBasicMaterial>
  canvas: HTMLCanvasElement
  texture: CanvasTexture
  /** The status and attempt the face is painted with, so it repaints only on a change. */
  painted: { status: NodeStatus; attempt: number }
}

interface EdgeView {
  id: string
  curve: Curve<Vector3>
  tube: Mesh<TubeGeometry, MeshBasicMaterial>
  indexCount: number
}

/** The edge as a three curve, on the same points the poster draws. */
function edgeCurve(a: Vector3, b: Vector3, y: number): Curve<Vector3> {
  const points = edgePoints([a.x, a.y, a.z], [b.x, b.y, b.z], y).map((p) => new Vector3(...p))
  const path = new CurvePath<Vector3>()
  for (let i = 1; i < points.length; i++) path.add(new LineCurve3(points[i - 1], points[i]))
  return path
}

/** Where a card's corner marker sits: just inside its top right corner. */
function cornerOf(card: Group, out: Vector3): Vector3 {
  const p = card.position
  return out.set(
    p.x + CARD.width / 2 - 0.04,
    p.y + CARD.height / 2 + 0.02,
    p.z - CARD.depth / 2 + 0.04,
  )
}

/**
 * The canvas graph in 3D: a card per node (its face painted like a dashboard node, repainted
 * when its run state changes), an edge tube per connection, a pulse per travelling run, and the
 * durable effects: the sleep clock, the wait ring and the retry bounce.
 */
export class GraphView {
  readonly group = new Group()
  private cardViews = new Map<string, CardView>()
  private edges: EdgeView[] = []
  private pulses: Mesh<SphereGeometry, MeshBasicMaterial>[] = []
  private clock: Mesh<RingGeometry, MeshBasicMaterial>
  private clockDial: Mesh<CircleGeometry, MeshBasicMaterial>
  private waitRing: Mesh<RingGeometry, MeshBasicMaterial>
  private edgeMaterial: MeshBasicMaterial
  private shadowTexture: CanvasTexture
  private palette: Palette
  private scratch = new Vector3()

  constructor(graph: SceneGraph, palette: Palette) {
    this.palette = palette
    this.shadowTexture = new CanvasTexture(paintShadow(palette))
    this.shadowTexture.colorSpace = SRGBColorSpace
    this.edgeMaterial = new MeshBasicMaterial({ color: rgb(palette.edge) })

    for (const node of graph.nodes) this.addCard(node, graph)
    for (const edge of graph.edges) {
      const a = this.cardViews.get(edge.from)?.base
      const b = this.cardViews.get(edge.to)?.base
      if (!a || !b) continue
      const curve = edgeCurve(a, b, a.y + CARD.height / 2 + 0.004)
      const geometry = new TubeGeometry(curve, 96, 0.014, 8)
      const tube = new Mesh(geometry, this.edgeMaterial)
      this.group.add(tube)
      this.edges.push({ id: edge.id, curve, tube, indexCount: geometry.index?.count ?? 0 })
    }

    const pulseGeometry = new SphereGeometry(0.045, 16, 12)
    const pulseMaterial = new MeshBasicMaterial({ color: rgb(palette.signal) })
    for (let i = 0; i < PULSES; i++) {
      const pulse = new Mesh(pulseGeometry, pulseMaterial)
      pulse.visible = false
      this.pulses.push(pulse)
      this.group.add(pulse)
    }

    this.clockDial = new Mesh(
      new CircleGeometry(CARD.width * 0.1, 40),
      new MeshBasicMaterial({ color: rgb(palette.card), transparent: true, opacity: 0.92 }),
    )
    this.clock = new Mesh(
      new RingGeometry(
        CARD.width * 0.075,
        CARD.width * 0.1,
        CLOCK_SEGMENTS,
        1,
        Math.PI / 2,
        Math.PI * 2,
      ),
      new MeshBasicMaterial({
        color: rgb(palette.status.sleeping ?? palette.signal),
        side: DoubleSide,
      }),
    )
    this.waitRing = new Mesh(
      new RingGeometry(CARD.width * 0.055, CARD.width * 0.07, 40),
      new MeshBasicMaterial({
        color: rgb(palette.status.waiting ?? palette.signal),
        transparent: true,
        side: DoubleSide,
      }),
    )
    for (const m of [this.clockDial, this.clock, this.waitRing]) {
      m.rotation.x = -Math.PI / 2
      m.visible = false
      this.group.add(m)
    }
  }

  private addCard(node: SceneNode, graph: SceneGraph) {
    const [x, y, z] = nodePosition(node, graph)
    const group = new Group()
    group.position.set(x, y, z)
    const body = new Mesh(
      new RoundedBoxGeometry(CARD.width, CARD.height, CARD.depth, 3, 0.03),
      new MeshStandardMaterial({
        color: rgb(this.palette.cardSide),
        roughness: 0.7,
        metalness: 0.05,
      }),
    )
    const canvas = paintCard(node, 'idle', 0, this.palette)
    const texture = new CanvasTexture(canvas)
    texture.colorSpace = SRGBColorSpace
    texture.anisotropy = 8
    const face = new Mesh(
      new PlaneGeometry(CARD.width, CARD.depth),
      new MeshBasicMaterial({ map: texture, transparent: true }),
    )
    face.rotation.x = -Math.PI / 2
    face.position.y = CARD.height / 2 + 0.001
    group.add(body, face)
    const shadow = new Mesh(
      new PlaneGeometry(CARD.width * 1.6, CARD.depth * 2.6),
      new MeshBasicMaterial({ map: this.shadowTexture, transparent: true, depthWrite: false }),
    )
    shadow.rotation.x = -Math.PI / 2
    shadow.position.set(x, y - CARD.height / 2 + 0.003, z + 0.06)
    this.group.add(group, shadow)
    this.cardViews.set(node.id, {
      id: node.id,
      node,
      group,
      base: new Vector3(x, y, z),
      shadow,
      body,
      face,
      canvas,
      texture,
      painted: { status: 'idle', attempt: 0 },
    })
  }

  /** Every card, for animations that move whole cards (the rearrange between use cases). */
  cards(): CardHandle[] {
    return [...this.cardViews.values()]
  }

  /** Shows one moment of the run: card faces, lifts, the clock and wait ring, edges and pulses. */
  update({ nodes, edges }: RunFrame, time: number) {
    let clockOn = false
    let waitOn = false
    for (const card of this.cardViews.values()) {
      const f = nodes[card.id]
      if (!f) continue
      if (f.status !== card.painted.status || f.attempt !== card.painted.attempt) {
        paintCard(card.node, f.status, f.attempt, this.palette, card.canvas)
        card.texture.needsUpdate = true
        card.painted = { status: f.status, attempt: f.attempt }
      }
      let lift = 0
      if (f.status === 'running') lift = 0.05
      if (f.status === 'retrying') lift = 0.05 + Math.abs(Math.sin(f.progress * Math.PI * 2)) * 0.16
      if (f.status === 'waiting') lift = 0.03
      card.group.position.set(card.base.x, card.base.y + lift, card.base.z)
      card.shadow.material.opacity = Math.max(0.35, 1 - lift * 3)
      card.face.material.opacity = f.status === 'sleeping' ? 0.55 : f.status === 'skipped' ? 0.5 : 1

      if (f.status === 'sleeping') {
        clockOn = true
        const segments = Math.max(1, Math.round(f.progress * CLOCK_SEGMENTS))
        this.clock.geometry.setDrawRange(0, segments * 6)
        cornerOf(card.group, this.clock.position)
        this.clockDial.position.copy(this.clock.position).setY(this.clock.position.y - 0.004)
      }
      if (f.status === 'waiting') {
        waitOn = true
        const beat = (time * 1.3) % 1
        cornerOf(card.group, this.waitRing.position)
        this.waitRing.scale.setScalar(1 + beat * 0.8)
        this.waitRing.material.opacity = (1 - beat) * 0.6
      }
    }
    this.clock.visible = clockOn
    this.clockDial.visible = clockOn
    this.waitRing.visible = waitOn

    let pulseIndex = 0
    for (const edge of this.edges) {
      const f = edges[edge.id]
      if (!f) continue
      const count = Math.floor((edge.indexCount * f.drawn) / 3) * 3
      edge.tube.geometry.setDrawRange(0, count)
      edge.tube.visible = count > 0
      if (f.pulse !== null && pulseIndex < this.pulses.length) {
        const pulse = this.pulses[pulseIndex++]
        edge.curve.getPointAt(Math.min(0.999, f.pulse), this.scratch)
        pulse.position.copy(this.scratch).setY(this.scratch.y + 0.03)
        pulse.visible = true
      }
    }
    for (; pulseIndex < this.pulses.length; pulseIndex++) this.pulses[pulseIndex].visible = false
  }

  /** Frees every geometry, material and texture the view made (shared ones once). */
  dispose() {
    const geometries = new Set<BufferGeometry>()
    const materials = new Set<MeshBasicMaterial | MeshStandardMaterial>()
    this.group.traverse((o) => {
      if (!(o instanceof Mesh)) return
      geometries.add(o.geometry)
      for (const m of Array.isArray(o.material) ? o.material : [o.material]) materials.add(m)
    })
    for (const g of geometries) g.dispose()
    for (const m of materials) {
      if (m instanceof MeshBasicMaterial) m.map?.dispose()
      m.dispose()
    }
    this.shadowTexture.dispose()
  }
}
