import { describe, it, expect } from 'vitest'
import type { NodeDefinition } from '@awaitstep/ir'
import { computeUpstreamSets } from '../expressions/upstream'
import {
  flattenOutputPaths,
  analyzeCompletion,
  analyzeHover,
  analyzeIssues,
  type ExpressionEditorContext,
} from '../expressions/editor-support'

const geminiDef = {
  outputSchema: {
    text: { type: 'string', description: 'Generated text' },
    data: { type: 'object', properties: { model: { type: 'string' } } },
  },
} as unknown as NodeDefinition

const ctx: ExpressionEditorContext = {
  nodeId: 'send',
  nodes: [
    { id: 'fetch_data', name: 'Fetch data', type: 'google-gemini' },
    { id: 'send', name: 'Send', type: 'step' },
    { id: 'later', name: 'Later', type: 'step' },
  ],
  upstream: new Set(['fetch_data']),
  resolveDefinition: (type) => (type === 'google-gemini' ? geminiDef : undefined),
}

describe('computeUpstreamSets', () => {
  it('counts topologically earlier nodes as upstream, matching validation', () => {
    const sets = computeUpstreamSets(
      [{ id: 'a' }, { id: 'b' }, { id: 'c' }],
      [
        { source: 'a', target: 'b' },
        { source: 'b', target: 'c' },
      ],
    )
    expect(sets.get('a')).toEqual(new Set())
    expect(sets.get('c')).toEqual(new Set(['a', 'b']))
  })
})

describe('analyzeCompletion', () => {
  it('returns null outside an open expression', () => {
    expect(analyzeCompletion('plain text', 5, ctx)).toBeNull()
    expect(analyzeCompletion('{{done}} after', 12, ctx)).toBeNull()
  })

  it('suggests reserved refs and upstream nodes right after {{', () => {
    const text = 'value: {{'
    const result = analyzeCompletion(text, text.length, ctx)!
    const labels = result.suggestions.map((s) => s.label)
    expect(labels).toContain('event')
    expect(labels).toContain('env')
    expect(labels).toContain('fetch_data')
    // The edited node itself and non-upstream nodes are never offered.
    expect(labels).not.toContain('send')
    expect(labels).not.toContain('later')
    expect(result.replaceStart).toBe(text.length)
  })

  it('suggests outputSchema properties after ref-dot', () => {
    const text = '{{fetch_data.'
    const result = analyzeCompletion(text, text.length, ctx)!
    expect(result.suggestions.map((s) => s.label).sort()).toEqual(['data', 'text'])
    expect(result.suggestions.find((s) => s.label === 'text')!.detail).toBe('string')
  })

  it('walks nested object properties', () => {
    const text = '{{fetch_data.data.'
    const result = analyzeCompletion(text, text.length, ctx)!
    expect(result.suggestions.map((s) => s.label)).toEqual(['model'])
  })

  it('offers nothing beyond the declared shape', () => {
    const text = '{{fetch_data.text.'
    const result = analyzeCompletion(text, text.length, ctx)!
    expect(result.suggestions).toEqual([])
  })
})

describe('analyzeHover', () => {
  it('resolves a path to its type and node title', () => {
    const text = 'say {{fetch_data.text}} now'
    const hover = analyzeHover(text, 8, ctx)!
    expect(hover.title).toBe('Fetch data.text')
    expect(hover.typeText).toBe('string')
    expect(hover.description).toBe('Generated text')
  })

  it('describes reserved refs', () => {
    const text = '{{event.payload}}'
    const hover = analyzeHover(text, 3, ctx)!
    expect(hover.title).toBe('event.payload')
    expect(hover.description).toContain('trigger event')
  })

  it('returns null outside expressions', () => {
    expect(analyzeHover('nothing here', 3, ctx)).toBeNull()
  })
})

describe('analyzeIssues', () => {
  it('flags self-references and unknown or downstream refs with spans', () => {
    const text = '{{send.x}} {{missing.y}} {{later.z}} {{fetch_data.text}}'
    const issues = analyzeIssues(text, ctx)
    expect(issues).toHaveLength(3)
    expect(issues[0]!.start).toBe(0)
    for (const issue of issues) {
      expect(text.slice(issue.start, issue.end)).toMatch(/^\{\{.*\}\}$/)
    }
  })

  it('accepts reserved refs and valid upstream paths', () => {
    expect(analyzeIssues('{{env.KEY}} {{fetch_data.text}}', ctx)).toEqual([])
  })
})

describe('flattenOutputPaths', () => {
  it('lists top-level and nested object paths with type text', () => {
    const paths = flattenOutputPaths(geminiDef.outputSchema)
    expect(paths.map((p) => p.path)).toEqual(['.text', '.data', '.data.model'])
    expect(paths[0]).toMatchObject({ type: 'string', description: 'Generated text' })
  })

  it('returns empty for missing schemas', () => {
    expect(flattenOutputPaths(undefined)).toEqual([])
  })
})
