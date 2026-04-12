import { describe, it, expect } from 'vitest'
import type { WorkflowNode } from '@awaitstep/ir'
import { generateHttp } from '../../../codegen/generators/http.js'

function makeNode(overrides: Partial<WorkflowNode> = {}): WorkflowNode {
  return {
    id: 'http-1',
    type: 'http_request',
    name: 'Fetch data',
    position: { x: 0, y: 0 },
    version: '1.0.0',
    provider: 'cloudflare',
    data: { url: 'https://api.example.com/data', method: 'GET' },
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
    const code = generateHttp(
      makeNode({
        data: {
          url: 'https://api.example.com/data',
          method: 'GET',
          headers: { Accept: 'application/json' },
        },
      }),
    )
    expect(code).toContain('method: "GET"')
    expect(code).toContain('"Accept": "application/json"')
  })

  it('generates a POST request with method', () => {
    const code = generateHttp(
      makeNode({ data: { url: 'https://api.example.com/data', method: 'POST' } }),
    )
    expect(code).toContain('method: "POST"')
  })

  it('includes headers as object literal', () => {
    const code = generateHttp(
      makeNode({
        data: {
          url: 'https://api.example.com/data',
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
        },
      }),
    )
    expect(code).toContain('"Content-Type": "application/json"')
    expect(code).toContain('"Accept": "application/json"')
  })

  it('passes through body with JSON.stringify already applied', () => {
    const code = generateHttp(
      makeNode({
        data: {
          url: 'https://api.example.com/data',
          method: 'POST',
          body: 'JSON.stringify({ key: "value" })',
        },
      }),
    )
    expect(code).toContain('body: JSON.stringify({ key: "value" })')
    expect(code).not.toContain('body: JSON.stringify(JSON.stringify')
  })

  it('auto-wraps object body with JSON.stringify', () => {
    const code = generateHttp(
      makeNode({
        data: {
          url: 'https://api.example.com/data',
          method: 'POST',
          body: '{ key: "value" }',
        },
      }),
    )
    expect(code).toContain('body: JSON.stringify({ key: "value" })')
  })

  it('passes through string literal body without wrapping', () => {
    const code = generateHttp(
      makeNode({
        data: {
          url: 'https://api.example.com/data',
          method: 'POST',
          body: '"plain text body"',
        },
      }),
    )
    expect(code).toContain('body: "plain text body"')
    expect(code).not.toContain('JSON.stringify')
  })

  it('uses template literals for URLs with expressions', () => {
    const code = generateHttp(
      makeNode({
        data: {
          url: 'https://api.example.com/users/${state.userId}',
          method: 'GET',
        },
      }),
    )
    expect(code).toContain('`https://api.example.com/users/${state.userId}`')
    expect(code).not.toContain('"https://api.example.com/users/${state.userId}"')
  })

  it('uses template literals for header values with expressions', () => {
    const code = generateHttp(
      makeNode({
        data: {
          url: 'https://api.example.com/data',
          method: 'GET',
          headers: { Authorization: 'Bearer ${env.API_KEY}' },
        },
      }),
    )
    expect(code).toContain('`Bearer ${env.API_KEY}`')
    expect(code).not.toContain('"Bearer ${env.API_KEY}"')
  })

  it('emits template literal body as-is', () => {
    const code = generateHttp(
      makeNode({
        data: {
          url: 'https://api.example.com/data',
          method: 'POST',
          body: '`amount=${state.total * 100}&currency=usd`',
        },
      }),
    )
    expect(code).toContain('body: `amount=${state.total * 100}&currency=usd`')
  })

  it('keeps regular strings when no expressions present', () => {
    const code = generateHttp(
      makeNode({
        data: {
          url: 'https://api.example.com/data',
          method: 'GET',
          headers: { 'Content-Type': 'application/json' },
        },
      }),
    )
    expect(code).toContain('"https://api.example.com/data"')
    expect(code).toContain('"application/json"')
  })

  it('includes step config with retries and timeout', () => {
    const code = generateHttp(
      makeNode({
        config: {
          retries: { limit: 3, delay: '5 seconds', backoff: 'exponential' },
          timeout: '30 seconds',
        },
      }),
    )
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
    const code = generateHttp(
      makeNode({ data: { url: 'https://api.example.com/data', method: 'GET', headers: {} } }),
    )
    expect(code).not.toContain('headers')
  })

  it('emits multi-line body expression as-is', () => {
    const body = `JSON.stringify({
  to: "user@example.com",
  subject: "Hello"
})`
    const code = generateHttp(
      makeNode({
        data: {
          url: 'https://api.sendgrid.com/v3/mail/send',
          method: 'POST',
          body,
        },
      }),
    )
    expect(code).toContain('body: JSON.stringify({')
    expect(code).toContain('to: "user@example.com"')
  })

  it('handles multiple expressions in one value', () => {
    const code = generateHttp(
      makeNode({
        data: {
          url: 'https://api.example.com/data',
          method: 'GET',
          headers: { 'X-Custom': '${env.PREFIX}-${env.SUFFIX}' },
        },
      }),
    )
    expect(code).toContain('`${env.PREFIX}-${env.SUFFIX}`')
  })

  it('appends query params using URL and searchParams', () => {
    const code = generateHttp(
      makeNode({
        data: {
          url: 'https://api.example.com/data',
          method: 'GET',
          queryParams: { page: '1', limit: '10' },
        },
      }),
    )
    expect(code).toContain('new URL("https://api.example.com/data")')
    expect(code).toContain('url.searchParams.set("page", "1")')
    expect(code).toContain('url.searchParams.set("limit", "10")')
    expect(code).toContain('await fetch(url)')
  })

  it('supports expressions in query param values', () => {
    const code = generateHttp(
      makeNode({
        data: {
          url: 'https://api.example.com/data',
          method: 'GET',
          queryParams: { cursor: '${state.nextCursor}' },
        },
      }),
    )
    expect(code).toContain('url.searchParams.set("cursor", `${state.nextCursor}`)')
  })

  it('omits query params when empty object', () => {
    const code = generateHttp(
      makeNode({
        data: { url: 'https://api.example.com/data', method: 'GET', queryParams: {} },
      }),
    )
    expect(code).not.toContain('searchParams')
    expect(code).not.toContain('new URL')
  })

  it('combines query params with headers and body', () => {
    const code = generateHttp(
      makeNode({
        data: {
          url: 'https://api.example.com/data',
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          queryParams: { token: 'abc' },
          body: 'JSON.stringify({ key: "value" })',
        },
      }),
    )
    expect(code).toContain('new URL("https://api.example.com/data")')
    expect(code).toContain('url.searchParams.set("token", "abc")')
    expect(code).toContain('await fetch(url, {')
    expect(code).toContain('method: "POST"')
    expect(code).toContain('"Content-Type": "application/json"')
    expect(code).toContain('body: JSON.stringify({ key: "value" })')
  })
})
