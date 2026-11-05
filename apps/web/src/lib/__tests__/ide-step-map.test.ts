import { describe, expect, it } from 'vitest'
import type { StepManifest } from '@awaitstep/codegen'
import { buildStepMap, highlightFor } from '../ide/step-map'

const manifest: StepManifest = {
  irHash: 'h',
  steps: [
    { nodeId: 'validate', varName: 'validate_order', filePath: 'nodes/validate_order.ts' },
    { nodeId: 'charge', varName: 'charge_card', filePath: 'nodes/charge_card.ts' },
    { nodeId: 'wait', varName: 'wait_2_days' },
    { nodeId: 'member', varName: 'member', coalescedInto: 'charge' },
  ],
}

const files = new Map([
  ['nodes/validate_order.ts', { source: "import { check } from '#app/lib/payments/charge'" }],
  [
    'nodes/charge_card.ts',
    {
      source:
        "import { check } from '#app/lib/payments/charge'\nimport { fmt } from '#app/lib/format'",
    },
  ],
  ['lib/payments/charge.ts', { source: "import { money } from '#app/lib/money'" }],
  ['lib/format.ts', { source: '' }],
  ['lib/money.ts', { source: '' }],
  ['lib/lonely.ts', { source: '' }],
  ['package.json', { source: '{}' }],
  ['worker.ts', { source: '' }],
])
const projectPaths = new Set([
  'lib/payments/charge.ts',
  'lib/format.ts',
  'lib/money.ts',
  'lib/lonely.ts',
])
const nodeIds = ['validate', 'charge', 'wait', 'member']

function build(overrides: Partial<Parameters<typeof buildStepMap>[0]> = {}) {
  return buildStepMap({ manifest, nodeIds, files, projectPaths, ...overrides })
}

describe('buildStepMap', () => {
  it('maps each node to its step file and what that file imports', () => {
    const map = build()
    expect(map.hasManifest).toBe(true)
    expect(map.byNode.get('charge')).toMatchObject({
      filePath: 'nodes/charge_card.ts',
      uses: ['lib/payments/charge.ts', 'lib/format.ts'],
    })
    expect(map.byFile.get('nodes/validate_order.ts')).toEqual(['validate'])
  })

  it('gives a node with no module no file, and says nothing is used', () => {
    const wait = build().byNode.get('wait')
    expect(wait).toMatchObject({ filePath: null, uses: [], coalescedInto: null })
  })

  it('records the leader of a node merged into another step', () => {
    expect(build().byNode.get('member')).toMatchObject({ filePath: null, coalescedInto: 'charge' })
  })

  it('treats a manifest file that is not in the bundle as no file', () => {
    const without = new Map(files)
    without.delete('nodes/charge_card.ts')
    expect(build({ files: without }).byNode.get('charge')?.filePath).toBeNull()
  })

  it('finds every step a project file feeds, through other project files too', () => {
    const map = build()
    expect(map.usedBy.get('lib/payments/charge.ts')).toEqual(['validate', 'charge'])
    expect(map.usedBy.get('lib/format.ts')).toEqual(['charge'])
    // money.ts is only reached by way of charge.ts.
    expect(map.usedBy.get('lib/money.ts')).toEqual(['validate', 'charge'])
    expect(map.usedBy.has('lib/lonely.ts')).toBe(false)
  })

  it('survives a cycle between project files', () => {
    const cyclic = new Map(files)
    cyclic.set('lib/money.ts', { source: "import { c } from '#app/lib/payments/charge'" })
    expect(build({ files: cyclic }).usedBy.get('lib/money.ts')).toEqual(['validate', 'charge'])
  })

  it('lists nodes without file links when there is no manifest', () => {
    const map = build({ manifest: null })
    expect(map.hasManifest).toBe(false)
    expect([...map.byNode.keys()]).toEqual(nodeIds)
    expect([...map.byNode.values()].every((n) => n.filePath === null && n.uses.length === 0)).toBe(
      true,
    )
    expect(map.byFile.size).toBe(0)
    expect(map.usedBy.size).toBe(0)
  })

  it('sees an import typed into a file but not yet saved', () => {
    const edited = new Map(files)
    edited.set('nodes/validate_order.ts', { source: "import { f } from '#app/lib/lonely'" })
    expect(build({ files: edited }).usedBy.get('lib/lonely.ts')).toEqual(['validate'])
  })
})

describe('highlightFor', () => {
  const map = build()

  it('outlines the step whose file is open', () => {
    expect(highlightFor(map, 'nodes/charge_card.ts')).toEqual({ primary: ['charge'], usedBy: [] })
  })

  it('outlines every step that imports an open project file', () => {
    expect(highlightFor(map, 'lib/payments/charge.ts')).toEqual({
      primary: [],
      usedBy: ['validate', 'charge'],
    })
  })

  it('lights nothing for a config, generated or unrelated file', () => {
    for (const path of ['package.json', 'worker.ts', 'lib/lonely.ts', 'missing.ts', null]) {
      expect(highlightFor(map, path)).toEqual({ primary: [], usedBy: [] })
    }
  })
})
