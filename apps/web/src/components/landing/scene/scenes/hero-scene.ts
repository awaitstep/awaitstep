import {
  CanvasTexture,
  Color,
  DirectionalLight,
  Group,
  HemisphereLight,
  Mesh,
  MeshBasicMaterial,
  PerspectiveCamera,
  PlaneGeometry,
  Scene,
  SRGBColorSpace,
  Vector3,
} from 'three'
import {
  canvasSize,
  heroCentreZ,
  heroOffsetX,
  HERO_CAMERA,
  HERO_YAW,
  rootShiftInLocal,
} from '../layout.js'
import { useCaseFrame, type UseCase } from '../use-cases.js'
import { GraphView } from './graph-view.js'
import { paintDotGrid } from './painter.js'
import type { Palette, Rgb } from './palette.js'

/** Palette colours are sRGB (as the page paints them); three works in linear. */
const rgb = (c: Rgb) => new Color().setRGB(c[0], c[1], c[2], SRGBColorSpace)

/** Seconds: the old edges retracting, each card's move, the gap between cards starting, the new edges drawing in. */
const RETRACT = 0.5
const MOVE = 1.1
const STAGGER = 0.07
const DRAW = 0.5

const clamp01 = (x: number) => (x <= 0 ? 0 : x >= 1 ? 1 : x)
const easeInOut = (x: number) => {
  const c = clamp01(x)
  return c < 0.5 ? 4 * c * c * c : 1 - Math.pow(-2 * c + 2, 3) / 2
}

/** Node ids top to bottom, left to right: the order cards pair up in a rearrange. */
const readingOrder = (useCase: UseCase) =>
  [...useCase.graph.nodes].sort((a, b) => a.row - b.row || a.lane - b.lane).map((n) => n.id)

interface Rearrange {
  t: number
  from: GraphView
  to: GraphView
  next: UseCase
  fromRootZ: number
  toRootZ: number
}

/**
 * The hero: one use case's graph at a time on a still dot-grid canvas, playing its run. Between
 * use cases the canvas rearranges: the finished run's edges retract, every card glides and
 * flips into its place in the next graph (spare cards shrink away, extra ones grow in), then the
 * new edges draw in.
 */
export class HeroScene {
  readonly scene = new Scene()
  readonly camera = new PerspectiveCamera(HERO_CAMERA.fov, 16 / 9, 0.1, 100)
  private root = new Group()
  private view: GraphView
  private grid: Mesh<PlaneGeometry, MeshBasicMaterial>
  private rearrange: Rearrange | null = null

  constructor(
    private useCase: UseCase,
    private palette: Palette,
  ) {
    const hemi = new HemisphereLight(rgb(palette.ink), rgb(palette.stage), 1.6)
    const key = new DirectionalLight(rgb(palette.ink), 1.4)
    key.position.set(-4, 9, 6)
    this.scene.add(hemi, key, this.root)

    const [w, d] = canvasSize(useCase.graph)
    const texture = new CanvasTexture(paintDotGrid(palette, w / d))
    texture.colorSpace = SRGBColorSpace
    texture.anisotropy = 8
    this.grid = new Mesh(
      new PlaneGeometry(w, d),
      new MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false }),
    )
    this.grid.rotation.x = -Math.PI / 2
    this.scene.add(this.grid)

    this.root.rotation.y = HERO_YAW
    this.view = new GraphView(useCase.graph, palette)
    this.root.add(this.view.group)
    this.root.position.z = heroCentreZ(useCase.graph, HERO_CAMERA, HERO_YAW)
    this.resize(16 / 9)
  }

  /** True while the canvas is rearranging for the next use case. */
  get rearranging(): boolean {
    return this.rearrange !== null
  }

  /** Starts the rearrange into `next`; `update` plays it until it lands. */
  rearrangeTo(next: UseCase) {
    const to = new GraphView(next.graph, this.palette)
    to.group.visible = false
    this.root.add(to.group)
    this.rearrange = {
      t: 0,
      from: this.view,
      to,
      next,
      fromRootZ: this.root.position.z,
      toRootZ: heroCentreZ(next.graph, HERO_CAMERA, HERO_YAW),
    }
  }

  /** `time` is seconds into the current use case's run; during a rearrange it is ignored. */
  update(time: number, dt: number) {
    if (this.rearrange) this.playRearrange(this.rearrange, dt)
    else this.view.update(useCaseFrame(this.useCase, time), time)
  }

  private playRearrange(r: Rearrange, dt: number) {
    r.t += dt

    // 1. The finished run's edges retract.
    const finished = useCaseFrame(this.useCase, this.useCase.length)
    const retract = 1 - clamp01(r.t / RETRACT)
    for (const e of Object.values(finished.edges)) {
      e.drawn = retract
      e.pulse = null
    }
    r.from.update(finished, 0)
    if (r.t < RETRACT) return

    // 2. Cards pair up in reading order and glide, old cards placed relative to the new root.
    // The root is turned, so its move along world z is undone in its own coordinates.
    const moveT = r.t - RETRACT
    this.root.position.z = r.toRootZ
    const [shiftX, , shiftZ] = rootShiftInLocal(r.fromRootZ - r.toRootZ, HERO_YAW)
    r.to.group.visible = true
    const fromCards = new Map(r.from.cards().map((c) => [c.id, c]))
    const toCards = new Map(r.to.cards().map((c) => [c.id, c]))
    const fromOrder = readingOrder(this.useCase)
    const toOrder = readingOrder(r.next)
    const pairs = Math.max(fromOrder.length, toOrder.length)

    // The new graph's faces and edges first; the card poses below override its positions.
    const landed: Record<string, number> = {}
    const poses: (() => void)[] = []
    for (let i = 0; i < pairs; i++) {
      const p = easeInOut((moveT - i * STAGGER) / MOVE)
      const oldCard = fromCards.get(fromOrder[i])
      const newCard = toCards.get(toOrder[i])
      const start = oldCard
        ? new Vector3(oldCard.base.x + shiftX, oldCard.base.y, oldCard.base.z + shiftZ)
        : (newCard?.base.clone() ?? new Vector3())
      const end = newCard ? newCard.base : start
      const pos = start.clone().lerp(end, p)
      pos.y += Math.sin(p * Math.PI) * 0.35
      if (oldCard) {
        oldCard.group.position.copy(pos)
        oldCard.group.rotation.x = p * Math.PI
        oldCard.group.visible = newCard ? p < 0.5 : p < 1
        oldCard.group.scale.setScalar(newCard ? 1 : 1 - p)
        oldCard.shadow.visible = false
      }
      if (newCard) {
        landed[newCard.id] = p
        poses.push(() => {
          newCard.group.position.copy(pos)
          newCard.group.rotation.x = (p - 1) * Math.PI
          newCard.group.visible = oldCard ? p >= 0.5 : p > 0
          newCard.group.scale.setScalar(oldCard ? 1 : p)
          newCard.shadow.visible = p >= 1
        })
      }
    }

    // 3. The new edges draw in once both of their ends have landed.
    const drawT = clamp01((moveT - MOVE - (pairs - 1) * STAGGER) / DRAW)
    const start = useCaseFrame(r.next, 0)
    for (const e of r.next.graph.edges) {
      const both = Math.min(landed[e.from] ?? 0, landed[e.to] ?? 0) >= 1
      start.edges[e.id] = { drawn: both ? drawT : 0, pulse: null }
    }
    r.to.update(start, 0)
    for (const pose of poses) pose()

    if (drawT >= 1) {
      this.root.remove(r.from.group)
      r.from.dispose()
      for (const c of toCards.values()) {
        c.group.rotation.x = 0
        c.group.scale.setScalar(1)
      }
      this.view = r.to
      this.useCase = r.next
      this.rearrange = null
    }
  }

  /** Fits the camera to a stage of this aspect (width over height) and moves the graph aside. */
  resize(aspect: number) {
    this.root.position.x = heroOffsetX(aspect)
    this.grid.position.x = this.root.position.x
    this.camera.aspect = aspect
    this.camera.fov = HERO_CAMERA.fov
    this.camera.position.set(...HERO_CAMERA.position)
    this.camera.lookAt(new Vector3(...HERO_CAMERA.target))
    this.camera.updateProjectionMatrix()
  }

  dispose() {
    this.rearrange?.to.dispose()
    this.view.dispose()
    this.grid.geometry.dispose()
    this.grid.material.map?.dispose()
    this.grid.material.dispose()
  }
}
