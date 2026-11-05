import { describe, expect, it } from 'vitest'
import exported from './fixtures/exported-workflow.json'
import { NOT_JSON, parseImportFile } from '../import-file'

const content = JSON.stringify(exported)

describe('parseImportFile', () => {
  it('reads a workflow export: its graph, kind, name and description', () => {
    const file = parseImportFile(content, 'simple.ir.json')
    expect(file.kind).toBe('workflow')
    expect(file.name).toBe('simple-workflow')
    expect(file.description).toBe('A simple two-step workflow')
    expect(file.ir.nodes.map((n) => n.id)).toEqual(exported.nodes.map((n) => n.id))
  })

  it('keeps a function a function', () => {
    const script = {
      ...exported,
      kind: 'script',
      trigger: { type: 'http' },
      nodes: exported.nodes.filter((n) => n.id === 'step-1'),
      edges: [],
    }
    expect(parseImportFile(JSON.stringify(script), 'fn.json').kind).toBe('script')
  })

  it('reads an older function export with no trigger, as the API would', () => {
    const legacy = {
      ...exported,
      kind: 'script',
      nodes: exported.nodes.filter((n) => n.id === 'step-1'),
      edges: [],
    }
    expect(parseImportFile(JSON.stringify(legacy), 'old-fn.json').kind).toBe('script')
  })

  it('names it after the file when the export has no name', () => {
    const unnamed = { ...exported, metadata: { ...exported.metadata, name: '  ' } }
    expect(parseImportFile(JSON.stringify(unnamed), 'lead-enrichment.ir.json').name).toBe(
      'lead-enrichment',
    )
  })

  it('refuses a file that isn’t JSON', () => {
    expect(() => parseImportFile('{ nope', 'x.json')).toThrow(NOT_JSON)
  })

  it('refuses JSON that isn’t an export, saying what is wrong', () => {
    expect(() => parseImportFile(JSON.stringify({ nodes: 'no' }), 'x.json')).toThrow(
      /^That file isn’t a workflow export: /,
    )
  })
})
