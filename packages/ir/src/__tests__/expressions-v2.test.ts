import { describe, it, expect } from 'vitest'
import {
  parseExpressionContent,
  scanExpressions,
  findMalformedExpressions,
  compileExpression,
  resolveExpressions,
  resolveExpressionType,
  findExpressions,
  containsExpressions,
} from '../expressions'
import type { ArtifactIR, WorkflowNode } from '../types.js'
import type { NodeDefinition } from '../node-definition.js'
import httpRequestDefinitionFixture from './fixtures/http-request-definition.json'

describe('parseExpressionContent — v2 grammar', () => {
  it('parses bracket index access', () => {
    expect(parseExpressionContent('a.items[0]')).toEqual({
      ref: 'a',
      segments: [
        { kind: 'prop', name: 'items' },
        { kind: 'index', value: 0 },
      ],
    })
  })

  it('parses quoted key access with both quote styles', () => {
    expect(parseExpressionContent('a["x-y"]')).toEqual({
      ref: 'a',
      segments: [{ kind: 'key', value: 'x-y' }],
    })
    expect(parseExpressionContent("a['x y']")).toEqual({
      ref: 'a',
      segments: [{ kind: 'key', value: 'x y' }],
    })
  })

  it('treats all-digit dot segments as indexes', () => {
    expect(parseExpressionContent('a.items.0.name')).toEqual({
      ref: 'a',
      segments: [
        { kind: 'prop', name: 'items' },
        { kind: 'index', value: 0 },
        { kind: 'prop', name: 'name' },
      ],
    })
  })

  it('parses fallback literals of every kind', () => {
    expect(parseExpressionContent('a.b ?? "x"')?.fallback).toEqual({ kind: 'string', value: 'x' })
    expect(parseExpressionContent('a.b ?? 42')?.fallback).toEqual({ kind: 'number', value: 42 })
    expect(parseExpressionContent('a.b ?? -1.5')?.fallback).toEqual({
      kind: 'number',
      value: -1.5,
    })
    expect(parseExpressionContent('a.b ?? true')?.fallback).toEqual({
      kind: 'boolean',
      value: true,
    })
    expect(parseExpressionContent('a.b ?? null')?.fallback).toEqual({ kind: 'null' })
  })

  it('allows compact fallback spacing', () => {
    expect(parseExpressionContent('a.b??0')?.fallback).toEqual({ kind: 'number', value: 0 })
  })

  it('rejects leading/trailing whitespace (v1 behavior preserved)', () => {
    expect(parseExpressionContent(' a.b')).toBeNull()
    expect(parseExpressionContent('a.b ')).toBeNull()
    expect(parseExpressionContent(' ')).toBeNull()
  })

  it('rejects hyphenated refs, dangling operators, and junk', () => {
    expect(parseExpressionContent('my-step.output')).toBeNull()
    expect(parseExpressionContent('a.b ??')).toBeNull()
    expect(parseExpressionContent('a..b')).toBeNull()
    expect(parseExpressionContent('a[b]')).toBeNull()
    expect(parseExpressionContent('a.b + 1')).toBeNull()
  })
})

describe('scanExpressions', () => {
  it('finds an expression after a stray opening brace (v1 backtracking)', () => {
    const spans = scanExpressions('{{oops {{a.b}}')
    expect(spans).toHaveLength(1)
    expect(spans[0].raw).toBe('{{a.b}}')
  })

  it('skips invalid candidates without consuming valid ones', () => {
    const spans = scanExpressions('{{ nope }} then {{a.b}}')
    expect(spans).toHaveLength(1)
    expect(spans[0].ast.ref).toBe('a')
  })
})

describe('compileExpression / resolveExpressions — v2 output', () => {
  it('compiles indexing and quoted keys', () => {
    expect(resolveExpressions('{{a.items[0]["x-y"]}}')).toBe('a.items[0]["x-y"]')
  })

  it('compiles numeric dot segments to bracket access', () => {
    expect(resolveExpressions('{{a.items.0.name}}')).toBe('a.items[0].name')
  })

  it('compiles digit-prefixed word segments to quoted bracket access', () => {
    expect(resolveExpressions('{{a.items.0th}}')).toBe('a.items["0th"]')
  })

  it('tolerates trailing padding after a fallback literal', () => {
    expect(resolveExpressions('{{name ?? "anon" }}')).toBe('(name ?? "anon")')
  })

  it('compiles fallbacks to parenthesized nullish coalescing', () => {
    expect(resolveExpressions('{{a.b ?? "x"}}')).toBe('(a.b ?? "x")')
    expect(resolveExpressions('{{a.b ?? null}}')).toBe('(a.b ?? null)')
  })

  it('wraps compiled fallbacks in interpolation context', () => {
    expect(resolveExpressions('{{a.b ?? 1}}', (id) => id, 'interpolation')).toBe('${(a.b ?? 1)}')
  })

  it('applies the name resolver to the ref only', () => {
    const out = compileExpression(
      { ref: 'n1', segments: [{ kind: 'prop', name: 'x' }] },
      (ref) => `vars.${ref}`,
    )
    expect(out).toBe('vars.n1.x')
  })

  it('leaves malformed candidates untouched', () => {
    expect(resolveExpressions('{{a-b.c}} and {{a.b}}')).toBe('{{a-b.c}} and a.b')
  })
})

describe('findMalformedExpressions', () => {
  it('reports candidates that fail to parse', () => {
    const malformed = findMalformedExpressions('{{my-step.output}} ok {{a.b}}')
    expect(malformed).toHaveLength(1)
    expect(malformed[0].raw).toBe('{{my-step.output}}')
  })

  it('does not report a stray brace that wraps a valid expression', () => {
    expect(findMalformedExpressions('{{oops {{a.b}}')).toEqual([])
  })

  it('returns empty for clean strings', () => {
    expect(findMalformedExpressions('{{a.b}} plain')).toEqual([])
  })
})

// ── resolveExpressionType ──

function makeIr(nodes: WorkflowNode[]): ArtifactIR {
  return {
    metadata: { name: 'T', version: 1, createdAt: '', updatedAt: '' },
    nodes,
    edges: [],
    entryNodeId: nodes[0]?.id ?? '',
  }
}

const httpNode: WorkflowNode = {
  id: 'req',
  type: 'http_request',
  name: 'Req',
  position: { x: 0, y: 0 },
  version: '1.0.0',
  provider: 'cloudflare',
  data: {},
}

const lookup = {
  get(type: string): NodeDefinition | undefined {
    return type === 'http_request' ? (httpRequestDefinitionFixture as NodeDefinition) : undefined
  },
}

describe('resolveExpressionType', () => {
  const ir = makeIr([httpNode])

  function typeOf(content: string) {
    const ast = parseExpressionContent(content)
    expect(ast).not.toBeNull()
    return resolveExpressionType(ast!, ir, lookup)
  }

  it('resolves a top-level output property', () => {
    expect(typeOf('req.status')).toEqual({ type: 'number' })
  })

  it('walks objects and arrays through indexing', () => {
    expect(typeOf('req.body.items[0].id')).toEqual({ type: 'string' })
  })

  it('returns the root object for a bare ref', () => {
    expect(typeOf('req')?.type).toBe('object')
  })

  it('returns undefined for unknown paths, nodes, and reserved refs', () => {
    expect(typeOf('req.nope')).toBeUndefined()
    expect(typeOf('ghost.x')).toBeUndefined()
    expect(typeOf('env.API_KEY')).toBeUndefined()
    expect(typeOf('event.payload.x')).toBeUndefined()
  })

  it('returns undefined when indexing a non-array', () => {
    expect(typeOf('req.status[0]')).toBeUndefined()
  })
})

describe('findExpressions / containsExpressions', () => {
  function node(data: Record<string, unknown>): WorkflowNode {
    return { ...httpNode, data }
  }

  it('finds expressions in top-level strings and array-of-object fields', () => {
    const found = findExpressions(
      node({
        url: 'https://x/{{a.id}}',
        branches: [{ label: 'yes', condition: '{{b.ok}}' }],
      }),
    )
    expect(found).toHaveLength(2)
    expect(found[0]).toMatchObject({ dataKey: 'url' })
    expect(found[1]).toMatchObject({ dataKey: 'branches', arrayIndex: 0, arrayKey: 'condition' })
  })

  it('containsExpressions matches the resolution surface exactly', () => {
    // Plain nested objects (headers) are never resolved, so never detected.
    expect(containsExpressions(node({ headers: { auth: '{{a.token}}' } }))).toBe(false)
    expect(containsExpressions(node({ url: '{{a.token}}' }))).toBe(true)
    // Branch arms ARE resolved, so they must trigger detection too.
    expect(containsExpressions(node({ branches: [{ label: 'y', condition: '{{b.ok}}' }] }))).toBe(
      true,
    )
  })
})
