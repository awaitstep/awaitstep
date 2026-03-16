import { describe, it, expect } from 'vitest'
import type { HttpRequestNode } from '@awaitstep/ir'
import { generateHttp } from '../../../codegen/generators/http.js'

function makeNode(overrides: Partial<HttpRequestNode> = {}): HttpRequestNode {
  return {
    id: 'http-1',
    type: 'http-request',
    name: 'Fetch data',
    position: { x: 0, y: 0 },
    url: 'https://api.example.com/data',
    method: 'GET',
    ...overrides,
  }
}

describe('generateHttp', () => {
  it('generates a basic GET request without options', () => {
    const code = generateHttp(makeNode())
    expect(code).toContain('await fetch("https://api.example.com/data")')
    expect(code).not.toContain('method:')
    expect(code).toContain('step.do("Fetch data"')
    expect(code).toContain('return response.json()')
  })

  it('includes method for GET when headers are present', () => {
    const code = generateHttp(makeNode({ headers: { 'Accept': 'application/json' } }))
    expect(code).toContain('method: "GET"')
    expect(code).toContain('"Accept": "application/json"')
  })

  it('generates a POST request with method', () => {
    const code = generateHttp(makeNode({ method: 'POST' }))
    expect(code).toContain('method: "POST"')
  })

  it('includes headers as object literal', () => {
    const code = generateHttp(makeNode({
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
    }))
    expect(code).toContain('"Content-Type": "application/json"')
    expect(code).toContain('"Accept": "application/json"')
  })

  it('includes body as string literal', () => {
    const code = generateHttp(makeNode({
      method: 'POST',
      body: '{"key":"value"}',
    }))
    expect(code).toContain('body: "{\\"key\\":\\"value\\"}"')
  })

  it('uses template literals for URLs with expressions', () => {
    const code = generateHttp(makeNode({
      url: 'https://api.example.com/users/${state.userId}',
    }))
    expect(code).toContain('`https://api.example.com/users/${state.userId}`')
    expect(code).not.toContain('"https://api.example.com/users/${state.userId}"')
  })

  it('uses template literals for header values with expressions', () => {
    const code = generateHttp(makeNode({
      headers: { 'Authorization': 'Bearer ${env.API_KEY}' },
    }))
    expect(code).toContain('`Bearer ${env.API_KEY}`')
    expect(code).not.toContain('"Bearer ${env.API_KEY}"')
  })

  it('uses template literals for body with expressions', () => {
    const code = generateHttp(makeNode({
      method: 'POST',
      body: 'amount=${state.total * 100}&currency=usd',
    }))
    expect(code).toContain('`amount=${state.total * 100}&currency=usd`')
  })

  it('keeps regular strings when no expressions present', () => {
    const code = generateHttp(makeNode({
      url: 'https://api.example.com/data',
      headers: { 'Content-Type': 'application/json' },
    }))
    expect(code).toContain('"https://api.example.com/data"')
    expect(code).toContain('"application/json"')
  })

  it('includes step config with retries and timeout', () => {
    const code = generateHttp(makeNode({
      config: {
        retries: { limit: 3, delay: '5 seconds', backoff: 'exponential' },
        timeout: '30 seconds',
      },
    }))
    expect(code).toContain('retries: { limit: 3, delay: "5 seconds", backoff: "exponential" }')
    expect(code).toContain('timeout: "30 seconds"')
  })

  it('omits config when not provided', () => {
    const code = generateHttp(makeNode())
    expect(code).not.toContain('retries')
    expect(code).not.toContain('timeout')
  })

  it('sanitizes node id for variable name', () => {
    const code = generateHttp(makeNode({ id: 'fetch-user-data' }))
    expect(code).toContain('const fetch_user_data =')
  })

  it('escapes quotes in step name', () => {
    const code = generateHttp(makeNode({ name: 'Fetch "important" data' }))
    expect(code).toContain('step.do("Fetch \\"important\\" data"')
  })

  it('omits headers when empty object', () => {
    const code = generateHttp(makeNode({ headers: {} }))
    expect(code).not.toContain('headers')
  })

  it('handles multiple expressions in one value', () => {
    const code = generateHttp(makeNode({
      headers: { 'X-Custom': '${env.PREFIX}-${env.SUFFIX}' },
    }))
    expect(code).toContain('`${env.PREFIX}-${env.SUFFIX}`')
  })
})
