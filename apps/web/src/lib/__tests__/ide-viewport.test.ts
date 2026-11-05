import { describe, expect, it } from 'vitest'
import { isRectVisible } from '../ide/viewport'

const panel = { width: 400, height: 300 }
const rect = { x: 100, y: 50, width: 120, height: 40 }

describe('isRectVisible', () => {
  it('is true for a node fully inside the panel', () => {
    expect(isRectVisible(rect, { x: 0, y: 0, zoom: 1 }, panel)).toBe(true)
  })

  it('is false for a node past the edge, or only partly in', () => {
    expect(isRectVisible({ ...rect, x: 350 }, { x: 0, y: 0, zoom: 1 }, panel)).toBe(false)
    expect(isRectVisible({ ...rect, y: 290 }, { x: 0, y: 0, zoom: 1 }, panel)).toBe(false)
  })

  it('accounts for the pan offset', () => {
    // Panned 200px left: the node at x=100 is now off the left edge.
    expect(isRectVisible(rect, { x: -200, y: 0, zoom: 1 }, panel)).toBe(false)
    expect(isRectVisible({ ...rect, x: 300 }, { x: -200, y: 0, zoom: 1 }, panel)).toBe(true)
  })

  it('accounts for zoom', () => {
    // At 0.5 zoom the 400px panel shows 800 flow units.
    expect(isRectVisible({ ...rect, x: 600 }, { x: 0, y: 0, zoom: 0.5 }, panel)).toBe(true)
    expect(isRectVisible({ ...rect, x: 600 }, { x: 0, y: 0, zoom: 1 }, panel)).toBe(false)
  })

  it('is false for a viewport with no zoom rather than dividing by it', () => {
    expect(isRectVisible(rect, { x: 0, y: 0, zoom: 0 }, panel)).toBe(false)
  })
})
