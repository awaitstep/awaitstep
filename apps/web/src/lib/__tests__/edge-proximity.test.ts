import { describe, it, expect } from 'vitest'
import { findNearestEdge, projectPointOnSegment } from '../edge-proximity'
import type { Edge, Node } from '@xyflow/react'

describe('projectPointOnSegment', () => {
  it('projects a point directly on the line', () => {
    const result = projectPointOnSegment(
      { x: 5, y: 0 },
      { x: 0, y: 0 },
      { x: 10, y: 0 },
    )
    expect(result.distance).toBeCloseTo(0)
    expect(result.point.x).toBeCloseTo(5)
    expect(result.point.y).toBeCloseTo(0)
    expect(result.t).toBeCloseTo(0.5)
  })

  it('projects a point near the line', () => {
    const result = projectPointOnSegment(
      { x: 5, y: 3 },
      { x: 0, y: 0 },
      { x: 10, y: 0 },
    )
    expect(result.distance).toBeCloseTo(3)
    expect(result.point.x).toBeCloseTo(5)
    expect(result.point.y).toBeCloseTo(0)
  })

  it('clamps to segment start when before segment', () => {
    const result = projectPointOnSegment(
      { x: -5, y: 0 },
      { x: 0, y: 0 },
      { x: 10, y: 0 },
    )
    expect(result.t).toBe(0)
    expect(result.point.x).toBeCloseTo(0)
    expect(result.point.y).toBeCloseTo(0)
    expect(result.distance).toBeCloseTo(5)
  })

  it('clamps to segment end when past segment', () => {
    const result = projectPointOnSegment(
      { x: 15, y: 0 },
      { x: 0, y: 0 },
      { x: 10, y: 0 },
    )
    expect(result.t).toBe(1)
    expect(result.point.x).toBeCloseTo(10)
    expect(result.point.y).toBeCloseTo(0)
    expect(result.distance).toBeCloseTo(5)
  })

  it('handles degenerate segment (zero length)', () => {
    const result = projectPointOnSegment(
      { x: 3, y: 4 },
      { x: 0, y: 0 },
      { x: 0, y: 0 },
    )
    expect(result.distance).toBeCloseTo(5)
    expect(result.t).toBe(0)
  })

  it('projects onto diagonal line', () => {
    const result = projectPointOnSegment(
      { x: 0, y: 10 },
      { x: 0, y: 0 },
      { x: 10, y: 10 },
    )
    expect(result.point.x).toBeCloseTo(5)
    expect(result.point.y).toBeCloseTo(5)
    expect(result.distance).toBeCloseTo(Math.sqrt(50))
  })
})

describe('findNearestEdge', () => {
  const makeNode = (id: string, x: number, y: number, w = 200, h = 60): Node => ({
    id,
    position: { x, y },
    data: {},
    width: w,
    height: h,
  })

  const makeEdge = (id: string, source: string, target: string, label?: string): Edge => ({
    id,
    source,
    target,
    ...(label ? { label } : {}),
  })

  it('returns null when no edges', () => {
    const result = findNearestEdge(
      { x: 100, y: 100 },
      [],
      [makeNode('a', 0, 0)],
    )
    expect(result).toBeNull()
  })

  it('returns null when point is beyond threshold', () => {
    const nodes = [makeNode('a', 0, 0), makeNode('b', 0, 400)]
    const edges = [makeEdge('e1', 'a', 'b')]
    // Node centers: a=(100,30), b=(100,430). Midpoint at x=100, y=230
    // Point at x=300 is 200px away from edge
    const result = findNearestEdge({ x: 300, y: 230 }, edges, nodes, 40)
    expect(result).toBeNull()
  })

  it('finds the nearest edge within threshold', () => {
    const nodes = [makeNode('a', 0, 0), makeNode('b', 0, 400)]
    const edges = [makeEdge('e1', 'a', 'b')]
    // Node centers: a=(100,30), b=(100,430). Edge is vertical at x=100
    // Point at x=110, y=200 is 10px away
    const result = findNearestEdge({ x: 110, y: 200 }, edges, nodes, 40)
    expect(result).not.toBeNull()
    expect(result!.edge.id).toBe('e1')
    expect(result!.distance).toBeLessThan(40)
  })

  it('returns the closest edge when multiple are near', () => {
    const nodes = [
      makeNode('a', 0, 0),
      makeNode('b', 0, 400),
      makeNode('c', 200, 0),
      makeNode('d', 200, 400),
    ]
    const edges = [
      makeEdge('e1', 'a', 'b'),
      makeEdge('e2', 'c', 'd'),
    ]
    // e1 center line at x=100, e2 center line at x=300
    // Point at x=280, y=200 is closer to e2
    const result = findNearestEdge({ x: 280, y: 200 }, edges, nodes, 40)
    expect(result).not.toBeNull()
    expect(result!.edge.id).toBe('e2')
  })

  it('returns edge exactly at threshold boundary', () => {
    const nodes = [makeNode('a', 0, 0, 0, 0), makeNode('b', 100, 0, 0, 0)]
    const edges = [makeEdge('e1', 'a', 'b')]
    // Edge from (0,0) to (100,0). Point at (50, 39) is 39px away
    const result = findNearestEdge({ x: 50, y: 39 }, edges, nodes, 40)
    expect(result).not.toBeNull()
    expect(result!.distance).toBeCloseTo(39)
  })

  it('handles edges with missing nodes gracefully', () => {
    const nodes = [makeNode('a', 0, 0)]
    const edges = [makeEdge('e1', 'a', 'missing')]
    const result = findNearestEdge({ x: 50, y: 50 }, edges, nodes, 40)
    expect(result).toBeNull()
  })
})
