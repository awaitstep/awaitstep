import { describe, expect, it } from 'vitest'
import {
  INLINE_BELOW_PX,
  currentReviewPath,
  effectiveSideBySide,
  reviewOrder,
  reviewPathAfterLeaving,
  reviewSummary,
  stepReviewPath,
} from '../ide/review'

describe('review order', () => {
  it('sorts by path so the order does not jump while typing', () => {
    expect(reviewOrder(new Set(['lib/z.ts', 'a.ts', 'lib/b.ts']))).toEqual([
      'a.ts',
      'lib/b.ts',
      'lib/z.ts',
    ])
  })

  it('shows the requested file while it is unsaved, else the first', () => {
    const order = ['a.ts', 'b.ts']
    expect(currentReviewPath(order, 'b.ts')).toBe('b.ts')
    expect(currentReviewPath(order, 'gone.ts')).toBe('a.ts')
    expect(currentReviewPath(order, null)).toBe('a.ts')
    expect(currentReviewPath([], 'a.ts')).toBeNull()
  })

  it('keeps showing a requested file that is no longer unsaved while it exists', () => {
    const order = ['b.ts']
    expect(currentReviewPath(order, 'a.ts', (path) => path === 'a.ts')).toBe('a.ts')
    expect(currentReviewPath(order, 'a.ts', () => false)).toBe('b.ts')
  })

  it('steps from a file with no changes to the nearest end of the list', () => {
    expect(stepReviewPath(['b.ts', 'c.ts'], 'a.ts', 1)).toBe('b.ts')
    expect(stepReviewPath(['b.ts', 'c.ts'], 'a.ts', -1)).toBe('c.ts')
    expect(stepReviewPath([], 'a.ts', 1)).toBeNull()
  })

  it('moves to the file that slid into place, else the one before, once a file leaves', () => {
    expect(reviewPathAfterLeaving(['a.ts', 'b.ts', 'c.ts'], 'b.ts')).toBe('c.ts')
    expect(reviewPathAfterLeaving(['a.ts', 'b.ts'], 'b.ts')).toBe('a.ts')
    expect(reviewPathAfterLeaving(['a.ts'], 'a.ts')).toBeNull()
  })

  it('steps between files, wrapping, and has nowhere to go with one', () => {
    const order = ['a.ts', 'b.ts', 'c.ts']
    expect(stepReviewPath(order, 'c.ts', 1)).toBe('a.ts')
    expect(stepReviewPath(order, 'a.ts', -1)).toBe('c.ts')
    expect(stepReviewPath(['a.ts'], 'a.ts', 1)).toBeNull()
  })
})

describe('layout', () => {
  it('goes inline below 1,100 px and stays side by side from there', () => {
    expect(effectiveSideBySide(false, INLINE_BELOW_PX - 1)).toBe(false)
    expect(effectiveSideBySide(false, INLINE_BELOW_PX)).toBe(true)
  })

  it('honours the person choosing inline, and treats an unmeasured width as wide', () => {
    expect(effectiveSideBySide(true, 2000)).toBe(false)
    expect(effectiveSideBySide(false, null)).toBe(true)
  })
})

describe('reviewSummary', () => {
  it('counts the file and the changes', () => {
    expect(reviewSummary(0, 2, 2)).toBe('file 1 of 2 · 2 changes')
    expect(reviewSummary(1, 2, 1)).toBe('file 2 of 2 · 1 change')
    expect(reviewSummary(0, 2, null)).toBe('file 1 of 2')
  })
})
