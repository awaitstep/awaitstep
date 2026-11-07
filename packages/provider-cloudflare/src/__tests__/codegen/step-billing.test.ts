import { describe, it, expect } from 'vitest'
import type { WorkflowIR, WorkflowNode } from '@awaitstep/ir'
import { bundleCodeFiles } from '@awaitstep/codegen'
import { generateWorkflowBundle } from '../../codegen/generate.js'

/**
 * F9 no-bookkeeping gate: Cloudflare bills every flow.step / flow.sleep / flow.waitForEvent, so every durable-step label in generated output must
 * belong to a user-visible canvas node. A label that strips back to nothing
 * in the IR is an infrastructure step the user pays for without seeing —
 * treated as a generator bug.
 */

function node(
  id: string,
  type: string,
  data: Record<string, unknown>,
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

const ir: WorkflowIR = {
  metadata: { name: 'BillingAudit', version: 1, createdAt: '', updatedAt: '' },
  entryNodeId: 'fetch',
  nodes: [
    node('fetch', 'http_request', { url: 'https://api.example.com/data', method: 'GET' }),
    node('work', 'step', { code: 'return fetch_1.length;' }),
    node('nap', 'sleep', { duration: '10 seconds' }),
    node('gate', 'wait_for_event', { eventType: 'approval' }),
    node('fan', 'parallel', {}),
    node('pa', 'step', { code: 'return 1;' }),
    node('pb', 'step', { code: 'return 2;' }),
    node('iterate', 'loop', { loopType: 'times', count: 3 }),
    node('inner', 'step', { code: 'return _loop_i;' }),
    node('guard', 'try_catch', {}),
    node('risky', 'step', { code: 'return risky();' }),
    node('rescue', 'step', { code: 'return null;' }),
    node('child', 'sub_workflow', {
      workflowId: 'wf-child',
      workflowName: 'ChildFlow',
      waitForCompletion: true,
    }),
    node('rc', 'race', {}),
    node('fast', 'step', { code: 'return "fast";' }),
    node('slow', 'step', { code: 'return "slow";' }),
  ],
  edges: [
    { id: 'e1', source: 'fetch', target: 'work' },
    { id: 'e2', source: 'work', target: 'nap' },
    { id: 'e3', source: 'nap', target: 'gate' },
    { id: 'e4', source: 'gate', target: 'fan' },
    { id: 'e5', source: 'fan', target: 'pa' },
    { id: 'e6', source: 'fan', target: 'pb' },
    { id: 'e7', source: 'fan', target: 'iterate', label: 'then' },
    { id: 'e8', source: 'iterate', target: 'inner', label: 'body' },
    { id: 'e9', source: 'iterate', target: 'guard', label: 'then' },
    { id: 'e10', source: 'guard', target: 'risky', label: 'try' },
    { id: 'e11', source: 'guard', target: 'rescue', label: 'catch' },
    { id: 'e12', source: 'guard', target: 'child', label: 'then' },
    { id: 'e13', source: 'child', target: 'rc' },
    { id: 'e14', source: 'rc', target: 'fast' },
    { id: 'e15', source: 'rc', target: 'slow' },
  ],
}

const LABEL_RE = /flow\.(?:step|sleep|sleepUntil|waitForEvent)\((["'`])(.*?)\1/g

function emittedLabels(code: string): string[] {
  return [...code.matchAll(LABEL_RE)].map((m) => m[2]!)
}

/** Reverses the generated label transforms: loop suffix, derived suffix. */
function baseNodeId(label: string): string {
  const unsuffixed = label.replace(/ \[\$\{\w+\}\]$/, '').replace(/ \[\d+\]$/, '')
  const sep = unsuffixed.indexOf('--')
  return sep > 0 ? unsuffixed.slice(0, sep) : unsuffixed
}

describe('step billing audit', () => {
  const bundle = generateWorkflowBundle(ir)
  const allCode = bundleCodeFiles(bundle)
    .map((f) => f.source)
    .join('\n')
  const labels = emittedLabels(allCode)
  const nodeIds = new Set(ir.nodes.map((n) => n.id))

  it('emits at least one durable step per billable node kind in the fixture', () => {
    expect(labels.length).toBeGreaterThanOrEqual(10)
  })

  it('every emitted durable-step label maps to a user-visible node', () => {
    const orphans = labels.filter((label) => !nodeIds.has(baseNodeId(label)))
    expect(orphans).toEqual([])
  })

  it('emits no step primitives for pure control-flow nodes (branch, try/catch)', () => {
    // guard is a try_catch: its children bill, the construct itself does not.
    expect(labels).not.toContain('guard')
  })

  it('the manifest claims every top-level labeled step', () => {
    for (const step of bundle.manifest!.steps) {
      if (step.stepName === undefined) continue
      // A loop body's label carries the iteration suffix in the text.
      expect(labels.map(baseNodeId)).toContain(step.stepName)
    }
  })
})
