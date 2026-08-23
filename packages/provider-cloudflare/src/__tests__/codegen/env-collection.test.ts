import { describe, it, expect } from 'vitest'
import type { WorkflowIR, WorkflowNode } from '@awaitstep/ir'
import { collectEnvRefNames } from '../../codegen/generate-helpers.js'
import { generateWorkflow } from '../../codegen/generate.js'

function node(id: string, data: Record<string, unknown>): WorkflowNode {
  return {
    id,
    type: 'step',
    name: id,
    position: { x: 0, y: 0 },
    version: '1.0.0',
    provider: 'cloudflare',
    data,
  }
}

describe('collectEnvRefNames', () => {
  it('collects plain and fallback env refs', () => {
    const names = collectEnvRefNames([
      node('a', { code: 'const k = {{env.API_KEY}};' }),
      node('b', { code: 'const r = {{env.REGION ?? "eu"}};' }),
    ])
    expect(names).toEqual(new Set(['API_KEY', 'REGION']))
  })

  it('collects quoted-key env refs', () => {
    const names = collectEnvRefNames([node('a', { code: '{{env["MY_TOKEN"]}}' })])
    expect(names).toEqual(new Set(['MY_TOKEN']))
  })

  it('ignores non-env refs and bare env', () => {
    const names = collectEnvRefNames([node('a', { code: '{{other.API_KEY}} {{env}}' })])
    expect(names).toEqual(new Set())
  })

  it('collects every resolvable name, whatever the casing', () => {
    const names = collectEnvRefNames([node('a', { code: '{{env.apiKey}} {{env["api-key"]}}' })])
    expect(names).toEqual(new Set(['apiKey', 'api-key']))
  })
})

describe('interface Env collection', () => {
  it('declares env vars referenced with a fallback default', () => {
    const ir: WorkflowIR = {
      metadata: { name: 'EnvTest', version: 1, createdAt: '', updatedAt: '' },
      entryNodeId: 's1',
      nodes: [node('s1', { code: 'return {{env.MY_KEY ?? "none"}};' })],
      edges: [],
    }
    const code = generateWorkflow(ir)
    expect(code).toContain('MY_KEY: string;')
    // Inside the workflow class body, env. is rewritten to this.env.
    expect(code).toContain('(this.env.MY_KEY ?? "none")')
  })

  it('declares quoted Env fields for non-identifier names', () => {
    const ir: WorkflowIR = {
      metadata: { name: 'EnvQuoted', version: 1, createdAt: '', updatedAt: '' },
      entryNodeId: 's1',
      nodes: [node('s1', { code: 'return {{env["api-key"]}};' })],
      edges: [],
    }
    const code = generateWorkflow(ir)
    expect(code).toContain('"api-key": string;')
  })
})
