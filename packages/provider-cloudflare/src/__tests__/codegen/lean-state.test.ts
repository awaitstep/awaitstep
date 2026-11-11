import { describe, it, expect } from 'vitest'
import type { WorkflowIR, WorkflowNode } from '@awaitstep/ir'
import { workflowSource } from './bundle-source.js'
import { buildOutputConsumption } from '@awaitstep/codegen'
import { generateWorkflowBundle } from '../../codegen/generate.js'

function node(
  id: string,
  type: string,
  data: Record<string, unknown> = {},
  extra: Partial<WorkflowNode> = {},
): WorkflowNode {
  return {
    id,
    type,
    name: `Node ${id}`,
    position: { x: 0, y: 0 },
    version: '1.0.0',
    provider: 'cloudflare',
    data,
    ...extra,
  }
}

function ir(nodes: WorkflowNode[], edges: WorkflowIR['edges']): WorkflowIR {
  return {
    metadata: { name: 'LeanDemo', version: 1, createdAt: '', updatedAt: '' },
    entryNodeId: nodes[0]!.id,
    nodes,
    edges,
  }
}

describe('buildOutputConsumption', () => {
  const demo = ir(
    [
      node('a', 'step', { code: 'return 1;' }),
      node('b', 'step', { code: 'return Node_a + 1;' }),
      node('keep', 'step', { code: 'return secret();' }, { name: 'EXPORT_Keep' }),
    ],
    [
      { id: 'e1', source: 'a', target: 'b' },
      { id: 'e2', source: 'b', target: 'keep' },
    ],
  )
  const consumption = buildOutputConsumption(demo, (id) => `Node_${id}`)

  it('sees whole-word references in other nodes data', () => {
    expect(consumption.isConsumed('a')).toBe(true)
    expect(consumption.isConsumed('b')).toBe(false)
  })

  it('honors the exclude set for group-scoped analysis', () => {
    expect(consumption.isConsumed('a', new Set(['b']))).toBe(false)
  })

  it('always keeps EXPORT_-marked nodes', () => {
    expect(consumption.isConsumed('keep')).toBe(true)
  })

  it('counts a module that reads `inputs` whole as consuming its upstream', () => {
    const whole = ir(
      [
        node('a', 'step', { code: 'return 1;' }),
        node('b', 'step', { code: 'console.log(inputs);' }),
      ],
      [{ id: 'e1', source: 'a', target: 'b' }],
    )
    expect(buildOutputConsumption(whole, (id) => `Node_${id}`).isConsumed('a')).toBe(true)
  })
})

describe('lean stored state in generated workflows', () => {
  it('stores a step a whole-inputs reader receives', () => {
    // The sleep keeps the two steps from coalescing into one group.
    const demo = ir(
      [
        node('producer', 'step', { code: 'return 1;' }),
        node('gap', 'sleep', { duration: '1 minute' }),
        node('reader', 'step', { code: 'console.log(inputs);' }),
      ],
      [
        { id: 'e1', source: 'producer', target: 'gap' },
        { id: 'e2', source: 'gap', target: 'reader' },
      ],
    )
    const code = workflowSource(generateWorkflowBundle(demo))
    expect(code).toMatch(/const Node_producer = await flow\.step\("producer"/)
    expect(code).not.toContain('async (ctx) => {')
  })

  it('a sleep-separated unreferenced step swallows its return; a referenced one stores it', () => {
    // The sleep keeps used/unused from coalescing into one group, so both
    // singleton emission paths are exercised.
    const demo = ir(
      [
        node('used', 'step', { code: 'return 1;' }),
        node('gap', 'sleep', { duration: '1 minute' }),
        node('unused', 'step', { code: 'return 2;' }),
        node('reader', 'http_request', {
          url: 'https://api.example.com/items/${Node_used}',
          method: 'GET',
        }),
      ],
      [
        { id: 'e1', source: 'used', target: 'gap' },
        { id: 'e2', source: 'gap', target: 'unused' },
        { id: 'e3', source: 'unused', target: 'reader' },
      ],
    )
    const entry = workflowSource(generateWorkflowBundle(demo))
    // Referenced through an http url expression → stored.
    expect(entry).toContain('const Node_used = await flow.step("used"')
    // Unreferenced → no const, return discarded by the braced wrapper.
    expect(entry).not.toContain('const Node_unused')
    expect(entry).toMatch(
      /await flow\.step\("unused", \{ retries: [^\n]*\}, async \(ctx\) => \{\s+await \$Node_unused\(/,
    )
  })

  it('an EXPORT_-named step keeps its stored return even when unreferenced', () => {
    const demo = ir([node('out', 'step', { code: 'return 42;' }, { name: 'EXPORT_Result' })], [])
    const entry = workflowSource(generateWorkflowBundle(demo))
    expect(entry).toContain('const Result = await flow.step("out"')
  })

  it('container children are never leaned — container glue reads their vars', () => {
    const demo = ir(
      [
        node('fan', 'parallel', {}),
        node('pa', 'step', { code: 'return 1;' }),
        node('pb', 'step', { code: 'return 2;' }),
      ],
      [
        { id: 'e1', source: 'fan', target: 'pa' },
        { id: 'e2', source: 'fan', target: 'pb' },
      ],
    )
    const entry = workflowSource(generateWorkflowBundle(demo))
    // Nothing references pa/pb, but the parallel wrapper returns them.
    expect(entry).toContain('const Node_pa = await')
    expect(entry).toContain('const Node_pb = await')
  })
})
