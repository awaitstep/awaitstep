import { describe, expect, it } from 'vitest'
import { goTargets, paletteModel, type PaletteInput } from '../palette-model'
import { sheetSections } from '../sheet-model'

const ORG: PaletteInput = {
  slugs: { org: 'acme' },
  overlayBase: '/acme/audit',
  theme: 'dark',
  bound: [],
}
const WORKSPACE: PaletteInput = {
  ...ORG,
  slugs: { org: 'acme', project: 'shop', workspace: 'prod' },
}

describe('palette model', () => {
  it('sends each g key where the rail item goes, overlays opening over the page', () => {
    const targets = goTargets(paletteModel(ORG))
    expect(targets).toMatchObject({
      goProjects: '/acme/projects',
      goResources: '/acme/resources',
      goAudit: '/acme/audit',
      goApiKeys: '/acme/api-keys',
      goInbox: '/acme/audit?open=inbox',
      goWhatsNew: '/acme/audit?open=whats-new',
    })
    expect(targets.goSettings).toMatch(/^\/acme\/settings/)
  })

  it('binds the workspace keys only inside a workspace', () => {
    expect(goTargets(paletteModel(ORG)).goWorkflows).toBeUndefined()
    expect(goTargets(paletteModel(WORKSPACE))).toMatchObject({
      goWorkflows: '/acme/shop/prod/workflows',
      goFunctions: '/acme/shop/prod/functions',
      goRuns: '/acme/shop/prod/runs',
    })
  })

  it('drops a page the instance switches off, with its key', () => {
    const on = paletteModel(ORG).flatMap((g) => g.items.map((i) => i.id))
    const off = paletteModel({ ...ORG, disabled: ['playground', 'docs'] }).flatMap((g) =>
      g.items.map((i) => i.id),
    )
    expect(on).toEqual(expect.arrayContaining(['org:playground', 'org:docs']))
    expect(off).not.toContain('org:playground')
    expect(off).not.toContain('org:docs')
  })

  it('never sends a g key off to an external page', () => {
    const groups = paletteModel(ORG)
    const docs = groups.flatMap((g) => g.items).find((i) => i.id === 'org:docs')
    expect(docs?.target).toMatchObject({ kind: 'href', external: true })
    expect(Object.values(goTargets(groups))).not.toContain(
      docs?.target.kind === 'href' && docs.target.href,
    )
  })

  it('lists the page’s own actions under their group, and names the theme it switches to', () => {
    const groups = paletteModel({
      ...WORKSPACE,
      theme: 'light',
      bound: ['deploy', 'palette', 'canvasFit'],
    })
    const headings = groups.map((g) => g.heading)
    expect(headings).toEqual([
      'Go to',
      'This workspace',
      'This workflow or function',
      'Canvas',
      'General',
    ])
    const general = groups.at(-1)!.items.map((i) => i.label)
    expect(general).toContain('Switch to the dark theme')
  })
})

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
