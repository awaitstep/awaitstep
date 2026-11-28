import { useEffect, useRef } from 'react'
import {
  HERO_CAMERA,
  HERO_YAW,
  REFUND_REVIEW,
  graphPosterSvg,
  heroCentreZ,
  heroOffsetX,
  sceneSupport,
} from './scene'

const POSTER_TITLE =
  'The refund-review workflow on the AwaitStep canvas: fetch the order, branch on the amount, wait for approval, refund and notify in parallel, sleep three days, send a follow-up.'

const SUMMARY =
  'Workflows on the AwaitStep canvas, each playing one run: a refund review that waits for approval, retries a failed refund and sleeps three days; an order that is charged and routed; a request that waits for a human decision.'

/**
 * The scene's first frame, drawn from the same layout and camera as the live scene, once per shape
 * of stage: wide stages set the graph to the right of the text (heroOffsetX), narrow ones (phones,
 * portrait tablets, under 1.6 wide) centre it, so the live scene fades in where the poster was.
 */
const posterFor = (width: number, height: number, className: string) =>
  graphPosterSvg({
    graph: REFUND_REVIEW,
    title: POSTER_TITLE,
    camera: HERO_CAMERA,
    width,
    height,
    yaw: HERO_YAW,
    offset: [heroOffsetX(width / height), 0, heroCentreZ(REFUND_REVIEW, HERO_CAMERA)],
    className,
  })
const POSTERS =
  posterFor(1440, 540, 'scene-poster--wide') + posterFor(900, 1000, 'scene-poster--narrow')

/**
 * The landing hero's background: real workflows playing their runs in 3D (three.js, loaded only
 * when the browser can run it). The still poster shows first, and stays for reduced motion, data
 * saver, low-power devices and browsers without WebGL2.
 */
export function HeroScene({ className }: { className?: string }) {
  const figure = useRef<HTMLElement>(null)

  // Mounting a WebGL scene is a side effect on the DOM after paint, and it must be torn down.
  useEffect(() => {
    const el = figure.current
    if (!el || !sceneSupport().ok) return
    let cancelled = false
    let destroy: (() => void) | undefined
    import('./scene/scenes')
      .then(async ({ mountHeroScene }) => {
        if (cancelled) return
        const scene = await mountHeroScene(el)
        if (cancelled) scene.destroy()
        else destroy = () => scene.destroy()
      })
      // A stale chunk after a deploy, or a WebGL context the browser refuses: the poster is
      // already showing and stays, so there is nothing to report.
      .catch(() => undefined)
    return () => {
      cancelled = true
      destroy?.()
    }
  }, [])

  return (
    <figure ref={figure} className={className} data-scene="hero">
      <div
        className="scene__stage"
        data-scene-stage
        dangerouslySetInnerHTML={{ __html: POSTERS }}
      />
      <figcaption className="sr-only">{SUMMARY}</figcaption>
    </figure>
  )
}
