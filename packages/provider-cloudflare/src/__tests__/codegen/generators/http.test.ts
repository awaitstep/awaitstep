import ts from 'typescript'
import type { ScriptIR, WorkflowNode } from '@awaitstep/ir'
import { describe, it, expect } from 'vitest'
import { testCtx as ctx } from '../test-context.js'
import { generateHttp } from '@awaitstep/codegen'
import { generateWorkflowBundle, generateScriptBundle } from '../../../codegen/generate.js'

const generate = (node: WorkflowNode) => generateHttp(node, ctx)

/** Every file of the bundle as one text. */
function programOf(ir: Parameters<typeof generateWorkflowBundle>[0]): string {
  return generateWorkflowBundle(ir)
    .files.map((f) => f.source)
    .join('\n')
}

function programOfScript(ir: ScriptIR): string {
  return generateScriptBundle(ir)
    .files.map((f) => f.source)
    .join('\n')
}

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
  it('emits one flow.http call outside a step by default, and no fetch of its own', () => {
    const code = generate(makeNode())
    expect(code).toContain('const http_1 = await flow.http({')
    expect(code).toContain('url: "https://api.example.com/data"')
    expect(code).not.toContain('flow.step(')
    expect(code).not.toContain('fetch(')
    expect(code).not.toContain('response.json()')
    expect(code).not.toContain('method:')
  })

  it('wraps the call in a step when the node is durable', () => {
    const code = generate(
      makeNode({ data: { url: 'https://a.example', method: 'POST', durable: true } }),
    )
    expect(code).toContain('await flow.step("http-1", async () => flow.http({')
    expect(code).toContain('method: "POST"')
  })

  it('carries the method only when it is not GET', () => {
    const get = generate(makeNode({ data: { url: 'https://a.example', method: 'GET' } }))
    expect(get).not.toContain('method:')
    const post = generate(makeNode({ data: { url: 'https://a.example', method: 'POST' } }))
    expect(post).toContain('method: "POST"')
  })

  it('passes headers and query params as object values for the runtime to apply', () => {
    const code = generate(
      makeNode({
        data: {
          url: 'https://api.example.com/data',
          method: 'GET',
          headers: { Accept: 'application/json' },
          queryParams: { page: '1', limit: '10' },
        },
      }),
    )
    expect(code).toContain('headers: { "Accept": "application/json" }')
    expect(code).toContain('queryParams: { "page": "1", "limit": "10" }')
    expect(code).not.toContain('new URL')
    expect(code).not.toContain('searchParams')
  })

  it('omits empty headers and query params', () => {
    const code = generate(
      makeNode({ data: { url: 'https://a.example', method: 'GET', headers: {}, queryParams: {} } }),
    )
    expect(code).not.toContain('headers:')
    expect(code).not.toContain('queryParams:')
  })

  it('keeps expressions in URLs, header values and query values', () => {
    const code = generate(
      makeNode({
        data: {
          url: 'https://api.example.com/users/${state.userId}',
          method: 'GET',
          headers: { Authorization: 'Bearer ${env.API_KEY}' },
          queryParams: { cursor: '${state.nextCursor}' },
        },
      }),
    )
    expect(code).toContain('url: `https://api.example.com/users/${state.userId}`')
    expect(code).toContain('"Authorization": `Bearer ${env.API_KEY}`')
    expect(code).toContain('"cursor": `${state.nextCursor}`')
    expect(code).not.toContain('"https://api.example.com/users/${state.userId}"')
  })

  it('sends an object or array literal as a value for the runtime to encode', () => {
    const object = generate(
      makeNode({ data: { url: 'https://a.example', method: 'POST', body: '{ key: "value" }' } }),
    )
    expect(object).toContain('body: { key: "value" }')
    expect(object).not.toContain('JSON.stringify({ key: "value" })')
    // The runtime sets Content-Type for an encoded value; the emitter does not.
    expect(object).not.toContain('Content-Type')

    const array = generate(
      makeNode({ data: { url: 'https://a.example', method: 'POST', body: '[1, 2]' } }),
    )
    expect(array).toContain('body: [1, 2]')
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
  ])('emits %s unchanged', (body) => {
    const code = generate(makeNode({ data: { url: 'https://a.example', method: 'POST', body } }))
    expect(code).toContain(`body: ${body}`)
    expect(code).not.toContain(`JSON.stringify(${body})`)
  })

  it('keeps the newline after a trailing line comment in a non-literal Body', () => {
    const code = generate(
      makeNode({
        data: { url: 'https://a.example', method: 'POST', body: 'state.payload // x\n' },
      }),
    )
    expect(code).toContain('body: state.payload // x\n')
  })

  it('closes the call after a body that ends in a line comment', () => {
    const code = generate(
      makeNode({
        data: { url: 'https://a.example', method: 'POST', body: 'state.payload // raw' },
      }),
    )
    // The comment must not swallow the closing braces: the emitted call parses.
    const { diagnostics } = ts.transpileModule(code, {
      compilerOptions: { target: ts.ScriptTarget.ES2022 },
      reportDiagnostics: true,
    })
    expect(diagnostics ?? []).toEqual([])
    expect(code).toContain('body: state.payload // raw\n')
  })

  it('leaves out a whitespace-only Body', () => {
    const code = generate(
      makeNode({ data: { url: 'https://a.example', method: 'POST', body: '   \n ' } }),
    )
    expect(code).not.toContain('body:')
  })

  it('emits a non-string Body instead of throwing', () => {
    const node = makeNode({ data: { url: 'https://a.example', method: 'POST', body: 42 } })
    expect(() => generate(node)).not.toThrow()
    expect(generate(node)).toContain('body: 42')
  })

  it('emits a bare call unless the node is durable', () => {
    const code = generate(
      makeNode({ data: { url: 'https://a.example', method: 'GET', durable: false } }),
    )
    expect(code).toContain('const http_1 = await flow.http({')
    expect(code).not.toContain('flow.step')
  })

  it('carries the retry policy and timeout from the node’s loose fields', () => {
    const code = generate(
      makeNode({
        data: {
          url: 'https://a.example',
          method: 'GET',
          retryLimit: 3,
          timeout: '30 seconds',
          durable: true,
        },
      }),
    )
    expect(code).toContain(
      'flow.step("http-1", { retries: { limit: 3, delay: "10 seconds" }, timeout: "30 seconds" },',
    )
  })

  it('omits config when the node sets none', () => {
    const code = generate(makeNode({ data: { url: 'https://a.example', durable: true } }))
    expect(code).not.toContain('retries')
    expect(code).not.toContain('timeout')
  })

  it('sanitizes the node id for the variable name', () => {
    const code = generate(makeNode({ id: 'fetch-user-data' }))
    expect(code).toContain('const fetch_user_data =')
  })

  it('labels are id-derived, so quotes in the node name never reach the source', () => {
    const code = generate(
      makeNode({
        name: 'Fetch "important" data',
        data: { url: 'https://a.example', durable: true },
      }),
    )
    expect(code).toContain('flow.step("http-1"')
    expect(code).not.toContain('important')
  })

  it('emits header/query keys and the method as JSON literals', () => {
    const key = 'x": (globalThis as any).pwned = true, "y'
    const method = 'GET", (globalThis as any).pwned = true, "x'
    const code = generate(
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

  it('does not throw without a URL', () => {
    expect(() => generate(makeNode({ data: {} }))).not.toThrow()
  })
})

describe('generateHttp in a bundle', () => {
  const refs = [
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

  it('resolves {{refs}} before deciding, in a workflow and a script', () => {
    const workflow = programOf({ metadata, entryNodeId: 'src', nodes: refs, edges })
    const script = programOfScript({
      kind: 'script',
      metadata,
      entryNodeId: 'src',
      nodes: refs,
      edges,
      trigger: { type: 'http' },
    })
    for (const code of [workflow, script]) {
      expect(code).toContain('flow.http({')
      expect(code).toContain('body: src.payload')
      expect(code).not.toContain('JSON.stringify(src.payload)')
      expect(code).toContain('body: { id: src.id }')
    }
  })

  it('emits the same shape in a function as in a workflow', () => {
    const nodes = [makeNode({ data: { url: 'https://a.example', method: 'GET', durable: true } })]
    const workflow = programOf({ metadata, entryNodeId: 'http-1', nodes, edges: [] })
    const script = programOfScript({
      kind: 'script',
      metadata,
      entryNodeId: 'http-1',
      nodes,
      edges: [],
      trigger: { type: 'http' },
    } as ScriptIR)
    for (const code of [workflow, script]) {
      expect(code).toContain('flow.step("http-1", async () => flow.http({')
    }
  })
})
