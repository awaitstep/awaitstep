import { describe, it, expect } from 'vitest'
import type { WorkflowIR, ScriptIR } from '@awaitstep/ir'
import { generateWorkflow, generateScript } from '../../codegen/generate.js'
import { DEFAULT_RETENTION, resolveRetention, retentionLiteral } from '../../codegen/retention.js'
import simpleWorkflow from './fixtures/simple-workflow.json'

describe('resolveRetention', () => {
  it('falls back to the 7-day default when unset', () => {
    expect(resolveRetention(undefined)).toEqual(DEFAULT_RETENTION)
  })

  it('falls back to the 7-day default for an empty object', () => {
    expect(resolveRetention({})).toEqual(DEFAULT_RETENTION)
  })

  it('keeps a partial config as-is so Cloudflare defaults the other field', () => {
    expect(resolveRetention({ errorRetention: '30 days' })).toEqual({ errorRetention: '30 days' })
  })

  it('keeps an explicit config untouched', () => {
    const retention = { successRetention: '1 day', errorRetention: 604800000 }
    expect(resolveRetention(retention)).toBe(retention)
  })
})

describe('retentionLiteral', () => {
  it('renders the 7-day default', () => {
    expect(retentionLiteral()).toBe('{ successRetention: "7 days", errorRetention: "7 days" }')
  })

  it('renders numbers unquoted and omits unset fields', () => {
    expect(retentionLiteral({ successRetention: 86400000 })).toBe('{ successRetention: 86400000 }')
  })
})

describe('generated retention wiring', () => {
  const ir = simpleWorkflow as unknown as WorkflowIR

  it('emits the default AWAITSTEP_RETENTION const and passes it to create()', () => {
    const code = generateWorkflow(ir)
    expect(code).toContain(
      'const AWAITSTEP_RETENTION = { successRetention: "7 days", errorRetention: "7 days" };',
    )
    expect(code).toContain('env.WORKFLOW.create({ params, retention: AWAITSTEP_RETENTION })')
  })

  it('bakes a configured retention into the const', () => {
    const code = generateWorkflow(ir, {
      retention: { successRetention: '1 day', errorRetention: '14 days' },
    })
    expect(code).toContain(
      'const AWAITSTEP_RETENTION = { successRetention: "1 day", errorRetention: "14 days" };',
    )
  })

  it('omits the const from scripts without sub-workflow nodes', () => {
    const scriptIr: ScriptIR = {
      ...(simpleWorkflow as unknown as WorkflowIR),
      kind: 'script',
      trigger: { type: 'http' },
    } as ScriptIR
    const code = generateScript(scriptIr)
    expect(code).not.toContain('AWAITSTEP_RETENTION')
  })

  it('emits the const for scripts containing a sub-workflow node', () => {
    const base = simpleWorkflow as unknown as WorkflowIR
    const scriptIr = {
      ...base,
      kind: 'script',
      trigger: { type: 'http' },
      nodes: [
        ...base.nodes,
        {
          id: 'sub1',
          type: 'sub_workflow',
          name: 'Run child',
          position: { x: 0, y: 0 },
          version: '1.0.0',
          provider: 'cloudflare',
          data: { workflowName: 'ChildFlow', waitForCompletion: false },
        },
      ],
      edges: [
        ...base.edges,
        { id: 'e-sub1', source: base.nodes[base.nodes.length - 1].id, target: 'sub1' },
      ],
    } as unknown as ScriptIR
    const code = generateScript(scriptIr)
    expect(code).toContain(
      'const AWAITSTEP_RETENTION = { successRetention: "7 days", errorRetention: "7 days" };',
    )
    expect(code).toContain('retention: AWAITSTEP_RETENTION })')
  })
})
