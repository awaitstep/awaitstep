import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import type { WorkflowNode } from '@awaitstep/ir'
import { setVarNameMap, clearVarNameMap } from '@awaitstep/codegen'
import {
  extractTemplateBody,
  toJsLiteral,
  resolveCtxConfig,
  resolveCtxEnv,
  resolveCtxInputs,
  generateCustomNode,
} from '../../../codegen/generators/custom.js'

describe('extractTemplateBody', () => {
  it('extracts the function body from a template', () => {
    const source = `export default async function(ctx) {
  const x = 1;
  return x;
}`
    expect(extractTemplateBody(source)).toBe('const x = 1;\n  return x;')
  })

  it('handles nested braces', () => {
    const source = `export default async function(ctx) {
  if (true) {
    return { done: true };
  }
}`
    const body = extractTemplateBody(source)
    expect(body).toContain('if (true) {')
    expect(body).toContain('return { done: true };')
  })

  it('throws if no export default async function found', () => {
    expect(() => extractTemplateBody('function foo() {}')).toThrow(
      'Template must contain an `export default async function`',
    )
  })
})

describe('toJsLiteral', () => {
  it('converts strings to JSON-escaped strings', () => {
    expect(toJsLiteral('hello')).toBe('"hello"')
  })

  it('uses template literals for strings with expressions', () => {
    expect(toJsLiteral('${env.KEY}')).toBe('`${env.KEY}`')
  })

  it('converts numbers', () => {
    expect(toJsLiteral(42)).toBe('42')
  })

  it('converts booleans', () => {
    expect(toJsLiteral(true)).toBe('true')
  })

  it('converts null/undefined to "null"', () => {
    expect(toJsLiteral(null)).toBe('null')
    expect(toJsLiteral(undefined)).toBe('null')
  })

  it('converts objects/arrays to JSON', () => {
    expect(toJsLiteral({ a: 1 })).toBe('{"a":1}')
    expect(toJsLiteral([1, 2])).toBe('[1,2]')
  })
})

describe('resolveCtxConfig', () => {
  it('replaces ctx.config.field with literal value', () => {
    const result = resolveCtxConfig('fetch(ctx.config.webhookUrl)', {
      webhookUrl: 'https://example.com',
    })
    expect(result).toBe('fetch("https://example.com")')
  })

  it('handles dotted paths into nested objects', () => {
    const result = resolveCtxConfig('ctx.config.auth.token', { auth: { token: 'abc' } })
    expect(result).toBe('"abc"')
  })

  it('returns null for missing values', () => {
    const result = resolveCtxConfig('ctx.config.missing', {})
    expect(result).toBe('null')
  })
})

describe('resolveCtxEnv', () => {
  it('replaces ctx.env. with env.', () => {
    expect(resolveCtxEnv('ctx.env.API_KEY')).toBe('env.API_KEY')
  })

  it('handles multiple replacements', () => {
    expect(resolveCtxEnv('ctx.env.A + ctx.env.B')).toBe('env.A + env.B')
  })
})

describe('resolveCtxInputs', () => {
  it('replaces ctx.inputs.field with bare code reference', () => {
    const result = resolveCtxInputs('ctx.inputs.previous_step', { previous_step: 'step_1' })
    expect(result).toBe('step_1')
  })

  it('handles resolved expression values as-is', () => {
    const result = resolveCtxInputs('JSON.stringify(ctx.inputs.data)', {
      data: 'Fetch_Data.output',
    })
    expect(result).toBe('JSON.stringify(Fetch_Data.output)')
  })

  it('returns null for missing values', () => {
    const result = resolveCtxInputs('ctx.inputs.missing', {})
    expect(result).toBe('null')
  })
})

describe('generateCustomNode', () => {
  beforeEach(() => {
    setVarNameMap(new Map([['my-node', 'My_Node']]))
  })

  afterEach(() => {
    clearVarNameMap()
  })

  const template = `export default async function(ctx: NodeContext<Config>) {
  const response = await fetch(ctx.config.webhookUrl, {
    method: "POST",
    headers: { "Authorization": \`Bearer \${ctx.env.API_KEY}\` },
    body: JSON.stringify(ctx.inputs.previous_step)
  });
  return response.json();
}`

  it('generates a complete step.do call from a template', () => {
    const node: WorkflowNode = {
      id: 'my-node',
      name: 'My Node',
      type: 'webhook-post',
      version: '1.0.0',
      provider: 'cloudflare',
      position: { x: 0, y: 0 },
      data: {
        webhookUrl: 'https://hook.example.com',
        input_previous_step: 'step_1',
      },
      config: { retries: { limit: 3, delay: '5 seconds' } },
    }

    const code = generateCustomNode(node, template)

    expect(code).toContain('const My_Node = await step.do("My Node"')
    expect(code).toContain('{ retries: { limit: 3, delay: "5 seconds" } }')
    expect(code).toContain('"https://hook.example.com"')
    expect(code).toContain('env.API_KEY')
    expect(code).toContain('JSON.stringify(step_1)')
    expect(code).toContain('return response.json();')
    expect(code).not.toContain('ctx.')
  })

  it('omits variable assignment when template has no return', () => {
    const noReturnTemplate = `export default async function(ctx) {
  console.log(ctx.config.message);
}`
    const node: WorkflowNode = {
      id: 'my-node',
      name: 'Log',
      type: 'logger',
      version: '1.0.0',
      provider: 'cloudflare',
      position: { x: 0, y: 0 },
      data: { message: 'hello' },
    }

    const code = generateCustomNode(node, noReturnTemplate)
    expect(code).toMatch(/^await step\.do/)
    expect(code).not.toContain('const ')
  })

  it('includes import statements from the template', () => {
    const templateWithImport = `import { uniqueNamesGenerator, adjectives, colors, animals } from 'unique-names-generator'

export default async function(ctx) {
  const name = uniqueNamesGenerator({
    dictionaries: [adjectives, colors, animals],
    separator: ctx.config.separator,
  });
  return { name };
}`
    const node: WorkflowNode = {
      id: 'my-node',
      name: 'Generate Name',
      type: 'generate_name',
      version: '1.0.0',
      provider: 'cloudflare',
      position: { x: 0, y: 0 },
      data: { separator: '_' },
    }

    const code = generateCustomNode(node, templateWithImport)
    expect(code).toContain(
      "import { uniqueNamesGenerator, adjectives, colors, animals } from 'unique-names-generator'",
    )
    expect(code).toContain('await step.do("Generate Name"')
    expect(code).toContain('return { name };')
  })

  it('omits config arg when node has no config', () => {
    const simpleTemplate = `export default async function(ctx) {
  return ctx.config.value;
}`
    const node: WorkflowNode = {
      id: 'my-node',
      name: 'Simple',
      type: 'simple',
      version: '1.0.0',
      provider: 'cloudflare',
      position: { x: 0, y: 0 },
      data: { value: 42 },
    }

    const code = generateCustomNode(node, simpleTemplate)
    expect(code).toContain('await step.do("Simple", async () => {')
    expect(code).toContain('42')
  })
})
