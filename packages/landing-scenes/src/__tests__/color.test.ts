import { afterEach, describe, expect, it, vi } from 'vitest'

afterEach(() => {
  vi.unstubAllGlobals()
  vi.resetModules()
})

/** A 2d context that "paints" whatever rgb() it is given, the way the browser resolves a colour. */
function stubCanvas() {
  let fill = ''
  const ctx = {
    clearRect: vi.fn(),
    fillRect: vi.fn(),
    set fillStyle(v: string) {
      fill = v
    },
    getImageData: () => {
      const [r, g, b] = (/rgb\((\d+), (\d+), (\d+)\)/.exec(fill) ?? [0, 0, 0, 0])
        .slice(1)
        .map(Number)
      return { data: [r, g, b, 255] }
    },
  }
  vi.stubGlobal('document', { createElement: () => ({ getContext: () => ctx }) })
  return ctx
}

describe('readColor', () => {
  it('reads a custom property and resolves it to sRGB 0..1', async () => {
    stubCanvas()
    vi.stubGlobal('getComputedStyle', () => ({ getPropertyValue: () => ' rgb(255, 0, 51) ' }))
    const { readColor } = await import('../color')
    const [r, g, b] = readColor({} as Element, '--scene-card')
    expect(r).toBe(1)
    expect(g).toBe(0)
    expect(b).toBeCloseTo(0.2)
  })

  it('throws, naming the token, when the page has no such colour', async () => {
    stubCanvas()
    vi.stubGlobal('getComputedStyle', () => ({ getPropertyValue: () => '' }))
    const { readColor } = await import('../color')
    expect(() => readColor({} as Element, '--scene-missing')).toThrow(
      'missing colour token --scene-missing',
    )
  })
})
