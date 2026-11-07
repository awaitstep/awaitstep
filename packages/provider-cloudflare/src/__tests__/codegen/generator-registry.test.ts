import { describe, it, expect } from 'vitest'
import { BUILTIN_NODE_TYPE_LIST } from '@awaitstep/ir'
import {
  builtinGenerators,
  createBuiltinGeneratorRegistry,
} from '../../codegen/generator-registry.js'
import { generateWorkflowBundle } from '../../codegen/generate.js'

/** Every file of the bundle as one text. */
function programOf(
  ir: Parameters<typeof generateWorkflowBundle>[0],
  options?: Parameters<typeof generateWorkflowBundle>[1],
): string {
  return generateWorkflowBundle(ir, options)
    .files.map((f) => f.source)
    .join('\n')
}
import type { WorkflowIR } from '@awaitstep/ir'

describe('builtinGenerators', () => {
  it('has a generator for every builtin node type', () => {
    // Containment, not equality: provider-specific extensions beyond the IR
    // builtin list are the reason the registry exists.
    for (const type of BUILTIN_NODE_TYPE_LIST) {
      expect(builtinGenerators.get(type), type).toBeDefined()
    }
  })

  it('createBuiltinGeneratorRegistry returns an independently extensible registry', () => {
    const registry = createBuiltinGeneratorRegistry()
    registry.register({ type: 'cf_only_primitive', generate: () => '// custom' })
    expect(registry.get('cf_only_primitive')).toBeDefined()
    expect(builtinGenerators.get('cf_only_primitive')).toBeUndefined()
  })
})

describe('options.generators threading', () => {
  it('generateWorkflow dispatches node types through a supplied registry', () => {
    const generators = createBuiltinGeneratorRegistry().register({
      type: 'cf_kv_sweep',
      generate: ({ node, ctx }) => `const ${ctx.varName(node.id)} = await sweepKv(env);`,
    })
    const ir: WorkflowIR = {
      metadata: { name: 'Ext', version: 1, createdAt: '', updatedAt: '' },
      entryNodeId: 'n1',
      nodes: [
        {
          id: 'n1',
          type: 'cf_kv_sweep',
          name: 'sweep',
          position: { x: 0, y: 0 },
          version: '1.0.0',
          provider: 'cloudflare',
          data: {},
        },
      ],
      edges: [],
    }
    const code = programOf(ir, { generators })
    expect(code).toContain('const sweep = await sweepKv(env);')
    // Without the extended registry the same IR has no generator or template.
    expect(() => programOf(ir)).toThrow('Codegen not yet implemented')
  })
})
