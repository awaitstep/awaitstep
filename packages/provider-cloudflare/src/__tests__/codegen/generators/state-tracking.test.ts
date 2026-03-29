import { describe, it, expect } from 'vitest'
import { hasTemplateExpressions } from '../../../codegen/generators/state-tracking.js'
import type { WorkflowNode } from '@awaitstep/ir'

function node(data: Record<string, unknown>): WorkflowNode {
  return {
    id: 'n',
    type: 'step',
    name: 'N',
    position: { x: 0, y: 0 },
    version: '1.0.0',
    provider: 'cloudflare',
    data,
  }
}

describe('hasTemplateExpressions', () => {
  it('returns false for empty nodes', () => {
    expect(hasTemplateExpressions([])).toBe(false)
  })

  it('returns false for nodes without expressions', () => {
    expect(hasTemplateExpressions([node({ code: 'return 1;' })])).toBe(false)
  })

  it('detects {{nodeId.property}} expressions', () => {
    expect(hasTemplateExpressions([node({ code: '{{step-1.result}}' })])).toBe(true)
  })

  it('detects nested property paths', () => {
    expect(hasTemplateExpressions([node({ url: '{{http.body.data}}' })])).toBe(true)
  })

  it('ignores non-string values', () => {
    expect(hasTemplateExpressions([node({ count: 5, flag: true, obj: {} })])).toBe(false)
  })

  it('detects expressions in any data field', () => {
    expect(hasTemplateExpressions([node({ a: 'hello', b: '{{x.y}}' })])).toBe(true)
  })

  it('returns false for malformed expressions', () => {
    expect(hasTemplateExpressions([node({ code: '{{}}' })])).toBe(false)
    expect(hasTemplateExpressions([node({ code: '{{ space }}' })])).toBe(false)
  })
})
