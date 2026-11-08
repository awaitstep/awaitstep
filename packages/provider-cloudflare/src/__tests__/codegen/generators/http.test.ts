import type { ScriptIR } from '@awaitstep/ir'
import { describe, it, expect } from 'vitest'
import { testCtx as ctx } from '../test-context.js'
import type { WorkflowNode } from '@awaitstep/ir'
import { generateHttp as generateHttpImpl } from '@awaitstep/codegen'
import { generateWorkflowBundle, generateScriptBundle } from '../../../codegen/generate.js'

/** Every file of the bundle as one text. */
function programOf(
  ir: Parameters<typeof generateWorkflowBundle>[0],
  options?: Parameters<typeof generateWorkflowBundle>[1],
): string {
  return generateWorkflowBundle(ir, options)
    .files.map((f) => f.source)
    .join('\n')
}

const generateHttp = (
  node: Parameters<typeof generateHttpImpl>[0],
  mode?: Parameters<typeof generateHttpImpl>[2],
) => generateHttpImpl(node, ctx, mode)

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

describe('generateHttp injection safety', () => {
  it('emits header/query keys and the method as JSON literals', () => {
    const key = 'x": (globalThis as any).pwned = true, "y'
    const method = 'GET", (globalThis as any).pwned = true, "x'
    const code = generateHttp(
      makeNode({
        data: {
          url: 'https://api.example.com/data',
          method,
          headers: { [key]: 'v' },
          queryParams: { [key]: 'q' },
        },
      }),
    )
    expect(code).toContain(JSON.stringify(key))
    expect(code).toContain(JSON.stringify(method))
    expect(code).not.toContain(`"${key}":`)
    expect(code).not.toContain(`method: "${method}"`)
  })
})

describe('generateHttp', () => {
  it('generates a basic GET request without options', () => {
    const code = generateHttp(makeNode())
    expect(code).toContain('await fetch("https://api.example.com/data")')
    expect(code).not.toContain('method:')
    expect(code).toContain('flow.step("http-1"')
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

  it('emits body as raw JS expression', () => {
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

  it('labels are id-derived, so quotes in the node name never reach the source', () => {
    const code = generateHttp(makeNode({ name: 'Fetch "important" data' }))
    expect(code).toContain('flow.step("http-1"')
    expect(code).not.toContain('important')
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

/** Every file of a bundle as one text, so an assertion can name any of them. */
function programOfScript(ir: ScriptIR): string {
  return generateScriptBundle(ir)
    .files.map((f) => f.source)
    .join('\n')
}

describe('generateHttp object and array literal bodies', () => {
  const post = (body: string, headers?: Record<string, string>) =>
    makeNode({ data: { url: 'https://api.example.com/data', method: 'POST', body, headers } })

  it('stringifies an object literal body and sends it as JSON', () => {
    const code = generateHttp(post('{ key: "value" }'))
    expect(code).toContain('body: JSON.stringify({ key: "value" })')
    expect(code).toContain('headers: { "Content-Type": "application/json" }')
  })

  it('stringifies an array literal body', () => {
    const code = generateHttp(post('[1, 2]'))
    expect(code).toContain('body: JSON.stringify([1, 2])')
    expect(code).toContain('"Content-Type": "application/json"')
  })

  it('stringifies a multi-line object literal body', () => {
    const code = generateHttp(post('\n{\n  name: state.name,\n  total: state.total,\n}\n'))
    expect(code).toContain('body: JSON.stringify({\n  name: state.name,\n  total: state.total,\n})')
  })

  it('keeps a Content-Type the node already sets, in any case', () => {
    const code = generateHttp(post('{ a: 1 }', { 'content-type': 'text/plain', Accept: '*/*' }))
    expect(code).toContain('headers: { "content-type": "text/plain", "Accept": "*/*" }')
    expect(code).not.toContain('application/json')
    expect(code).toContain('body: JSON.stringify({ a: 1 })')
  })

  it('adds Content-Type next to the headers the node sets', () => {
    const code = generateHttp(post('{ a: 1 }', { Authorization: 'Bearer ${env.API_KEY}' }))
    expect(code).toContain(
      'headers: { "Authorization": `Bearer ${env.API_KEY}`, "Content-Type": "application/json" }',
    )
  })

  it.each([
    'JSON.stringify({ a: 1 })',
    '`amount=${state.total}`',
    '"a=" + b',
    'state.payload',
    'new URLSearchParams({ a: "1" })',
    '[a, b].join(",")',
    '{ a: 1 }.a',
    '({ a: 1 })',
  ])('emits %s unchanged with no header added', (body) => {
    const code = generateHttp(post(body))
    expect(code).toContain(`body: ${body}`)
    expect(code).not.toContain('headers:')
    expect(code).not.toContain(`JSON.stringify(${body})`)
  })

  it('applies the same rule in script mode', () => {
    const literal = generateHttp(post('{ a: 1 }'), 'script')
    expect(literal).toContain('body: JSON.stringify({ a: 1 })')
    expect(literal).toContain('"Content-Type": "application/json"')
    expect(literal).not.toContain('flow.step')

    const expression = generateHttp(post('state.payload'), 'script')
    expect(expression).toContain('body: state.payload')
    expect(expression).not.toContain('headers:')
  })

  it('emits a non-string Body as before instead of throwing', () => {
    const node = makeNode({
      data: { url: 'https://api.example.com/data', method: 'POST', body: 42 },
    })
    expect(() => generateHttp(node)).not.toThrow()
    expect(generateHttp(node)).toContain('body: 42')
  })

  it('leaves out a whitespace-only Body', () => {
    const code = generateHttp(post('   \n '))
    expect(code).toContain('fetch("https://api.example.com/data", { method: "POST" })')
  })

  it('keeps the newline after a trailing line comment in a non-literal Body', () => {
    const code = generateHttp(post('state.payload // raw text\n'))
    expect(code).toContain('body: state.payload // raw text\n')
  })

  it('resolves {{refs}} before deciding, in a workflow and a script', () => {
    const nodes = [
      makeNode({ id: 'src', type: 'step', name: 'src', data: { code: 'return { id: 1 }' } }),
      makeNode({
        id: 'whole',
        data: { url: 'https://a.example', method: 'POST', body: '{{src.payload}}' },
      }),
      makeNode({
        id: 'literal',
        data: { url: 'https://b.example', method: 'POST', body: '{ id: {{src.id}} }' },
      }),
    ]
    const edges = [
      { id: 'e1', source: 'src', target: 'whole' },
      { id: 'e2', source: 'whole', target: 'literal' },
    ]
    const metadata = { name: 'Refs', version: 1, createdAt: '', updatedAt: '' }
    const workflow = programOf({ metadata, entryNodeId: 'src', nodes, edges })
    const script = programOfScript({
      kind: 'script',
      metadata,
      entryNodeId: 'src',
      nodes,
      edges,
      trigger: { type: 'http' },
    })
    for (const code of [workflow, script]) {
      expect(code).toContain('body: src.payload')
      expect(code).not.toContain('JSON.stringify(src.payload)')
      expect(code).toContain('body: JSON.stringify({ id: src.id })')
    }
  })
})
