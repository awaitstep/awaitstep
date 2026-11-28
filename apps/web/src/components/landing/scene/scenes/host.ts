import { SRGBColorSpace, WebGLRenderer, type PerspectiveCamera, type Scene } from 'three'

/** What the host renders: a scene, its camera, and how it advances and refits. */
export interface SceneModel {
  readonly scene: Scene
  readonly camera: PerspectiveCamera
  /** Advances to `time` (seconds of the model's own clock); `dt` is real seconds since the last frame. */
  update(time: number, dt: number): void
  /** Refits to a stage of this aspect (width over height). */
  resize(aspect: number): void
  dispose(): void
}

/**
 * Renders `model` into `stage` while the stage is on screen and the tab is visible. The canvas
 * goes in front of the stage's poster and the stage gets `is-live`; if the WebGL context is
 * lost the canvas comes out and the poster shows again. `tick` turns real seconds into the
 * model's time; once `done` returns true the last frame stays on screen and rendering stops for
 * good. Returns `destroy`, which stops rendering and frees everything.
 */
export function host(
  stage: HTMLElement,
  model: SceneModel,
  tick: (dt: number) => number,
  done: () => boolean = () => false,
): { destroy(): void } {
  const renderer = new WebGLRenderer({
    antialias: true,
    alpha: true,
    // A decorative background: let the browser pick the GPU (on a dual-GPU laptop, the low-power one).
    powerPreference: 'default',
  })
  renderer.outputColorSpace = SRGBColorSpace
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1))
  const canvas = renderer.domElement
  canvas.setAttribute('aria-hidden', 'true')
  canvas.className = 'scene-canvas'

  let onScreen = false
  let lost = false
  let raf = 0
  let last = 0

  const redraw = () => {
    if (!lost) renderer.render(model.scene, model.camera)
  }

  const fit = () => {
    const { clientWidth: w, clientHeight: h } = stage
    if (!w || !h) return
    renderer.setSize(w, h, false)
    model.resize(w / h)
    // Resizing clears the canvas: a finished scene draws its last frame once more.
    if (done()) redraw()
  }

  const frame = (now: number) => {
    raf = 0
    const dt = Math.min(0.1, (now - last) / 1000)
    last = now
    model.update(tick(dt), dt)
    renderer.render(model.scene, model.camera)
    schedule()
  }

  function schedule() {
    const run = onScreen && !lost && !document.hidden && !done()
    if (run && !raf) {
      if (!last) last = performance.now()
      raf = requestAnimationFrame(frame)
    } else if (!run && raf) {
      cancelAnimationFrame(raf)
      raf = 0
    }
    // Coming back after a pause should not jump the clock by the time away.
    if (!run) last = 0
  }

  const onLost = (e: Event) => {
    e.preventDefault()
    lost = true
    stage.classList.remove('is-live')
    canvas.remove()
    schedule()
  }
  canvas.addEventListener('webglcontextlost', onLost)
  document.addEventListener('visibilitychange', schedule)

  const io = new IntersectionObserver(([entry]) => {
    onScreen = entry.isIntersecting
    schedule()
  })
  io.observe(stage)
  const ro = new ResizeObserver(fit)
  ro.observe(stage)

  stage.prepend(canvas)
  fit()
  stage.classList.add('is-live')

  const destroy = () => {
    io.disconnect()
    ro.disconnect()
    document.removeEventListener('visibilitychange', schedule)
    canvas.removeEventListener('webglcontextlost', onLost)
    if (raf) cancelAnimationFrame(raf)
    stage.classList.remove('is-live')
    canvas.remove()
    model.dispose()
    // dispose() frees three's resources but not the GL context; browsers cap live contexts (about
    // 16), so release it now rather than when the canvas is garbage collected.
    renderer.forceContextLoss()
    renderer.dispose()
  }
  return { destroy }
}
