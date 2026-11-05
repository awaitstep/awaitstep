import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { BAR_TIERS, collapsedAt } from '../top-bar-layout'

type Tiers = Record<keyof typeof BAR_TIERS, number>

// Widths measured in headless Chrome with the real bar, long names and every
// pill showing (see "Top bar layout" in plan/qa-notes-unified-bar.md). Each row
// is the worst of the canvas and Code bars from that width on.
const actionsRows = (t: Tiers) => [
  { from: 0, px: 120 },
  { from: t.toggles, px: 206 },
  { from: t.history, px: 272 },
  { from: t.labels, px: 375 },
  { from: t.statusText, px: 423 },
  { from: t.deploySlot, px: 469 },
]
const switchRows = (t: Tiers) => [
  { from: 0, px: 66 },
  { from: t.switchLabels, px: 159 },
]
// Back button, gaps, a name worth reading (80) and the version pill.
const IDENTITY_MIN_PX = 190
const NODE_PILL_PX = 72
const DEPLOY_PILL_PX = 200
const GAPS_PX = 16

function at(rows: { from: number; px: number }[], width: number) {
  return [...rows].reverse().find((row) => width >= row.from)!.px
}

function neededAt(width: number, t: Tiers = BAR_TIERS) {
  return (
    IDENTITY_MIN_PX +
    (width >= t.nodeCount ? NODE_PILL_PX : 0) +
    (width >= t.deployPill ? DEPLOY_PILL_PX : 0) +
    at(switchRows(t), width) +
    at(actionsRows(t), width) +
    GAPS_PX +
    (width >= t.switchLabels ? 32 : 24)
  )
}

function firstShortfall(t: Tiers) {
  for (let width = 480; width <= 2560; width += 4) {
    if (neededAt(width, t) > width) return width
  }
  return null
}

describe('top bar widths', () => {
  it('has room for the name, the switch and every action at every width from a phone up', () => {
    expect(firstShortfall(BAR_TIERS)).toBeNull()
  })

  it('catches a step taken too early', () => {
    expect(firstShortfall({ ...BAR_TIERS, history: 540 })).not.toBeNull()
    expect(firstShortfall({ ...BAR_TIERS, labels: 700 })).not.toBeNull()
    expect(firstShortfall({ ...BAR_TIERS, deploySlot: 900 })).not.toBeNull()
    expect(firstShortfall({ ...BAR_TIERS, deployPill: 1000 })).not.toBeNull()
  })

  it('collapses in the order people miss least: toggles last of the controls, the deploy pill first of the badges', () => {
    expect(BAR_TIERS.toggles).toBeLessThan(BAR_TIERS.switchLabels)
    expect(BAR_TIERS.switchLabels).toBeLessThanOrEqual(BAR_TIERS.history)
    expect(BAR_TIERS.history).toBeLessThan(BAR_TIERS.labels)
    expect(BAR_TIERS.nodeCount).toBeLessThan(BAR_TIERS.deployPill)
    expect(BAR_TIERS.deploySlot).toBeLessThan(BAR_TIERS.deployPill)
  })

  it('moves things into ⋯ exactly below their width', () => {
    expect(collapsedAt(BAR_TIERS.history - 1).history).toBe(true)
    expect(collapsedAt(BAR_TIERS.history).history).toBe(false)
    expect(collapsedAt(BAR_TIERS.deployPill - 1).deployPill).toBe(true)
    expect(collapsedAt(BAR_TIERS.deployPill).deployPill).toBe(false)
    expect(collapsedAt(0).toggles).toBe(true)
  })
})

describe('the classes and the table agree', () => {
  const files = [
    'workflows/unified-top-bar.tsx',
    'workflows/view-switch.tsx',
    'workflows/workflow-title.tsx',
    'canvas/editor-toolbar.tsx',
    'canvas/save-status-indicator.tsx',
  ]
  const source = files
    .map((file) => readFileSync(join(__dirname, '..', '..', file), 'utf8'))
    .join('\n')
  const used = new Set([...source.matchAll(/@\[(\d+)px\]:/g)].map((m) => Number(m[1])))

  it('uses only widths the table names', () => {
    const known = new Set<number>(Object.values(BAR_TIERS))
    for (const width of used) expect(known.has(width), `@[${width}px]`).toBe(true)
  })

  it('has a class behind every width in the table', () => {
    for (const [name, width] of Object.entries(BAR_TIERS)) {
      expect(used.has(width), `${name} (${width}px)`).toBe(true)
    }
  })

  it('never collapses by the window: no viewport breakpoints in the bar’s own files', () => {
    expect(source).not.toMatch(/[\s"'`](sm|md|lg|xl):/)
  })
})
