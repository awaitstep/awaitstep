import { describe, it, expect } from 'vitest'
import type { WorkflowIR, WorkflowNode } from '@awaitstep/ir'
import { generateWorkflowBundle } from '../../codegen/generate.js'
import { validateSource } from '../../codegen/validate-source.js'

function node(id: string, name: string, data: Record<string, unknown>): WorkflowNode {
  return {
    id,
    type: 'step',
    name,
    position: { x: 0, y: 0 },
    version: '1.0.0',
    provider: 'cloudflare',
    data,
  }
}

const ir: WorkflowIR = {
  metadata: { name: 'EjectDemo', version: 1, createdAt: '', updatedAt: '' },
  entryNodeId: 'fetch',
  nodes: [
    node('fetch', 'Fetch data', { code: 'return await (await fetch(env.URL)).json();' }),
    node('report', 'Report', { code: 'return { ok: true, from: Fetch_data };' }),
  ],
  edges: [{ id: 'e1', source: 'fetch', target: 'report' }],
}

function ejectedBundle() {
  return generateWorkflowBundle(ir, { eject: true })
}

describe('validateSource drift matrix', () => {
  it('freshly ejected bundle validates clean', () => {
    const bundle = ejectedBundle()
    expect(bundle.manifest).toBeDefined()
    expect(validateSource(ir, bundle, bundle.manifest!)).toEqual([])
  })

  it('edits inside a module region stay valid', () => {
    const bundle = ejectedBundle()
    const mod = bundle.files.find((f) => f.path === 'nodes/Fetch_data.ts')!
    mod.source = mod.source.replace(
      'return await (await fetch(env.URL)).json();',
      'const res = await fetch(env.URL, { headers: { "x-custom": "1" } });\n  return res.json();',
    )
    expect(validateSource(ir, bundle, bundle.manifest!)).toEqual([])
  })

  it('deleting a module file fails', () => {
    const bundle = ejectedBundle()
    bundle.files = bundle.files.filter((f) => f.path !== 'nodes/Report.ts')
    const errors = validateSource(ir, bundle, bundle.manifest!)
    expect(errors.some((e) => e.message.includes('nodes/Report.ts'))).toBe(true)
  })

  it('renaming a step.do label fails', () => {
    const bundle = ejectedBundle()
    const entry = bundle.files.find((f) => f.path === 'worker.ts')!
    entry.source = entry.source.replace('step.do("fetch"', 'step.do("Renamed"')
    const errors = validateSource(ir, bundle, bundle.manifest!)
    expect(errors.some((e) => e.nodeId === 'fetch' && e.message.includes('step.do'))).toBe(true)
  })

  it('a node removed from the IR fails with regenerate guidance', () => {
    const bundle = ejectedBundle()
    const trimmed: WorkflowIR = { ...ir, nodes: ir.nodes.filter((n) => n.id !== 'report') }
    const errors = validateSource(trimmed, bundle, bundle.manifest!)
    expect(errors.some((e) => e.nodeId === 'report' && e.message.includes('regenerate'))).toBe(true)
  })

  it('an unsafe file path fails structural validation', () => {
    const bundle = ejectedBundle()
    bundle.files.push({ path: '../escape.ts', source: '', role: 'module' })
    const errors = validateSource(ir, bundle, bundle.manifest!)
    expect(errors).toHaveLength(1)
    expect(errors[0]!.path).toBe('source')
  })
  it('a workflow with a sleep node ejects and validates clean', () => {
    const sleepIR: WorkflowIR = {
      metadata: { name: 'SleepDemo', version: 1, createdAt: '', updatedAt: '' },
      entryNodeId: 'fetch',
      nodes: [
        node('fetch', 'Fetch data', { code: 'return 1;' }),
        {
          id: 'nap',
          type: 'sleep',
          name: 'Wait a bit',
          position: { x: 0, y: 1 },
          version: '1.0.0',
          provider: 'cloudflare',
          data: { duration: '5 minutes' },
        },
      ],
      edges: [{ id: 'e1', source: 'fetch', target: 'nap' }],
    }
    const bundle = generateWorkflowBundle(sleepIR, { eject: true })
    const napEntry = bundle.manifest!.steps.find((s) => s.nodeId === 'nap')!
    expect(napEntry.stepName).toBe('nap')
    expect(napEntry.kind).toBe('sleep')
    expect(validateSource(sleepIR, bundle, bundle.manifest!)).toEqual([])
  })

  it('single-quoted step.do labels still pass the rename check', () => {
    const bundle = ejectedBundle()
    for (const f of bundle.files) {
      f.source = f.source.replace(/step\.do\("([^"]+)"/g, "step.do('$1'")
    }
    expect(validateSource(ir, bundle, bundle.manifest!)).toEqual([])
  })
})
