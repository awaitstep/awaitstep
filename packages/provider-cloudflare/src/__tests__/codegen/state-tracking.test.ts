import { describe, it, expect } from 'vitest'
import { hasTemplateExpressions } from '@awaitstep/codegen'
import type { WorkflowNode } from '@awaitstep/ir'

const V = '1.0.0'
const P = 'cloudflare'

describe('hasTemplateExpressions', () => {
  it('detects expressions in step code', () => {
    const nodes: WorkflowNode[] = [
      {
        id: 's1',
        name: 'Step',
        position: { x: 0, y: 0 },
        type: 'step',
        version: V,
        provider: P,
        data: { code: 'return {{other.result}}' },
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
        type: 'http_request',
        version: V,
        provider: P,
        data: { url: 'https://api.com/{{step1.id}}', method: 'GET' },
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
        type: 'http_request',
        version: V,
        provider: P,
        data: { url: 'https://api.com', method: 'POST', body: '{"data": "{{step1.output}}"}' },
      },
    ]
    expect(hasTemplateExpressions(nodes)).toBe(true)
  })

  it('detects expressions nested in an HTTP node’s header object', () => {
    const nodes: WorkflowNode[] = [
      {
        id: 'h1',
        name: 'HTTP',
        position: { x: 0, y: 0 },
        type: 'http_request',
        version: V,
        provider: P,
        data: {
          url: 'https://api.com',
          method: 'GET',
          headers: { Authorization: 'Bearer {{auth.token}}' },
        },
      },
    ]
    // Codegen resolves header values (BUILTIN_TEXT_FIELDS), so the gate must see them.
    expect(hasTemplateExpressions(nodes)).toBe(true)
  })

  it('detects expressions in custom node data', () => {
    const nodes: WorkflowNode[] = [
      {
        id: 'c1',
        name: 'Stripe Charge',
        position: { x: 0, y: 0 },
        type: 'custom',
        version: V,
        provider: P,
        data: { customerId: '{{create_customer.id}}', amount: 5000 },
      },
    ]
    expect(hasTemplateExpressions(nodes)).toBe(true)
  })

  it('returns false for custom node without expressions', () => {
    const nodes: WorkflowNode[] = [
      {
        id: 'c1',
        name: 'Stripe Charge',
        position: { x: 0, y: 0 },
        type: 'custom',
        version: V,
        provider: P,
        data: { customerId: 'cust_123', amount: 5000 },
      },
    ]
    expect(hasTemplateExpressions(nodes)).toBe(false)
  })

  it('returns false when no expressions', () => {
    const nodes: WorkflowNode[] = [
      {
        id: 's1',
        name: 'Step',
        position: { x: 0, y: 0 },
        type: 'step',
        version: V,
        provider: P,
        data: { code: 'return "hello"' },
      },
    ]
    expect(hasTemplateExpressions(nodes)).toBe(false)
  })
})
