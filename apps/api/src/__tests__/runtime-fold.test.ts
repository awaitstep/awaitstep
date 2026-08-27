import { describe, it, expect } from 'vitest'
import type { ArtifactIR } from '@awaitstep/ir'
import type { Workflow } from '@awaitstep/db'
import { foldWorkflowRuntime } from '../lib/runtime-fold.js'

const baseIr: ArtifactIR = {
  metadata: { name: 'T', version: 1, createdAt: '', updatedAt: '' },
  entryNodeId: 'n1',
  nodes: [
    {
      id: 'n1',
      type: 'step',
      name: 'n1',
      position: { x: 0, y: 0 },
      version: '1.0.0',
      provider: 'cloudflare',
      data: { code: 'return 1;' },
    },
  ],
  edges: [],
}

function workflow(overrides: Partial<Workflow>): Workflow {
  return { triggerCode: null, dependencies: null, envVars: null, ...overrides } as Workflow
}

describe('foldWorkflowRuntime', () => {
  it('folds legacy columns into runtime for pre-runtime IRs', () => {
    const folded = foldWorkflowRuntime(
      baseIr,
      workflow({
        triggerCode: '@fetch function handler() {}',
        dependencies: JSON.stringify({ zod: '^4.0.0' }),
        envVars: JSON.stringify([
          { name: 'API_KEY', value: 'x', isSecret: true },
          { name: 'REGION', value: 'eu' },
        ]),
      }),
    )
    expect(folded.runtime).toEqual({
      triggerCode: '@fetch function handler() {}',
      dependencies: { zod: '^4.0.0' },
      env: [{ name: 'API_KEY', secret: true }, { name: 'REGION' }],
    })
  })

  it('returns the IR unchanged when there is nothing to fold', () => {
    expect(foldWorkflowRuntime(baseIr, workflow({}))).toBe(baseIr)
  })

  it('column values win over stale runtime copies during dual-write', () => {
    const ir: ArtifactIR = {
      ...baseIr,
      runtime: { triggerCode: 'stale', dependencies: { old: '1.0.0' } },
    }
    const folded = foldWorkflowRuntime(
      ir,
      workflow({ triggerCode: 'fresh', dependencies: JSON.stringify({ next: '2.0.0' }) }),
    )
    expect(folded.runtime?.triggerCode).toBe('fresh')
    expect(folded.runtime?.dependencies).toEqual({ next: '2.0.0' })
  })

  it('preserves runtime values when columns are empty (pure-IR import)', () => {
    const ir: ArtifactIR = {
      ...baseIr,
      runtime: {
        triggerCode: 'from-import',
        bindings: [{ name: 'KV_CACHE', type: 'kv', resourceId: 'abc' }],
      },
    }
    const folded = foldWorkflowRuntime(ir, workflow({}))
    expect(folded.runtime?.triggerCode).toBe('from-import')
    expect(folded.runtime?.bindings).toEqual([{ name: 'KV_CACHE', type: 'kv', resourceId: 'abc' }])
  })

  it('bindings always survive the fold — no column counterpart exists', () => {
    const ir: ArtifactIR = {
      ...baseIr,
      runtime: { bindings: [{ name: 'DB_MAIN', type: 'd1' }] },
    }
    const folded = foldWorkflowRuntime(ir, workflow({ triggerCode: 'code' }))
    expect(folded.runtime?.bindings).toEqual([{ name: 'DB_MAIN', type: 'd1' }])
    expect(folded.runtime?.triggerCode).toBe('code')
  })

  it('ignores malformed column JSON', () => {
    const folded = foldWorkflowRuntime(
      baseIr,
      workflow({ dependencies: '{broken', envVars: 'not json' }),
    )
    expect(folded.runtime).toBeUndefined()
  })
})
