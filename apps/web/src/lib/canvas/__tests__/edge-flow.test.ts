import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  arrowMarker,
  EDGE_COLOR,
  EDGE_HIGHLIGHT_COLOR,
  edgeColor,
  flowingEdgeIds,
  runningNodeIds,
  withFlow,
} from '../edge-flow'

const edges = [
  { id: 'ab', source: 'a', target: 'b' },
  { id: 'bc', source: 'b', target: 'c' },
  { id: 'cd', source: 'c', target: 'd' },
]

describe('arrowMarker', () => {
  it('hands back the same marker for a colour, so unchanged edges stay equal', () => {
    expect(arrowMarker('red')).toBe(arrowMarker('red'))
    expect(arrowMarker('red')).not.toBe(arrowMarker('blue'))
  })

  it('is sized in canvas units, not by the link’s stroke width', () => {
    expect(arrowMarker('red')).toMatchObject({ color: 'red', markerUnits: 'userSpaceOnUse' })
  })
})

describe('edgeColor', () => {
  it('highlights over a container colour, and falls back to the rest colour', () => {
    expect(edgeColor({ highlighted: true, containerColor: 'x' })).toBe(EDGE_HIGHLIGHT_COLOR)
    expect(edgeColor({ highlighted: false, containerColor: 'x' })).toBe('x')
    expect(edgeColor({ highlighted: false })).toBe(EDGE_COLOR)
  })
})

describe('flowingEdgeIds', () => {
  it('flows the links into and out of a node in focus', () => {
    expect([...flowingEdgeIds(edges, ['b', null], new Set())].sort()).toEqual(['ab', 'bc'])
  })

  it('flows the links into a running step only', () => {
    expect([...flowingEdgeIds(edges, [null, undefined], new Set(['c']))]).toEqual(['bc'])
  })

  it('flows nothing with nothing in focus or running', () => {
    expect(flowingEdgeIds(edges, [null], new Set()).size).toBe(0)
  })
})

describe('runningNodeIds', () => {
  it('reads the running steps from an active overlay only', () => {
    const statuses = { a: 'complete', b: 'running', c: 'pending' }
    expect([...runningNodeIds(true, statuses)]).toEqual(['b'])
    expect(runningNodeIds(false, statuses).size).toBe(0)
  })
})

describe('withFlow', () => {
  it('puts an arrow on every link, tinted by its container, and flows the given ones', () => {
    const out = withFlow(
      [
        { id: 'ab', data: { containerColor: 'teal' } },
        { id: 'bc', data: {} },
      ],
      new Set(['bc']),
      'grey',
    )
    expect(out[0]).toMatchObject({ markerEnd: arrowMarker('teal'), animated: false })
    expect(out[1]).toMatchObject({ markerEnd: arrowMarker('grey'), animated: true })
  })
})

describe('link colours', () => {
  // Regression: a selected link's path took --primary-ink from styles.css while
  // its arrow and label took a different green.
  it('highlights in the colour styles.css gives a selected link’s path', () => {
    const css = readFileSync(
      resolve(dirname(fileURLToPath(import.meta.url)), '../../../styles.css'),
      'utf8',
    )
    const rule = css.slice(css.indexOf('.react-flow__edge.selected .react-flow__edge-path'))
    expect(rule.slice(0, rule.indexOf('}'))).toContain(`stroke: ${EDGE_HIGHLIGHT_COLOR}`)
  })

  // React Flow builds an arrow's element id from its colour.
  it('uses colours without spaces', () => {
    for (const color of [EDGE_COLOR, EDGE_HIGHLIGHT_COLOR]) expect(color).not.toMatch(/\s/)
  })
})
