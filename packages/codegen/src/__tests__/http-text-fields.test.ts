import { describe, expect, it } from 'vitest'
import type { WorkflowNode } from '@awaitstep/ir'
import { resolveNodeExpressions } from '../index.js'
import { generateHttp } from '../graph/generators/http.js'
import { generateSubScript } from '../graph/generators/sub-script.js'
import { FieldExpression } from '../graph/generators/custom.js'
import type { GenerationContext } from '../graph/internal.js'

function httpNode(data: Record<string, unknown>): WorkflowNode {
  return {
    id: 'notify',
    type: 'http_request',
    name: 'notify',
    position: { x: 0, y: 0 },
    version: '1.0.0',
    provider: 'cloudflare',
    data: { method: 'GET', ...data },
  }
}

const codeOf = (value: unknown): unknown => (value instanceof FieldExpression ? value.code : value)

const ctx = { varName: (id: string) => id } as unknown as GenerationContext

function emittedUrl(data: Record<string, unknown>): string {
  const code = generateHttp(
    resolveNodeExpressions(httpNode(data), (id) => id),
    ctx,
  )
  const match = /flow\.http\(\{ url: (.*) \}\)/.exec(code)
  if (!match) throw new Error(`no url in ${code}`)
  return match[1]!
}

describe('expressions in HTTP text fields', () => {
  it('keeps a backtick and a backslash inside an expression intact', () => {
    const url = emittedUrl({ url: 'https://x/{{load.items["a`b"] ?? "C:\\\\x"}}/end' })
    expect(url).toBe('`https://x/${(load.items["a`b"] ?? "C:\\\\x")}/end`')
    const evaluate = new Function('load', `return ${url}`) as (load: unknown) => string
    expect(evaluate({ items: { 'a`b': 'ok' } })).toBe('https://x/ok/end')
    expect(evaluate({ items: {} })).toBe('https://x/C:\\x/end')
  })

  it('escapes a backtick or backslash in the text around an expression', () => {
    const url = emittedUrl({ url: 'https://x/a`b\\c/{{load.id}}' })
    const evaluate = new Function('load', `return ${url}`) as (load: unknown) => string
    expect(evaluate({ id: 7 })).toBe('https://x/a`b\\c/7')
  })

  it('keeps a hand-written ${…} live next to an expression', () => {
    const resolved = resolveNodeExpressions(
      httpNode({ headers: { Authorization: '${env.SCHEME} {{load.token}}' } }),
      (id) => id,
    )
    const code = generateHttp(resolved, ctx)
    expect(code).toContain('"Authorization": `${env.SCHEME} ${load.token}`')
  })

  it('keeps an unclosed ${ as text so the template stays valid JS', () => {
    const url = emittedUrl({ url: 'https://x/a${b/{{load.id}}' })
    const evaluate = new Function('load', `return ${url}`) as (load: unknown) => string
    expect(evaluate({ id: 7 })).toBe('https://x/a${b/7')
  })

  it('interpolates only the URL, headers and query values', () => {
    const resolved = resolveNodeExpressions(
      httpNode({
        url: 'https://x/{{load.id}}',
        timeout: '{{load.wait}}',
        body: '{{load.payload}}',
        headers: { 'X-Id': '{{load.id}}' },
        queryParams: { id: '{{load.id}}' },
      }),
      (id) => id,
    )
    expect(resolved.data.timeout).toBe('load.wait')
    expect(resolved.data.body).toBe('load.payload')
    const headers = resolved.data.headers as Record<string, unknown>
    const query = resolved.data.queryParams as Record<string, unknown>
    expect(codeOf(resolved.data.url)).toBe('`https://x/${load.id}`')
    expect(codeOf(headers['X-Id'])).toBe('`${load.id}`')
    expect(codeOf(query.id)).toBe('`${load.id}`')
  })

  it('leaves another built-in node in code mode', () => {
    const resolved = resolveNodeExpressions(
      { ...httpNode({}), type: 'sub_workflow', data: { input: '{{load.id}}' } },
      (id) => id,
    )
    expect(resolved.data.input).toBe('load.id')
  })
})

describe('expressions in sub_script text fields', () => {
  function subScriptCode(data: Record<string, unknown>): string {
    const node: WorkflowNode = {
      ...httpNode({}),
      id: 'price',
      name: 'price',
      type: 'sub_script',
      data: { scriptId: 'pricing-svc', method: 'POST', ...data },
    }
    return generateSubScript(
      resolveNodeExpressions(node, (id) => id),
      ctx,
      'script',
    )
  }

  it('interpolates the URL and header values instead of quoting the expression', () => {
    const code = subScriptCode({
      url: 'https://pricing/quote/{{load.id}}',
      headers: { 'X-Order': '{{load.id}}', Accept: 'application/json' },
    })
    expect(code).toContain('url: `https://pricing/quote/${load.id}`')
    expect(code).toContain('headers: {"X-Order":`${load.id}`,"Accept":"application/json"}')
    expect(code).not.toContain('"https://pricing/quote/load.id"')
  })

  it('keeps a typed ${…} as text, as a plain sub_script string always was', () => {
    const code = subScriptCode({ url: 'https://pricing/${raw}/{{load.id}}' })
    const match = /url: (`[^`]*`)/.exec(code)
    const evaluate = new Function('load', `return ${match![1]}`) as (load: unknown) => string
    expect(evaluate({ id: 7 })).toBe('https://pricing/${raw}/7')
  })

  it('writes a URL and headers without expressions exactly as before', () => {
    const code = subScriptCode({ url: 'https://pricing/quote', headers: { A: 'b' } })
    expect(code).toContain('url: "https://pricing/quote", headers: {"A":"b"}')
  })
})
