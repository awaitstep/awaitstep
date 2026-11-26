import { describe, expect, it } from 'vitest'
import { sheetSections } from '../sheet-model'

describe('shortcuts sheet', () => {
  it('lists what is bound, plus a mounted scope’s own keys, merging keys that do the same', () => {
    const sections = sheetSections({
      bound: ['help', 'goProjects', 'canvasSave'],
      scopes: new Set(['global', 'canvas']),
      ide: [],
      isMac: true,
    })
    expect(sections.map((s) => s.heading)).toEqual(['General', 'Go to', 'Canvas'])
    const canvas = sections[2]!.rows
    expect(canvas.find((r) => r.label === 'Save')?.keys).toEqual([['⌘S'], ['⌘⏎']])
    expect(canvas.map((r) => r.label)).toContain('Undo')
    expect(sections[1]!.rows).toEqual([{ label: 'Projects', keys: [['G', 'P']] }])
  })

  it('lists only the Code view keys that are bound, once each, merged with their alternatives', () => {
    const sections = sheetSections({
      bound: ['help'],
      scopes: new Set(['global']),
      ide: [
        { heading: 'Code view', ids: ['commandPalette', 'commandPaletteAlt', 'envVars'] },
        { heading: 'Code view', ids: ['envVars'] },
      ],
      isMac: false,
    })
    expect(sections.map((s) => s.heading)).toEqual(['General', 'Code view'])
    expect(sections[1]!.rows).toEqual([
      { label: 'Command palette', keys: [['Ctrl+K'], ['Ctrl+Shift+P']] },
      { label: 'Variables', keys: [['Ctrl+Alt+V']] },
    ])
  })

  it('puts the canvas toolbar’s chords in the Canvas section, in its own words', () => {
    const sections = sheetSections({
      bound: ['canvasFit'],
      scopes: new Set(['canvas']),
      ide: [
        {
          heading: 'Canvas',
          labels: { toggleExplorer: 'Show or hide the nodes' },
          ids: ['toggleExplorer'],
        },
      ],
      isMac: true,
    })
    expect(sections.map((s) => s.heading)).toEqual(['Canvas'])
    expect(sections[0]!.rows).toContainEqual({ label: 'Show or hide the nodes', keys: [['⌘B']] })
    expect(sections[0]!.rows.map((r) => r.label)).not.toContain('Show or hide the side bar')
  })
})
