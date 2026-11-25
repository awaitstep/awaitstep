import { describe, expect, it, vi } from 'vitest'
import type { ScriptIR, WorkflowIR } from '@awaitstep/ir'
import {
  generateUniversalFunctionBundle,
  generateUniversalWorkflowBundle,
  type GeneratedBundle,
} from '@awaitstep/codegen'
import { generateScriptBundle } from '../../codegen/generate-script.js'
import { generateWorkflowBundle } from '../../codegen/generate-workflow.js'
import { bundleTypeErrors } from './fixtures/type-check-bundle.js'

// Each test compiles a bundle with the TypeScript compiler: past vitest's 5s default on a busy runner.
vi.setConfig({ testTimeout: 30_000 })

const WORKFLOW = 'awaitstep/workflow.ts'
const FUNCTION = 'awaitstep/function.ts'

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

/** Two steps; the second's module types its parameter as given. */
function twoSteps(code: string): WorkflowIR {
  return {
    metadata: { name: 'typed', version: 1, createdAt: '', updatedAt: '' },
    nodes: [
      node('first', 'step', 'first', { code: 'return { id: 1 }' }),
      node('narrow', 'step', 'narrow', { code }),
    ],
    edges: [{ id: 'e1', source: 'first', target: 'narrow' }],
    entryNodeId: 'first',
  }
}

/** A loop whose body step types only the item it reads. */
const loop: WorkflowIR = {
  metadata: { name: 'typed loop', version: 1, createdAt: '', updatedAt: '' },
  nodes: [
    node('each', 'loop', 'each', { loopType: 'forEach', collection: '[1, 2]', itemVar: 'item' }),
    node('work', 'step', 'work', {
      code: 'export default async function work({ inputs }: { inputs: { item: number } }) {\n  return inputs.item\n}\n',
    }),
  ],
  edges: [{ id: 'e1', source: 'each', target: 'work', label: 'body' }],
  entryNodeId: 'each',
}

const NARROW = `export default async function narrow({ inputs }: { inputs: { first: { id: number } } }) {
  return inputs.first.id
}
`
const UNSATISFIABLE = `export default async function narrow({ inputs }: { inputs: { missing: string } }) {
  return inputs.missing
}
`

const asScript = (ir: WorkflowIR): ScriptIR => ({ ...ir, kind: 'script' })

// Every emitter whose graph module calls step modules: the portable ones the
// editor shows, and the Cloudflare ones that deploy.
const EMITTERS: [string, (ir: WorkflowIR) => GeneratedBundle, string][] = [
  ['a portable workflow', (ir) => generateUniversalWorkflowBundle(ir), WORKFLOW],
  ['a portable function', (ir) => generateUniversalFunctionBundle(asScript(ir)), FUNCTION],
  ['a Cloudflare workflow', (ir) => generateWorkflowBundle(ir), WORKFLOW],
  ['a Cloudflare function', (ir) => generateScriptBundle(asScript(ir)), FUNCTION],
]

describe('a step module that types only what it reads', () => {
  it.each(EMITTERS)('type-checks in %s', (_kind, generate, path) => {
    expect(bundleTypeErrors(generate(twoSteps(NARROW)), path)).toEqual([])
    expect(bundleTypeErrors(generate(twoSteps(NARROW)), path, { strict: true })).toEqual([])
    expect(bundleTypeErrors(generate(loop), path)).toEqual([])
  })

  it.each(EMITTERS)(
    'in %s, still reports a parameter the call cannot satisfy',
    (_kind, generate, path) => {
      expect(bundleTypeErrors(generate(twoSteps(UNSATISFIABLE)), path).join('\n')).toMatch(
        /missing/,
      )
    },
  )

  it.each(EMITTERS)(
    'in %s, imports stepArgs only where a step module is called',
    (_kind, generate, path) => {
      const inline: WorkflowIR = {
        ...twoSteps(''),
        nodes: [node('only', 'step', 'only', { code: 'const x = 1', inline: true })],
        edges: [],
        entryNodeId: 'only',
      }
      const source = (ir: WorkflowIR) =>
        generate(ir).files.find((file) => file.path === path)?.source ?? ''
      expect(source(twoSteps(NARROW))).toMatch(
        /import \{[^}]*\bstepArgs\b[^}]*\} from "#awaitstep\/runtime"/,
      )
      expect(source(inline)).not.toContain('stepArgs')
    },
  )
})
