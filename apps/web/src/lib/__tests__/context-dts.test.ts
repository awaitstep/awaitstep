import { describe, it, expect } from 'vitest'
import type { NodeDefinition } from '@awaitstep/ir'
import { buildWorkflowContextDts } from '../monaco/context-dts'

const geminiDef = {
  outputSchema: {
    text: { type: 'string', description: 'Generated text' },
    data: { type: 'object' },
  },
} as unknown as NodeDefinition

function build(overrides: Partial<Parameters<typeof buildWorkflowContextDts>[0]> = {}) {
  return buildWorkflowContextDts({
    kind: 'workflow',
    nodes: [
      { id: 'n1', name: 'Fetch data', type: 'step' },
      { id: 'n2', name: 'Summarize', type: 'google-gemini' },
    ],
    envVarNames: ['API_KEY'],
    bindings: [{ name: 'CACHE', type: 'kv', resourceName: 'main cache' }],
    resolveDefinition: (type) => (type === 'google-gemini' ? geminiDef : undefined),
    ...overrides,
  })
}

describe('buildWorkflowContextDts', () => {
  it('types Env from declared env vars and bindings, keeping an open index', () => {
    const dts = build()
    expect(dts).toContain('declare interface Env {')
    expect(dts).toContain('WORKFLOW: Workflow;')
    expect(dts).toContain('API_KEY: string;')
    expect(dts).toContain('CACHE: KVNamespace;')
    expect(dts).toContain('[binding: string]: any;')
    expect(dts).toContain('declare const env: Env;')
  })

  it('declares one const per node output, typed from outputSchema with any fallback', () => {
    const dts = build()
    expect(dts).toContain('declare const Fetch_data: any;')
    expect(dts).toContain('/** Output of node "Summarize" (google-gemini) */')
    expect(dts).toMatch(
      /declare const Summarize: \{\n {2}\/\*\* Generated text \*\/\n {2}text: string;/,
    )
  })

  it('declares runGraph with EXPORT_ outputs for scripts', () => {
    const dts = build({
      kind: 'script',
      nodes: [{ id: 'n1', name: 'EXPORT_Result', type: 'google-gemini' }],
    })
    expect(dts).toContain('declare function runGraph(env: Env, event?: unknown): Promise<{')
    expect(dts).toContain('Result: {')
    expect(dts).not.toContain('runGraph(env: Env, event?: unknown): Promise<{\n}>')
  })

  it('omits runGraph for workflows', () => {
    expect(build()).not.toContain('runGraph')
  })

  it('types unmodeled binding kinds as any so method calls never squiggle', () => {
    const dts = build({ bindings: [{ name: 'AI', type: 'ai' }] })
    expect(dts).toContain('AI: any;')
    expect(dts).not.toContain('AI: unknown;')
  })

  it('quotes env var names that are not identifiers', () => {
    const dts = build({ envVarNames: ['MY-KEY'] })
    expect(dts).toContain('"MY-KEY": string;')
  })
})
