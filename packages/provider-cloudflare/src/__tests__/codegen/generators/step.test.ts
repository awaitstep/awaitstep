import { describe, it, expect } from 'vitest'
import { testCtx as ctx } from '../test-context.js'
import type { WorkflowNode } from '@awaitstep/ir'
import { generateStep as generateStepImpl } from '../../../codegen/generators/step.js'

const generateStep = (node: Parameters<typeof generateStepImpl>[0]) => generateStepImpl(node, ctx)

function makeNode(overrides: Partial<WorkflowNode> = {}): WorkflowNode {
  return {
    id: 'step-1',
    type: 'step',
    name: 'Do work',
    position: { x: 0, y: 0 },
    version: '1.0.0',
    provider: 'cloudflare',
    data: { code: 'return { done: true };' },
    ...overrides,
  }
}

describe('generateStep', () => {
  it('calls the step’s module and keeps its value', () => {
    const code = generateStep(makeNode())
    expect(code).toBe(
      'const step_1 = await flow.step("step-1", (ctx) => $step_1({ env, event, inputs: {}, step, ctx }));',
    )
  })

  it('adds the step’s code to the bundle as its module, verbatim once in module form', () => {
    const moduleCtx = { ...ctx, files: [] as typeof ctx.files }
    moduleCtx.addFile = (file) => moduleCtx.files.push(file)
    generateStepImpl(makeNode({ data: { code: 'const x = 1;\nreturn x + 1;' } }), moduleCtx)
    expect(moduleCtx.files).toEqual([
      {
        path: 'steps/step-1.ts',
        role: 'module',
        binding: '$step_1',
        source:
          'export default async function step_1({ env, event, inputs, step, ctx }) {\n  const x = 1;\n  return x + 1;\n}\n',
      },
    ])
  })

  it('omits variable assignment when no return', () => {
    const code = generateStep(makeNode({ data: { code: 'console.log("hello");' } }))
    expect(code).not.toContain('const step_1 =')
    expect(code).toMatch(/^await flow\.step/)
  })

  it('includes retries config', () => {
    const code = generateStep(
      makeNode({
        config: { retries: { limit: 5, delay: '10 seconds' } },
      }),
    )
    expect(code).toContain('retries: { limit: 5, delay: "10 seconds" }')
  })

  it('includes timeout config', () => {
    const code = generateStep(
      makeNode({
        config: { timeout: '1 minute' },
      }),
    )
    expect(code).toContain('timeout: "1 minute"')
  })

  it('includes retries with backoff', () => {
    const code = generateStep(
      makeNode({
        config: { retries: { limit: 3, delay: '5 seconds', backoff: 'exponential' } },
      }),
    )
    expect(code).toContain('backoff: "exponential"')
  })

  it('includes numeric delay', () => {
    const code = generateStep(
      makeNode({
        config: { retries: { limit: 2, delay: 5000 } },
      }),
    )
    expect(code).toContain('delay: 5000')
  })

  it('includes numeric timeout', () => {
    const code = generateStep(
      makeNode({
        config: { timeout: 30000 },
      }),
    )
    expect(code).toContain('timeout: 30000')
  })

  it('omits config when not provided', () => {
    const code = generateStep(makeNode())
    expect(code).toMatch(/flow\.step\("step-1", \(ctx\) =>/)
  })

  it('treats a cleared retry delay as no retry policy, like a cleared timeout', () => {
    const code = generateStep(
      makeNode({ data: { code: 'return 1;', retryDelay: '', timeout: '' } }),
    )
    expect(code).toMatch(/flow\.step\("step-1", \(ctx\) =>/)
    expect(code).not.toContain('retries')
  })

  it('a whitespace delay or timeout is unset too, so no blank string reaches the step', () => {
    const code = generateStep(
      makeNode({ data: { code: 'return 1;', retryLimit: 1, retryDelay: '  ', timeout: ' ' } }),
    )
    expect(code).toContain('retries: { limit: 1, delay: "10 seconds" }')
    expect(code).not.toContain('timeout')
  })

  it('a retry limit beside a cleared delay still gets the default delay', () => {
    const code = generateStep(
      makeNode({ data: { code: 'return 1;', retryLimit: 2, retryDelay: '' } }),
    )
    expect(code).toContain('retries: { limit: 2, delay: "10 seconds" }')
  })

  it('sanitizes node id for variable name', () => {
    const code = generateStep(makeNode({ id: 'process-data' }))
    expect(code).toContain('const process_data =')
  })

  it('labels are id-derived, so quotes in the node name never reach the source', () => {
    const code = generateStep(makeNode({ name: 'Run "fast" task' }))
    expect(code).toContain('flow.step("step-1"')
    expect(code).not.toContain('fast')
  })

  describe('module inputs', () => {
    it('does not destructure an upstream name the body declares itself', () => {
      // A body that declares `const data` would otherwise redeclare the
      // input (review round 1: a SyntaxError sucrase does not catch).
      const moduleCtx = {
        ...ctx,
        emitModules: true,
        files: [],
        upstreamVars: () => ['data', 'other'],
      }
      moduleCtx.addFile = (file) => moduleCtx.files.push(file)
      generateStepImpl(
        makeNode({ data: { code: 'const data = 2; return data + other;' } }),
        moduleCtx,
      )
      const module = moduleCtx.files[0]!.source
      expect(module).toContain('const { other } = inputs;')
      expect(module).not.toContain('const { data, other } = inputs;')
    })
  })

  describe('in a function', () => {
    it('is a step like any other: there is no script mode, only the inline opt-out', () => {
      // A function's steps run through the in-request host, so the emitter
      // has one shape for both kinds; raw emission is the `inline` flag's.
      const code = generateStep(makeNode())
      expect(code).toContain('flow.step("step-1", (ctx) => $step_1(')
      expect(generateStep(makeNode({ data: { code: 'return 1;', inline: true } }))).toBe(
        'return 1;',
      )
    })
  })

  describe('inline (workflow mode)', () => {
    it('emits raw user code with no wrapping when `data.inline` is true', () => {
      const code = generateStep(makeNode({ data: { code: 'return 42;', inline: true } }))
      expect(code).toBe('return 42;')
    })

    it('emits side-effect-only inline code unchanged', () => {
      const code = generateStep(
        makeNode({
          data: { code: '_output = [..._output, listing];', inline: true },
        }),
      )
      expect(code).toBe('_output = [..._output, listing];')
    })

    it('does not add a const prefix or step.do wrap for inline', () => {
      const code = generateStep(makeNode({ data: { code: 'return x;', inline: true } }))
      expect(code).not.toContain('const step_1')
      expect(code).not.toContain('flow.step')
      expect(code).not.toContain('async () =>')
    })

    it('ignores `data.inline` in script mode (script is already inline)', () => {
      const code = generateStep(makeNode({ data: { code: 'return 1;', inline: true } }), 'script')
      expect(code).toBe('return 1;')
    })
  })
})

describe('two steps on one file', () => {
  it('is refused with both bindings named, never a silently missing module', () => {
    const moduleCtx = { ...ctx, files: [] as typeof ctx.files }
    moduleCtx.addFile = (file) => moduleCtx.files.push(file)
    generateStepImpl(makeNode({ id: 'a.b', name: 'First' }), moduleCtx)
    expect(moduleCtx.files.map((f) => f.path)).toEqual(['steps/a_b-108bf5.ts'])
    expect(() =>
      generateStepImpl(makeNode({ id: 'a_b-108bf5', name: 'Second' }), moduleCtx),
    ).toThrow('Two steps map to the same file steps/a_b-108bf5.ts ($a_b and $a_b_108bf5)')
  })
})
