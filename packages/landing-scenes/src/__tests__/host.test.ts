// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const renderer = vi.hoisted(() => ({
  domElement: undefined as unknown as HTMLCanvasElement,
  outputColorSpace: '',
  setPixelRatio: vi.fn(),
  setSize: vi.fn(),
  render: vi.fn(),
  dispose: vi.fn(),
  forceContextLoss: vi.fn(),
}))
vi.mock('three', () => ({
  SRGBColorSpace: 'srgb',
  WebGLRenderer: vi.fn(function () {
    renderer.domElement = document.createElement('canvas')
    return renderer
  }),
}))

import { host, type SceneModel } from '../scenes/host'

let frames: FrameRequestCallback[] = []
let onIntersect: ((entries: { isIntersecting: boolean }[]) => void) | undefined

beforeEach(() => {
  frames = []
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => frames.push(cb))
  vi.stubGlobal('cancelAnimationFrame', (id: number) => {
    frames[id - 1] = () => undefined
  })
  vi.stubGlobal(
    'IntersectionObserver',
    class {
      constructor(cb: typeof onIntersect) {
        onIntersect = cb
      }
      observe() {}
      disconnect() {}
    },
  )
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      disconnect() {}
    },
  )
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.clearAllMocks()
  document.body.innerHTML = ''
})

function model(): SceneModel {
  return {
    scene: {} as SceneModel['scene'],
    camera: {} as SceneModel['camera'],
    update: vi.fn(),
    resize: vi.fn(),
    dispose: vi.fn(),
  }
}

const pending = () => frames.filter((f) => f.toString() !== '() => undefined').length

describe('host', () => {
  it('renders only while the stage is on screen', () => {
    const stage = document.createElement('div')
    host(stage, model(), (dt) => dt)
    expect(stage.classList.contains('is-live')).toBe(true)
    expect(frames).toHaveLength(0)
    onIntersect?.([{ isIntersecting: true }])
    expect(frames).toHaveLength(1)
    frames[0](16)
    expect(renderer.render).toHaveBeenCalledTimes(1)
    onIntersect?.([{ isIntersecting: false }])
    expect(pending()).toBe(1)
  })

  it('stops for good once the scene is done', () => {
    let finished = false
    host(
      document.createElement('div'),
      model(),
      (dt) => dt,
      () => finished,
    )
    onIntersect?.([{ isIntersecting: true }])
    finished = true
    frames[0](16)
    expect(frames).toHaveLength(1)
  })

  it('pauses while the tab is hidden', () => {
    host(document.createElement('div'), model(), (dt) => dt)
    Object.defineProperty(document, 'hidden', { configurable: true, value: true })
    onIntersect?.([{ isIntersecting: true }])
    expect(frames).toHaveLength(0)
    Object.defineProperty(document, 'hidden', { configurable: true, value: false })
    document.dispatchEvent(new Event('visibilitychange'))
    expect(frames).toHaveLength(1)
  })

  it('gives the poster back when the WebGL context is lost', () => {
    const stage = document.createElement('div')
    host(stage, model(), (dt) => dt)
    renderer.domElement.dispatchEvent(new Event('webglcontextlost', { cancelable: true }))
    expect(stage.classList.contains('is-live')).toBe(false)
    expect(stage.contains(renderer.domElement)).toBe(false)
  })

  it('frees the model, the renderer and its GL context on destroy', () => {
    const m = model()
    const stage = document.createElement('div')
    const { destroy } = host(stage, m, (dt) => dt)
    destroy()
    expect(m.dispose).toHaveBeenCalled()
    expect(renderer.forceContextLoss).toHaveBeenCalled()
    expect(renderer.dispose).toHaveBeenCalled()
    expect(stage.classList.contains('is-live')).toBe(false)
  })
})
