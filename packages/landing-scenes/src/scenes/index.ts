import { USE_CASES } from '../use-cases.js'
import { HeroScene } from './hero-scene.js'
import { host } from './host.js'
import { readPalette } from './palette.js'

/** The hero plays slower than its recorded runs' own pace, so each step reads. */
const HERO_SPEED = 0.45

/**
 * Mounts the hero scene on `figure`: its `[data-scene-stage]` element (which holds the poster)
 * receives the canvas. The scene plays each use case's run once, rearranging into the next, and
 * stops on the last one's finished run. The palette is read once from the page. Returns a
 * handle to tear it down.
 */
export interface HeroHandle {
  destroy(): void
}

export async function mountHeroScene(figure: HTMLElement): Promise<HeroHandle> {
  const stage = figure.querySelector<HTMLElement>('[data-scene-stage]')
  if (!stage) throw new Error('hero figure has no [data-scene-stage]')
  // Card faces are painted with the page's font: wait for it, or the first faces use a fallback.
  await document.fonts?.ready

  let index = 0
  let time = 0
  let finished = false
  const model = new HeroScene(USE_CASES[index], readPalette(figure))
  const tick = (dt: number) => {
    if (model.rearranging) return 0
    time = Math.min(USE_CASES[index].length, time + dt * HERO_SPEED)
    if (time < USE_CASES[index].length) return time
    if (index === USE_CASES.length - 1) {
      finished = true
      return time
    }
    index += 1
    model.rearrangeTo(USE_CASES[index])
    time = 0
    return time
  }
  const view = host(stage, model, tick, () => finished)

  return {
    destroy() {
      view.destroy()
    },
  }
}
