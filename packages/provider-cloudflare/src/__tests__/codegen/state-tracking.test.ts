import { describe, it, expect } from 'vitest'
import { hasTemplateExpressions } from '../../codegen/generators/state-tracking.js'
import type { WorkflowNode } from '@awaitstep/ir'

describe('hasTemplateExpressions', () => {
  it('detects expressions in step code', () => {
    const nodes: WorkflowNode[] = [
      {
        id: 's1',
        name: 'Step',
        position: { x: 0, y: 0 },
        type: 'step',
        code: 'return {{other.result}}',
      },
    ]
    expect(hasTemplateExpressions(nodes)).toBe(true)
  })

  it('detects expressions in http url', () => {
    const nodes: WorkflowNode[] = [
      {
        id: 'h1',
        name: 'HTTP',
        position: { x: 0, y: 0 },
        type: 'http-request',
        url: 'https://api.com/{{step1.id}}',
        method: 'GET',
      },
    ]
    expect(hasTemplateExpressions(nodes)).toBe(true)
  })

  it('detects expressions in http body', () => {
    const nodes: WorkflowNode[] = [
      {
        id: 'h1',
        name: 'HTTP',
        position: { x: 0, y: 0 },
        type: 'http-request',
        url: 'https://api.com',
        method: 'POST',
        body: '{"data": "{{step1.output}}"}',
      },
    ]
    expect(hasTemplateExpressions(nodes)).toBe(true)
  })

  it('detects expressions in http headers', () => {
    const nodes: WorkflowNode[] = [
      {
        id: 'h1',
        name: 'HTTP',
        position: { x: 0, y: 0 },
        type: 'http-request',
        url: 'https://api.com',
        method: 'GET',
        headers: { Authorization: 'Bearer {{auth.token}}' },
      },
    ]
    expect(hasTemplateExpressions(nodes)).toBe(true)
  })

  it('returns false when no expressions', () => {
    const nodes: WorkflowNode[] = [
      {
        id: 's1',
        name: 'Step',
        position: { x: 0, y: 0 },
        type: 'step',
        code: 'return "hello"',
      },
    ]
    expect(hasTemplateExpressions(nodes)).toBe(false)
  })
})
