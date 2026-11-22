import { describe, expect, it, vi } from 'vitest'
import { sceneSupport } from '../capability'

interface Fake {
  reducedMotion?: boolean
  saveData?: boolean
  deviceMemory?: number
  cores?: number
  webgl2?: boolean
}

/** A window with just what sceneSupport reads. */
function fakeWindow(f: Fake = {}) {
  const loseContext = vi.fn()
  const getContext = vi.fn(() =>
    f.webgl2 === false ? null : { getExtension: () => ({ loseContext }) },
  )
  const win = {
    matchMedia: (q: string) => ({ matches: q.includes('reduce') && !!f.reducedMotion }),
    navigator: {
      connection: { saveData: !!f.saveData },
      deviceMemory: f.deviceMemory,
      hardwareConcurrency: f.cores,
    },
    document: { createElement: () => ({ getContext }) },
  }
  return { win: win as unknown as Window, getContext, loseContext }
}

describe('sceneSupport', () => {
  it('runs the scene on a capable browser, and releases its probe context', () => {
    const { win, getContext, loseContext } = fakeWindow()
    expect(sceneSupport(win)).toEqual({ ok: true })
    expect(getContext).toHaveBeenCalledWith('webgl2', { failIfMajorPerformanceCaveat: true })
    expect(loseContext).toHaveBeenCalled()
  })

  it('keeps the poster for reduced motion, before probing anything', () => {
    const { win, getContext } = fakeWindow({ reducedMotion: true })
    expect(sceneSupport(win)).toEqual({ ok: false, reason: 'reduced-motion' })
    expect(getContext).not.toHaveBeenCalled()
  })

  it('keeps the poster with data saver on', () => {
    expect(sceneSupport(fakeWindow({ saveData: true }).win)).toEqual({
      ok: false,
      reason: 'save-data',
    })
  })

  it.each([
    ['little memory', { deviceMemory: 2 }],
    ['few cores', { cores: 2 }],
  ])('keeps the poster on a low-power device (%s)', (_, f) => {
    expect(sceneSupport(fakeWindow(f).win)).toEqual({ ok: false, reason: 'low-power' })
  })

  it('assumes a capable device when the browser hides memory and cores', () => {
    expect(sceneSupport(fakeWindow({ deviceMemory: undefined, cores: undefined }).win).ok).toBe(
      true,
    )
  })

  it('keeps the poster without WebGL2', () => {
    expect(sceneSupport(fakeWindow({ webgl2: false }).win)).toEqual({
      ok: false,
      reason: 'no-webgl2',
    })
  })
})
