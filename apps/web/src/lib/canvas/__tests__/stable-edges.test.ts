import { describe, expect, it } from 'vitest'
import { reuseUnchanged } from '../stable-edges'

const edge = (id: string, extra: Record<string, unknown> = {}) => ({
  id,
  source: 'a',
  target: 'b',
  sourceHandle: 'out-bottom',
  ...extra,
})

describe('reuseUnchanged', () => {
  it('returns the previous array when no edge changed, even if rebuilt', () => {
    const prev = [edge('e1'), edge('e2', { data: { hovered: true } })]
    const next = [edge('e1'), edge('e2', { data: { hovered: true } })]
    expect(reuseUnchanged(prev, next)).toBe(prev)
  })

  it('keeps the unchanged edges’ objects and takes the changed one', () => {
    const prev = [edge('e1'), edge('e2')]
    const moved = edge('e2', { sourceHandle: 'out-right' })
    const out = reuseUnchanged(prev, [edge('e1'), moved])
    expect(out).not.toBe(prev)
    expect(out[0]).toBe(prev[0])
    expect(out[1]).toBe(moved)
  })

  it('notices an edge added, removed or reordered', () => {
    const prev = [edge('e1'), edge('e2')]
    expect(reuseUnchanged(prev, [edge('e1')])).not.toBe(prev)
    expect(reuseUnchanged(prev, [edge('e2'), edge('e1')])).not.toBe(prev)
    expect(reuseUnchanged(prev, [...prev, edge('e3')])).not.toBe(prev)
  })
})
