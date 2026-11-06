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
  it('generates a basic step with return', () => {
    const code = generateStep(makeNode())
    expect(code).toContain('flow.step("step-1"')
    expect(code).toContain('return { done: true };')
    expect(code).toContain('const step_1 =')
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
    expect(code).toMatch(/flow\.step\("step-1", async/)
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

  it('preserves multiline code', () => {
    const code = generateStep(
      makeNode({
        data: { code: 'const x = 1;\nreturn x + 1;' },
      }),
    )
    // The nested scope indents the body but preserves it.
    expect(code).toMatch(/return await \(async \(\) => \{\n\s+const x = 1;\n\s+return x \+ 1;/)
  })

  it('gives the body its own scope so a declaration named ctx does not collide', () => {
    const code = generateStep(makeNode({ data: { code: 'const ctx = 1;\nreturn ctx;' } }))
    // The attempt is the outer callback's parameter; the body is a nested
    // arrow, so `const ctx` shadows it instead of redeclaring it.
    expect(code).toContain('async (ctx) => {')
    expect(code).toContain('return await (async () => {')
    expect(code).toContain('const ctx = 1;')
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
      expect(code).toContain('flow.step("step-1"')
      expect(code).toContain('return await (async () => {')
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
