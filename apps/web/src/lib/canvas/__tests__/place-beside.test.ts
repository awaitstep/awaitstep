import { describe, expect, it } from 'vitest'
import { placeBeside } from '../place-beside'

const size = { width: 248, height: 64 }
const size80 = { width: 220, height: 80 }
const anchor = { x: 120, y: 120, ...size80 }

describe('placeBeside', () => {
  it('places one grid-aligned step out on each side', () => {
    expect(placeBeside(anchor, 'bottom', size80, [])).toEqual({ x: 120, y: 280 })
    expect(placeBeside(anchor, 'right', size80, [])).toEqual({ x: 440, y: 120 })
    expect(placeBeside(anchor, 'top', size80, [])).toEqual({ x: 120, y: -40 })
    expect(placeBeside(anchor, 'left', size80, [])).toEqual({ x: -200, y: 120 })
  })

  it('fans a taken spot below out to the right, as siblings sit', () => {
    const taken = { x: 120, y: 280, ...size80 }
    expect(placeBeside(anchor, 'bottom', size80, [taken])).toEqual({ x: 440, y: 280 })
  })

  it('moves a taken spot beside down', () => {
    const taken = { x: 440, y: 120, ...size80 }
    expect(placeBeside(anchor, 'right', size80, [taken])).toEqual({ x: 440, y: 280 })
  })

  it('lands where it covers no node', () => {
    const others = [
      { x: 120, y: 280, ...size80 },
      { x: 440, y: 280, ...size80 },
    ]
    expect(placeBeside(anchor, 'bottom', size80, others)).toEqual({ x: 760, y: 280 })
  })

  it('snaps to the 40px grid whatever the measured size', () => {
    const odd = { x: 0, y: 0, width: 248, height: 64 }
    const at = placeBeside(odd, 'bottom', size, [])
    expect(at.x % 40).toBe(0)
    expect(at.y % 40).toBe(0)
    expect(
      Object.is(placeBeside({ x: 0, y: 0, ...size80 }, 'top', { width: 220, height: 0 }, []).x, 0),
    ).toBe(true)
  })

  // Regression: the step was rounded up but the spot snapped back down, so
  // from an anchor off the grid the gap shrank to about 60px.
  it('keeps the full gap from an anchor off the grid', () => {
    const off = { x: 19, y: 19, width: 200, height: 80 }
    const right = placeBeside(off, 'right', size80, [])
    const below = placeBeside(off, 'bottom', size80, [])
    const left = placeBeside(off, 'left', size80, [])
    const above = placeBeside(off, 'top', size80, [])
    expect(right.x - (off.x + off.width)).toBeGreaterThanOrEqual(80)
    expect(below.y - (off.y + off.height)).toBeGreaterThanOrEqual(80)
    expect(off.x - (left.x + size80.width)).toBeGreaterThanOrEqual(80)
    expect(off.y - (above.y + size80.height)).toBeGreaterThanOrEqual(80)
    for (const at of [right, below, left, above]) {
      expect(Number.isInteger(at.x / 40) && Number.isInteger(at.y / 40)).toBe(true)
    }
  })
})
