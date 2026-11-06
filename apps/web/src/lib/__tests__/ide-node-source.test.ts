import { describe, expect, it } from 'vitest'
import {
  BUILTIN_NODE_TYPE_LIST,
  contentHash,
  stepSourcePath,
  type ArtifactIR,
  type WorkflowNode,
} from '@awaitstep/ir'
import {
  applyStepSources,
  stepSourcePaths,
  stepSources,
  withoutFileSnapshot,
} from '../ide/node-source'

function node(id: string, type: string, data: Record<string, unknown> = {}): WorkflowNode {
  return { id, type, name: id, version: '1.0.0', provider: 'cloudflare', data }
}

const metadata = {
  name: 'orders',
  version: 1,
  createdAt: '2026-11-01T00:00:00Z',
  updatedAt: '2026-11-01T00:00:00Z',
}

/** validate → loop(each item) → charge (child) → done; a sleep for contrast. */
const workflow: ArtifactIR = {
  kind: 'workflow',
  metadata,
  nodes: [
    node('validate', 'step', { code: 'return input' }),
    node('each', 'loop', { loopType: 'forEach', items: '{{validate}}' }),
    node('charge', 'step', { code: 'return await charge(item)', inline: true }),
    node('nap', 'sleep', { duration: '1 minute' }),
    node('done', 'step'),
  ],
  edges: [
    { id: 'e1', source: 'validate', target: 'each' },
    { id: 'e2', source: 'each', target: 'charge', label: 'each' },
    { id: 'e3', source: 'charge', target: 'nap' },
    { id: 'e4', source: 'nap', target: 'done' },
  ],
  entryNodeId: 'validate',
  trigger: { type: 'http' },
  runtime: {
    env: [{ name: 'STRIPE_KEY', secret: true }],
    files: [{ path: 'lib/x.ts', source: 'export const x = 1' }],
  },
}

describe('stepSources', () => {
  it('shows every step node as steps/<id>.ts with exactly its code', () => {
    const sources = stepSources(workflow)
    expect(sources.files.map((f) => f.path)).toEqual([
      'steps/validate.ts',
      'steps/charge.ts',
      'steps/done.ts',
    ])
    expect(sources.byNode.get('validate')).toEqual({
      path: 'steps/validate.ts',
      source: 'return input',
      role: 'source',
      hash: contentHash('return input'),
    })
    expect(sources.byPath.get('steps/charge.ts')).toBe('charge')
  })

  it('includes a container child and an inline step, and gives a step with no code an empty file', () => {
    const sources = stepSources(workflow)
    expect(sources.byNode.get('charge')?.source).toBe('return await charge(item)')
    expect(sources.byNode.get('done')).toMatchObject({ source: '', hash: contentHash('') })
  })

  it('gives only the step builtin a file', () => {
    const everyBuiltin: ArtifactIR = {
      ...workflow,
      nodes: BUILTIN_NODE_TYPE_LIST.map((type) => node(`n_${type}`, type, { code: 'x' })),
    }
    expect(stepSources(everyBuiltin).files.map((f) => f.path)).toEqual(['steps/n_step.ts'])
    // A custom node keeps its read-only module; it gets no source.
    expect(
      stepSources({ ...workflow, nodes: [node('c', 'registry:acme/mail', { code: 'x' })] }).files,
    ).toEqual([])
  })

  it('projects a function the same way', () => {
    const script: ArtifactIR = {
      kind: 'script',
      metadata,
      nodes: [node('a', 'step', { code: 'return 1' })],
      edges: [],
      entryNodeId: 'a',
      trigger: { type: 'http' },
    }
    expect(stepSources(script).files).toEqual([
      { path: 'steps/a.ts', source: 'return 1', role: 'source', hash: contentHash('return 1') },
    ])
  })

  it('ignores a code field that is not text', () => {
    const odd: ArtifactIR = { ...workflow, nodes: [node('a', 'step', { code: 42 })] }
    expect(stepSources(odd).byNode.get('a')?.source).toBe('')
  })

  it('projects nothing for a path two nodes map to, and reports it', () => {
    // An imported id spelled exactly like another id's rewritten path.
    const rewritten = stepSourcePath('a b').slice('steps/'.length, -'.ts'.length)
    const crafted: ArtifactIR = {
      ...workflow,
      nodes: [
        node('a b', 'step', { code: '1' }),
        node('ok', 'step', { code: '3' }),
        node(rewritten, 'step', { code: '2' }),
      ],
    }
    const sources = stepSources(crafted)
    expect(sources.collisions).toEqual([
      { path: `steps/${rewritten}.ts`, nodeIds: ['a b', rewritten], stored: false },
    ])
    expect(sources.files.map((f) => f.path)).toEqual(['steps/ok.ts'])
    expect(sources.byNode.has('a b')).toBe(false)
    expect(sources.byNode.has(rewritten)).toBe(false)
    expect(sources.byPath.has(`steps/${rewritten}.ts`)).toBe(false)
    expect(stepSources(workflow).collisions).toEqual([])
  })

  it('lets a project file stored at a step’s path keep it, and reports the step', () => {
    const sources = stepSources(workflow, new Set(['steps/charge.ts', 'lib/x.ts']))
    expect(sources.collisions).toEqual([
      { path: 'steps/charge.ts', nodeIds: ['charge'], stored: true },
    ])
    expect(sources.files.map((f) => f.path)).toEqual(['steps/validate.ts', 'steps/done.ts'])
    expect(sources.byPath.has('steps/charge.ts')).toBe(false)
  })
})

describe('stepSourcePaths', () => {
  it('maps step nodes only, in the order given', () => {
    expect([...stepSourcePaths(workflow.nodes)]).toEqual([
      ['validate', 'steps/validate.ts'],
      ['charge', 'steps/charge.ts'],
      ['done', 'steps/done.ts'],
    ])
  })
})

describe('applyStepSources', () => {
  it('writes the edited bodies back and leaves everything else as it was', () => {
    const before = JSON.stringify(workflow)
    const edits = new Map([
      ['validate', 'return input.trim()'],
      ['done', 'return "ok"'],
    ])
    const after = applyStepSources(workflow, edits)

    expect(after.nodes.find((n) => n.id === 'validate')?.data).toEqual({
      code: 'return input.trim()',
    })
    expect(after.nodes.find((n) => n.id === 'done')?.data).toEqual({ code: 'return "ok"' })
    // The input document is untouched.
    expect(JSON.stringify(workflow)).toBe(before)
    // Everything that is not an edited body compares equal, by reference where possible.
    const { nodes: _n, ...rest } = after
    const { nodes: _m, ...restBefore } = workflow
    expect(rest).toEqual(restBefore)
    expect(after.nodes[1]).toBe(workflow.nodes[1])
    expect(after.nodes[2]).toBe(workflow.nodes[2])
    expect(after.nodes[3]).toBe(workflow.nodes[3])
    expect(after.nodes.find((n) => n.id === 'charge')?.data).toEqual({
      code: 'return await charge(item)',
      inline: true,
    })
  })

  it('keeps the other data fields of an edited node', () => {
    const after = applyStepSources(workflow, new Map([['charge', 'return 2']]))
    expect(after.nodes.find((n) => n.id === 'charge')?.data).toEqual({
      code: 'return 2',
      inline: true,
    })
  })

  it('ignores an edit for a node that is not a step, or that the document does not have', () => {
    const edits = new Map([
      ['nap', 'return 1'],
      ['gone', 'return 1'],
    ])
    expect(applyStepSources(workflow, edits)).toBe(workflow)
  })

  it('returns the same document when every edit equals the current body', () => {
    const edits = new Map([
      ['validate', 'return input'],
      ['done', ''],
    ])
    expect(applyStepSources(workflow, edits)).toBe(workflow)
    expect(applyStepSources(workflow, new Map())).toBe(workflow)
  })

  it('round-trips: what the sources show is what applying them yields', () => {
    const sources = stepSources(workflow)
    const edits = new Map(sources.files.map((f) => [sources.byPath.get(f.path)!, f.source]))
    expect(applyStepSources(workflow, edits)).toBe(workflow)
  })
})

describe('withoutFileSnapshot', () => {
  it('drops runtime.files and keeps the rest of the runtime', () => {
    expect(withoutFileSnapshot(workflow)).toEqual({
      ...workflow,
      runtime: { env: [{ name: 'STRIPE_KEY', secret: true }] },
    })
  })

  it('keeps a legacy trigger-code or dependencies block, whose folding is the server’s', () => {
    const legacy: ArtifactIR = {
      ...workflow,
      runtime: { triggerCode: '// @fetch', dependencies: { zod: '^3' }, files: [] },
    }
    expect(withoutFileSnapshot(legacy).runtime).toEqual({
      triggerCode: '// @fetch',
      dependencies: { zod: '^3' },
    })
  })

  it('removes a runtime that held only the snapshot', () => {
    const filesOnly: ArtifactIR = { ...workflow, runtime: { files: [] } }
    expect(withoutFileSnapshot(filesOnly)).not.toHaveProperty('runtime')
    expect(withoutFileSnapshot(filesOnly).kind).toBe('workflow')
  })

  it('returns a document without a snapshot as it is', () => {
    const { runtime: _runtime, ...bare } = workflow
    expect(withoutFileSnapshot(bare as ArtifactIR)).toBe(bare)
    const noFiles: ArtifactIR = { ...workflow, runtime: { env: [] } }
    expect(withoutFileSnapshot(noFiles)).toBe(noFiles)
  })
})
