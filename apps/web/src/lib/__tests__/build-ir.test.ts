import { describe, it, expect } from 'vitest'
import { buildIRFromState } from '../build-ir'

const node = {
  id: 'n1',
  type: 'step',
  position: { x: 10, y: 20 },
  data: {
    irNode: {
      id: 'n1',
      type: 'step',
      name: 'Step 1',
      position: { x: 0, y: 0 },
      version: '1.0.0',
      provider: 'cloudflare',
      data: { code: 'return 1;' },
    },
  },
}

const baseState = {
  kind: 'workflow' as const,
  metadata: { name: 'T', version: 1, createdAt: '', updatedAt: '' },
  nodes: [node],
  edges: [],
  triggerCode: '',
  dependencies: {},
  workflowEnvVars: [],
  runtimeBindings: [],
}

describe('buildIRFromState — runtime block', () => {
  it('drops blank env names so exports always reimport cleanly', () => {
    const ir = buildIRFromState({
      ...baseState,
      workflowEnvVars: [
        { name: 'SECRET_', value: 'x' },
        { name: '  ', value: 'y' },
        { name: 'KEEP', value: 'z' },
      ],
    } as never) as { runtime?: { env?: unknown[] } }
    expect(ir.runtime?.env).toEqual([{ name: 'KEEP' }])
  })

  it('omits runtime entirely when the workflow has none', () => {
    const ir = buildIRFromState(baseState as never)
    expect('runtime' in ir).toBe(false)
    expect(ir.irVersion).toBe(2)
  })

  it('emits a self-contained runtime block with env declarations, never values', () => {
    const ir = buildIRFromState({
      ...baseState,
      triggerCode: '@fetch function handler() {}',
      dependencies: { zod: '^4.0.0' },
      workflowEnvVars: [
        { name: 'SECRET_API_KEY', value: 'shh' },
        { name: 'REGION', value: 'eu' },
      ],
      runtimeBindings: [{ name: 'KV_CACHE', type: 'kv', resourceId: 'abc' }],
    } as never) as { runtime?: Record<string, unknown> }
    expect(ir.runtime).toEqual({
      triggerCode: '@fetch function handler() {}',
      dependencies: { zod: '^4.0.0' },
      env: [{ name: 'API_KEY', secret: true }, { name: 'REGION' }],
      bindings: [{ name: 'KV_CACHE', type: 'kv', resourceId: 'abc' }],
    })
    expect(JSON.stringify(ir)).not.toContain('shh')
  })
})
