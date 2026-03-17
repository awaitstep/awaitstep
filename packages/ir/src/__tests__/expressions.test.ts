import { describe, it, expect } from 'vitest'
import {
  parseExpressions,
  resolveExpressions,
  validateExpressionRefs,
} from '../expressions'

describe('parseExpressions', () => {
  it('parses a single expression', () => {
    const result = parseExpressions('Hello {{step1.result}}')
    expect(result).toHaveLength(1)
    expect(result[0]).toEqual({
      raw: '{{step1.result}}',
      nodeId: 'step1',
      path: ['result'],
    })
  })

  it('parses multiple expressions', () => {
    const result = parseExpressions('{{a.x}} and {{b.y.z}}')
    expect(result).toHaveLength(2)
    expect(result[0]!.nodeId).toBe('a')
    expect(result[0]!.path).toEqual(['x'])
    expect(result[1]!.nodeId).toBe('b')
    expect(result[1]!.path).toEqual(['y', 'z'])
  })

  it('parses expression with no path (node ID only)', () => {
    const result = parseExpressions('{{step1}}')
    expect(result).toHaveLength(1)
    expect(result[0]!.nodeId).toBe('step1')
    expect(result[0]!.path).toEqual([])
  })

  it('parses nested property paths', () => {
    const result = parseExpressions('{{step1.data.users.0.name}}')
    expect(result).toHaveLength(1)
    expect(result[0]!.path).toEqual(['data', 'users', '0', 'name'])
  })

  it('returns empty array for no expressions', () => {
    expect(parseExpressions('plain text')).toEqual([])
  })

  it('handles hyphens in node IDs', () => {
    const result = parseExpressions('{{my-step.output}}')
    expect(result).toHaveLength(1)
    expect(result[0]!.nodeId).toBe('my-step')
  })

  it('ignores malformed expressions', () => {
    expect(parseExpressions('{{ }}')).toEqual([])
    expect(parseExpressions('{{}}')).toEqual([])
    expect(parseExpressions('{{.path}}')).toEqual([])
  })
})

describe('resolveExpressions', () => {
  it('resolves a single expression using default identity resolver', () => {
    const result = resolveExpressions('{{step1.result}}')
    expect(result).toBe('step1.result')
  })

  it('resolves multiple expressions in a string', () => {
    const result = resolveExpressions('{{a.x}} + {{b.y}}')
    expect(result).toBe('a.x + b.y')
  })

  it('resolves expression with no path', () => {
    const result = resolveExpressions('{{step1}}')
    expect(result).toBe('step1')
  })

  it('resolves nested paths', () => {
    const result = resolveExpressions('{{step1.data.name}}')
    expect(result).toBe('step1.data.name')
  })

  it('uses custom name resolver', () => {
    const resolver = (id: string) => `state['${id}']`
    const result = resolveExpressions('{{step1.x}}', resolver)
    expect(result).toBe("state['step1'].x")
  })

  it('resolves in interpolation context', () => {
    const result = resolveExpressions('{{step1.url}}', (id) => id, 'interpolation')
    expect(result).toBe('${step1.url}')
  })

  it('leaves text without expressions unchanged', () => {
    expect(resolveExpressions('no expressions here')).toBe('no expressions here')
  })
})

describe('validateExpressionRefs', () => {
  const allNodes = new Set(['step1', 'step2', 'step3'])

  it('passes for valid upstream reference', () => {
    const upstream = new Set(['step1'])
    const errors = validateExpressionRefs('{{step1.result}}', 'step2', upstream, allNodes)
    expect(errors).toEqual([])
  })

  it('errors on nonexistent node', () => {
    const upstream = new Set(['step1'])
    const errors = validateExpressionRefs('{{missing.result}}', 'step2', upstream, allNodes)
    expect(errors).toHaveLength(1)
    expect(errors[0]!.message).toContain('nonexistent')
  })

  it('errors on downstream reference', () => {
    const upstream = new Set(['step1'])
    const errors = validateExpressionRefs('{{step3.result}}', 'step2', upstream, allNodes)
    expect(errors).toHaveLength(1)
    expect(errors[0]!.message).toContain('downstream')
  })

  it('errors on self-reference', () => {
    const upstream = new Set(['step1'])
    const errors = validateExpressionRefs('{{step2.result}}', 'step2', upstream, allNodes)
    expect(errors).toHaveLength(1)
    expect(errors[0]!.message).toContain('current node')
  })

  it('returns multiple errors for multiple bad refs', () => {
    const upstream = new Set<string>()
    const errors = validateExpressionRefs(
      '{{missing.a}} + {{step3.b}}',
      'step1',
      upstream,
      allNodes,
    )
    expect(errors).toHaveLength(2)
  })

  it('returns empty for strings without expressions', () => {
    const errors = validateExpressionRefs('plain text', 'step1', new Set(), allNodes)
    expect(errors).toEqual([])
  })
})
