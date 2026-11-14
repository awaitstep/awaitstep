import { describe, expect, it } from 'vitest'
import type { ScriptIR, WorkflowIR } from '@awaitstep/ir'
import {
  GenerateInputError,
  generateUniversalFunctionBundle,
  generateUniversalWorkflowBundle,
  type GeneratedBundle,
} from '@awaitstep/codegen'
import { generateScriptBundle } from '../../codegen/generate-script.js'
import { generateWorkflowBundle } from '../../codegen/generate-workflow.js'
import { bundleTypeErrors } from './fixtures/type-check-bundle.js'

function node(
  id: string,
  type: string,
  name: string,
  data: Record<string, unknown>,
): WorkflowIR['nodes'][number] {
  return {
    id,
    type,
    name,
    position: { x: 0, y: 0 },
    version: '1.0.0',
    provider: 'cloudflare',
    data,
  }
}

/** An inline step with the given code, then a step module the graph calls. */
function inlineThenModule(code: string): WorkflowIR {
  return {
    metadata: { name: 'clash', version: 1, createdAt: '', updatedAt: '' },
    nodes: [
      node('prep', 'step', 'Prepare', { code, inline: true }),
      node('work', 'step', 'work', { code: 'return 1' }),
    ],
    edges: [{ id: 'e1', source: 'prep', target: 'work' }],
    entryNodeId: 'prep',
  }
}

const asScript = (ir: WorkflowIR): ScriptIR => ({ ...ir, kind: 'script' })

const EMITTERS: [string, (ir: WorkflowIR) => GeneratedBundle, string][] = [
  ['a portable workflow', (ir) => generateUniversalWorkflowBundle(ir), 'awaitstep/workflow.ts'],
  [
    'a portable function',
    (ir) => generateUniversalFunctionBundle(asScript(ir)),
    'awaitstep/function.ts',
  ],
  ['a Cloudflare workflow', (ir) => generateWorkflowBundle(ir), 'awaitstep/workflow.ts'],
  ['a Cloudflare function', (ir) => generateScriptBundle(asScript(ir)), 'awaitstep/function.ts'],
]

describe('an inline step importing a name the generated file imports', () => {
  it.each(EMITTERS)('in %s, shares the runtime import line', (_kind, generate, path) => {
    const bundle = generate(
      inlineThenModule(
        'import { durableStep } from "#awaitstep/runtime"\nconst again = durableStep(flow)',
      ),
    )
    const source = bundle.files.find((file) => file.path === path)!.source
    expect(source.match(/from "#awaitstep\/runtime"/g)).toHaveLength(1)
    expect(bundleTypeErrors(bundle, path)).toEqual([])
  })

  it.each(EMITTERS)('in %s, refuses it from another module', (_kind, generate) => {
    const run = () => generate(inlineThenModule('import { stepArgs } from "some-pkg"'))
    expect(run).toThrow(GenerateInputError)
    expect(run).toThrow(
      '"Prepare" imports `stepArgs` from "some-pkg", but the generated code already imports it from "#awaitstep/runtime". Rename it with `as`.',
    )
  })
})
