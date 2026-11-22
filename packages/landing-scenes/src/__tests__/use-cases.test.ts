import { describe, expect, it } from 'vitest'
import { FACE } from '../card-face.js'
import { USE_CASES, useCaseFrame } from '../use-cases.js'

describe.each(USE_CASES.map((u) => [u.id, u] as const))('use case %s', (_, useCase) => {
  const ids = new Set(useCase.graph.nodes.map((n) => n.id))

  it('connects only nodes that exist, with unique edge ids', () => {
    for (const e of useCase.graph.edges) {
      expect(ids.has(e.from), e.id).toBe(true)
      expect(ids.has(e.to), e.id).toBe(true)
    }
    expect(new Set(useCase.graph.edges.map((e) => e.id)).size).toBe(useCase.graph.edges.length)
  })

  it('records a run for every node', () => {
    for (const n of useCase.graph.nodes) expect(useCase.spans[n.id], n.id).toBeDefined()
  })

  it('names every step short enough to show in full on its card', () => {
    for (const n of useCase.graph.nodes)
      expect(n.name.length, n.name).toBeLessThanOrEqual(FACE.name.chars)
  })

  it('starts with every node idle and ends with every node done or not taken', () => {
    const first = useCaseFrame(useCase, 0)
    for (const f of Object.values(first.nodes))
      expect(f.status === 'idle' || f.status === 'skipped').toBe(true)
    const last = useCaseFrame(useCase, useCase.length)
    for (const f of Object.values(last.nodes)) expect(['done', 'skipped']).toContain(f.status)
  })

  it('finishes its run before its length, so the finished run holds on screen', () => {
    const ends = Object.values(useCase.spans)
      .flatMap((s) => s.map((x) => x.to))
      .filter(Number.isFinite)
    expect(Math.max(...ends)).toBeLessThan(useCase.length)
  })

  it('draws every edge in full while it plays', () => {
    const frame = useCaseFrame(useCase, useCase.length / 2)
    for (const e of useCase.graph.edges) expect(frame.edges[e.id].drawn).toBe(1)
  })
})
