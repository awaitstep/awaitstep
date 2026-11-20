import { describe, expect, it } from 'vitest'
import type { WorkflowIR, WorkflowNode } from '@awaitstep/ir'
import { generateWorkflowBundle } from '../../codegen/generate.js'

/**
 * An expression in a built-in HTTP field is a value the runtime builds, not a
 * code path: the generator must receive `${…}`, or it quotes the braces and
 * calls a URL that still contains `order.id`.
 */
function node(id: string, name: string, data: Record<string, unknown>): WorkflowNode {
  return {
    id,
    type: 'http_request',
    name,
    position: { x: 0, y: 0 },
    version: '1.0.0',
    provider: 'cloudflare',
    data,
  }
}

function sourceOf(ir: WorkflowIR): string {
  return generateWorkflowBundle(ir)
    .files.map((file) => file.source)
    .join('\n')
}

describe('expressions in HTTP values', () => {
  it('interpolates a URL, a header value and a query value', () => {
    const ir: WorkflowIR = {
      kind: 'workflow',
      irVersion: 3,
      metadata: {
        name: 'http expressions',
        version: 1,
        createdAt: '2026-11-20T00:00:00.000Z',
        updatedAt: '2026-11-20T00:00:00.000Z',
      },
      entryNodeId: 'load',
      nodes: [
        {
          id: 'load',
          type: 'step',
          name: 'load',
          position: { x: 0, y: 0 },
          version: '1.0.0',
          provider: 'cloudflare',
          data: {
            code: 'export default async function load() {\n  return { id: "ord_1" }\n}\n',
          },
        },
        node('notify', 'notify', {
          method: 'GET',
          url: 'https://api.example.com/orders/{{load.id}}',
          headers: { Authorization: 'Bearer {{env.TOKEN}}' },
          queryParams: { cursor: '{{load.id}}' },
        }),
      ],
      edges: [{ id: 'e1', source: 'load', target: 'notify' }],
    }

    const source = sourceOf(ir)
    expect(source).toContain('url: `https://api.example.com/orders/${load.id}`')
    expect(source).toContain('"Authorization": `Bearer ${env.TOKEN}`')
    expect(source).toContain('"cursor": `${load.id}`')
    expect(source).not.toContain('"https://api.example.com/orders/load.id"')
    expect(source).not.toContain('"Bearer env.TOKEN"')
    expect(source).not.toContain('"load.id"')
  })

  it('compiles an expression that sits only in a header or query value', () => {
    const ir: WorkflowIR = {
      kind: 'workflow',
      irVersion: 3,
      metadata: {
        name: 'header expressions',
        version: 1,
        createdAt: '2026-11-20T00:00:00.000Z',
        updatedAt: '2026-11-20T00:00:00.000Z',
      },
      entryNodeId: 'load',
      nodes: [
        {
          id: 'load',
          type: 'step',
          name: 'load',
          position: { x: 0, y: 0 },
          version: '1.0.0',
          provider: 'cloudflare',
          data: {
            code: 'export default async function load() {\n  return { id: "ord_1" }\n}\n',
          },
        },
        node('notify', 'notify', {
          method: 'GET',
          url: 'https://api.example.com/orders',
          headers: { Authorization: 'Bearer {{load.id}}' },
          queryParams: { cursor: '{{load.id}}' },
        }),
      ],
      edges: [{ id: 'e1', source: 'load', target: 'notify' }],
    }

    const source = sourceOf(ir)
    expect(source).toContain('"Authorization": `Bearer ${load.id}`')
    expect(source).toContain('"cursor": `${load.id}`')
    expect(source).not.toContain('{{load.id}}')
  })
})
