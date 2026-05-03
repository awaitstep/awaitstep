import { describe, it, expect } from 'vitest'
import type { WorkflowNode } from '@awaitstep/ir'
import { generateStep } from '../../../codegen/generators/step.js'

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
    expect(code).toContain('step.do("Do work"')
    expect(code).toContain('return { done: true };')
    expect(code).toContain('const step_1 =')
  })

  it('omits variable assignment when no return', () => {
    const code = generateStep(makeNode({ data: { code: 'console.log("hello");' } }))
    expect(code).not.toContain('const step_1 =')
    expect(code).toMatch(/^await step\.do/)
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
    expect(code).toMatch(/step\.do\("Do work", async/)
  })

  it('sanitizes node id for variable name', () => {
    const code = generateStep(makeNode({ id: 'process-data' }))
    expect(code).toContain('const process_data =')
  })

  it('escapes quotes in step name', () => {
    const code = generateStep(makeNode({ name: 'Run "fast" task' }))
    expect(code).toContain('step.do("Run \\"fast\\" task"')
  })

  it('preserves multiline code', () => {
    const code = generateStep(
      makeNode({
        data: { code: 'const x = 1;\nreturn x + 1;' },
      }),
    )
    expect(code).toContain('const x = 1;\nreturn x + 1;')
  })

  describe('script mode', () => {
    it('emits the user code raw (no IIFE, no step.do, no const wrap)', () => {
      const code = generateStep(makeNode(), 'script')
      expect(code).not.toContain('step.do')
      expect(code).not.toContain('await (async () => {')
      expect(code).not.toContain('const step_1')
      // The user's code is the entire output.
      expect(code).toBe('return { done: true };')
    })

    it('inlines side-effect-only code unchanged', () => {
      const code = generateStep(makeNode({ data: { code: 'console.log("hello");' } }), 'script')
      expect(code).toBe('console.log("hello");')
    })

    it('drops the workflow step name (no step runner in a fetch handler)', () => {
      const code = generateStep(makeNode({ name: 'Run "fast" task' }), 'script')
      expect(code).not.toContain('Run')
    })
  })

  describe('inline (workflow mode)', () => {
    it('emits an async IIFE with const-bound output when `data.inline` is true', () => {
      const code = generateStep(makeNode({ data: { code: 'return 42;', inline: true } }))
      expect(code).not.toContain('step.do')
      expect(code).toContain('const step_1 = await (async () => {')
      expect(code).toContain('return 42;')
      expect(code).toMatch(/}\)\(\);$/)
    })

    it('omits the const prefix when the inline code has no return', () => {
      const code = generateStep(makeNode({ data: { code: 'console.log("x");', inline: true } }))
      expect(code).not.toContain('const step_1')
      expect(code).toMatch(/^await \(async \(\) => \{/)
    })

    it('ignores `data.inline` in script mode (script is already inline)', () => {
      const code = generateStep(makeNode({ data: { code: 'return 1;', inline: true } }), 'script')
      expect(code).toBe('return 1;')
    })
  })
})
