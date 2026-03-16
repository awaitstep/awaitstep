import { describe, it, expect } from 'vitest'
import { generateStateInit, generateStateCapture, hasTemplateExpressions } from '../../codegen/generators/state-tracking.js'
import type { WorkflowNode } from '@awaitstep/ir'

describe('generateStateInit', () => {
  it('produces a state variable declaration', () => {
    expect(generateStateInit()).toBe(`const _workflowState: Record<string, any> = {};`)
  })
})

describe('generateStateCapture', () => {
  it('captures step node output', () => {
    const node: WorkflowNode = {
      id: 'step1',
      name: 'My Step',
      position: { x: 0, y: 0 },
      type: 'step',
      code: 'return 1',
    }
    expect(generateStateCapture(node)).toBe(`_workflowState['step1'] = step1;`)
  })

  it('captures http-request node output', () => {
    const node: WorkflowNode = {
      id: 'http-req',
      name: 'Fetch',
      position: { x: 0, y: 0 },
      type: 'http-request',
      url: 'https://api.example.com',
      method: 'GET',
    }
    expect(generateStateCapture(node)).toBe(`_workflowState['http-req'] = http_req;`)
  })

  it('captures wait-for-event node output', () => {
    const node: WorkflowNode = {
      id: 'wait1',
      name: 'Wait',
      position: { x: 0, y: 0 },
      type: 'wait-for-event',
      eventType: 'approval',
    }
    expect(generateStateCapture(node)).toBe(`_workflowState['wait1'] = wait1;`)
  })

  it('returns null for sleep node', () => {
    const node: WorkflowNode = {
      id: 's1',
      name: 'Sleep',
      position: { x: 0, y: 0 },
      type: 'sleep',
      duration: '10 seconds',
    }
    expect(generateStateCapture(node)).toBeNull()
  })

  it('returns null for branch node', () => {
    const node: WorkflowNode = {
      id: 'b1',
      name: 'Branch',
      position: { x: 0, y: 0 },
      type: 'branch',
      branches: [{ label: 'yes', condition: 'true' }, { label: 'no', condition: '' }],
    }
    expect(generateStateCapture(node)).toBeNull()
  })
})

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
