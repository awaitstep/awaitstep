import { describe, expect, it } from 'vitest'
import { edgePulse, spanFrame, type Span } from '../timeline.js'

const run: Span[] = [{ status: 'running', from: 1, to: 2 }]
const retried: Span[] = [
  { status: 'running', from: 1, to: 2, attempt: 1 },
  { status: 'failed', from: 2, to: 3, attempt: 1 },
  { status: 'running', from: 3, to: 4, attempt: 2 },
]

describe('spanFrame', () => {
  it('is idle before the first span, in the span while inside it, and done after the last', () => {
    expect(spanFrame(run, 0.5).status).toBe('idle')
    expect(spanFrame(run, 1.5)).toEqual({ status: 'running', progress: 0.5, attempt: 1 })
    expect(spanFrame(run, 2)).toEqual({ status: 'done', progress: 1, attempt: 1 })
  })

  it('carries the attempt through a retry and finishes on the last attempt', () => {
    expect(spanFrame(retried, 2.5)).toMatchObject({ status: 'failed', attempt: 1 })
    expect(spanFrame(retried, 3.5)).toMatchObject({ status: 'running', attempt: 2 })
    expect(spanFrame(retried, 9)).toMatchObject({ status: 'done', attempt: 2 })
  })

  it('treats a node with no spans as skipped', () => {
    expect(spanFrame(undefined, 5).status).toBe('skipped')
    expect(spanFrame([], 5).status).toBe('skipped')
  })
})

describe('edgePulse', () => {
  const next: Span[] = [{ status: 'running', from: 3, to: 4 }]

  it('travels from the source finishing to the target starting', () => {
    expect(edgePulse(run, next, 1.9)).toBeNull()
    expect(edgePulse(run, next, 2)).toBe(0)
    expect(edgePulse(run, next, 2.5)).toBeCloseTo(0.5)
    expect(edgePulse(run, next, 3)).toBeNull()
  })

  it('leaves just before the target starts when the target starts right away', () => {
    const immediate: Span[] = [{ status: 'running', from: 2, to: 3 }]
    expect(edgePulse(run, immediate, 1.7)).not.toBeNull()
  })

  it('sends nothing from a failed or skipped source, or into a skipped arm', () => {
    const failed: Span[] = [{ status: 'failed', from: 1, to: 2 }]
    const skipped: Span[] = [{ status: 'skipped', from: 2, to: Number.POSITIVE_INFINITY }]
    expect(edgePulse(failed, next, 2.5)).toBeNull()
    expect(edgePulse(skipped, next, 2.5)).toBeNull()
    expect(edgePulse(run, skipped, 1.9)).toBeNull()
    expect(edgePulse(undefined, next, 2.5)).toBeNull()
  })
})
