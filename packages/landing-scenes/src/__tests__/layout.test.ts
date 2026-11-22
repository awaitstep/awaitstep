import { PerspectiveCamera, Vector3 } from 'three'
import { describe, expect, it } from 'vitest'
import {
  CARD,
  edgePoints,
  HERO_CAMERA,
  HERO_YAW,
  heroCentreZ,
  rootShiftInLocal,
  heroOffsetX,
  nodePosition,
  projector,
  rotateY,
  type CameraSpec,
  type Vec3,
} from '../layout.js'
import { USE_CASES } from '../use-cases.js'

/** The pixel three puts `p` at, with the camera set up as the hero scene sets it up. */
function threePixel(cam: CameraSpec, w: number, h: number, p: Vec3): [number, number] {
  const aspect = w / h
  const camera = new PerspectiveCamera(cam.fov, aspect, 0.1, 100)
  camera.position.set(...cam.position)
  camera.lookAt(new Vector3(...cam.target))
  camera.updateMatrixWorld()
  camera.updateProjectionMatrix()
  const v = new Vector3(...p).project(camera)
  return [(v.x * 0.5 + 0.5) * w, (1 - (v.y * 0.5 + 0.5)) * h]
}

describe('projector', () => {
  it.each([
    ['wide', 1440, 540],
    ['tall', 390, 760],
  ] as const)('puts points where three puts them (%s frame)', (_, w, h) => {
    const cam = HERO_CAMERA
    const project = projector(cam, w, h)
    for (const p of [
      [0, 0, 0],
      [1.2, 0.04, -1.5],
      [-2, 0, 1.8],
    ] as Vec3[]) {
      const [x, y] = project(p)
      const [tx, ty] = threePixel(cam, w, h, p)
      expect(x).toBeCloseTo(tx, 3)
      expect(y).toBeCloseTo(ty, 3)
    }
  })
})

describe('rootShiftInLocal', () => {
  // The rearrange moves the turned root along world z; an old card offset by this must not move
  // on screen (it used to jump by about 0.85 of the shift, up to a fifth of a card's width).
  it.each([0.15, -0.31, 1.2])(
    'keeps a child where it was when the root moves %s along z',
    (shift) => {
      const base: [number, number, number] = [0.7, 0.2, -1.4]
      const world = (local: [number, number, number], rootZ: number) => {
        const [x, y, z] = rotateY(local, HERO_YAW)
        return [x, y, z + rootZ]
      }
      const fromZ = 0.4
      const toZ = fromZ - shift
      const [lx, ly, lz] = rootShiftInLocal(shift)
      const before = world(base, fromZ)
      const after = world([base[0] + lx, base[1] + ly, base[2] + lz], toZ)
      after.forEach((v, i) => expect(v).toBeCloseTo(before[i], 10))
    },
  )
})

describe('heroCentreZ', () => {
  it.each(USE_CASES.map((u) => [u.id, u.graph] as const))(
    'centres %s top to bottom in the frame',
    (_, graph) => {
      for (const aspect of [1440 / 540, 16 / 9]) {
        const cam = HERO_CAMERA
        const H = 1000
        const project = projector(cam, H * aspect, H)
        const dz = heroCentreZ(graph, cam)
        const ys = graph.nodes.flatMap((n) => {
          const [x, y, z] = nodePosition(n, graph)
          return [-1, 1].flatMap((sx) =>
            [-1, 1].map((sz) => {
              const [rx, ry, rz] = rotateY(
                [x + (sx * CARD.width) / 2, y + CARD.height / 2, z + (sz * CARD.depth) / 2],
                HERO_YAW,
              )
              return project([rx, ry, rz + dz])[1]
            }),
          )
        })
        expect((Math.min(...ys) + Math.max(...ys)) / 2).toBeCloseTo(H / 2, 0)
        // The scene is a full-bleed background: it may crop at the edges, but never by much.
        expect(Math.min(...ys)).toBeGreaterThan(-0.05 * H)
        expect(Math.max(...ys)).toBeLessThan(1.05 * H)
      }
    },
  )
})

describe('heroOffsetX', () => {
  it('moves the graph right of the text on wide frames and keeps it centred on narrow ones', () => {
    expect(heroOffsetX(1440 / 540)).toBeGreaterThan(0)
    expect(heroOffsetX(390 / 760)).toBe(0)
  })
})

describe('edgePoints', () => {
  const y = 0.1

  it('runs straight down from the bottom of one card to the top of the next', () => {
    const pts = edgePoints([0, 0, 0], [0, 0, 1], y)
    expect(pts).toEqual([
      [0, y, CARD.depth / 2],
      [0, y, 1 - CARD.depth / 2],
    ])
  })

  it('turns at right angles into a level run halfway when the cards are offset', () => {
    const pts = edgePoints([0, 0, 0], [1, 0, 1], y)
    expect(pts[0]).toEqual([0, y, CARD.depth / 2])
    expect(pts[pts.length - 1]).toEqual([1, y, 1 - CARD.depth / 2])
    const level = pts.filter((p) => Math.abs(p[2] - 0.5) < 1e-9)
    expect(level.length).toBeGreaterThanOrEqual(2)
    for (const p of pts) expect(p[1]).toBeCloseTo(y, 9)
  })

  it('joins cards side by side on one row from side to side', () => {
    expect(edgePoints([0, 0, 0], [2, 0, 0], y)).toEqual([
      [CARD.width / 2, y, 0],
      [2 - CARD.width / 2, y, 0],
    ])
  })
})
