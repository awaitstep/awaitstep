import { describe, expect, it } from 'vitest'
import ts from 'typescript'
import { generateScriptBundle } from '../../../codegen/generate.js'
import type { WorkflowNode } from '@awaitstep/ir'
import {
  appliedStepSettings,
  createGenerationContext,
  insertNode,
  generateCustomNodeModule,
  generateCustomNodeParts,
  templateImports,
  templateParameter,
  templateStepConfig,
} from '@awaitstep/codegen'

// How a custom node runs: the context its template is given, its own
// module, and Durable vs Inline with the node.json runtime hints.

const SCAFFOLD = `import type { Ctx, Output } from './ctx'

export default async function (ctx: Ctx): Promise<Output> {
  console.log(ctx)
  console.log('Say hello ', ctx.inputs.name)
  return { sip: 1234 }
}
`

function node(data: Record<string, unknown> = { name: 'Frank Test' }, id = 'say'): WorkflowNode {
  return {
    id,
    type: 'custom:abc',
    name: 'Say hello',
    position: { x: 0, y: 0 },
    version: '1.0.0',
    provider: 'cloudflare',
    data,
  }
}

/** Runs a generated class as the deployed code would, its types stripped. */
async function execute(classDefinition: string, className: string, params: object, env = {}) {
  const js = classDefinition.replace(/env: [^,]+, params: Record<string, unknown>/, 'env, params')
  const run = new Function(`${js}\nreturn ${className}.execute(arguments[0], arguments[1])`)
  return run(env, params) as Promise<unknown>
}

describe('the context a custom node template is given', () => {
  it('runs the scaffolded template, whose ctx is the real { env, config, inputs } object', async () => {
    const ctx = createGenerationContext([node()])
    const parts = generateCustomNodeParts(node(), SCAFFOLD, ctx, 'script')
    const logged: unknown[] = []
    const original = console.log
    console.log = (...args: unknown[]) => logged.push(args)
    try {
      const result = await execute(
        parts.classDefinition,
        parts.className,
        { name: 'Frank Test' },
        {
          API_KEY: 'k',
        },
      )
      expect(result).toEqual({ sip: 1234 })
    } finally {
      console.log = original
    }
    expect(logged[0]).toEqual([
      { env: { API_KEY: 'k' }, config: { name: 'Frank Test' }, inputs: { name: 'Frank Test' } },
    ])
    expect(logged[1]).toEqual(['Say hello ', 'Frank Test'])
  })

  it('binds a renamed or destructured parameter as written', async () => {
    const renamed = `export default async function (c: Ctx) { return { hi: c.config.name } }`
    const destructured = `export default async function ({ config, env }: Ctx): Promise<Output> {
  return { hi: config.name, key: env.API_KEY }
}`
    for (const [template, expected] of [
      [renamed, { hi: 'Ama' }],
      [destructured, { hi: 'Ama', key: 'k' }],
    ] as const) {
      const ctx = createGenerationContext([node()])
      const parts = generateCustomNodeParts(node(), template, ctx, 'script')
      expect(
        await execute(parts.classDefinition, parts.className, { name: 'Ama' }, { API_KEY: 'k' }),
      ).toEqual(expected)
    }
  })

  it('reads the template’s parameter without its type', () => {
    expect(templateParameter(SCAFFOLD)).toBe('ctx')
    expect(templateParameter('export default async function ({ config }: Ctx<{ a: 1 }>) {}')).toBe(
      '{ config }',
    )
    expect(templateParameter('export default async function () { return 1 }')).toBe('')
    expect(templateParameter('export default async function ({ config }: Ctx = {}) {}')).toBe(
      '{ config } = {}',
    )
  })
})

describe('a custom node as its own module', () => {
  it('keeps the template out of the call site, and calls it as a durable step with the node.json hints', () => {
    const ctx = createGenerationContext([node()], { emitModules: true })
    const call = generateCustomNodeModule(node(), SCAFFOLD, ctx, 'script', {
      runtime: { defaultRetries: 3, defaultTimeout: '30 seconds' },
    })
    expect(call).toBe(
      'const Say_hello = await flow.step("Say hello (say)", { retries: { limit: 3, delay: "5 seconds", backoff: "exponential" }, timeout: "30 seconds" }, () => $Say_hello({ env }));',
    )
    expect(call).not.toContain('runTemplate')
    const module = ctx.files.find((f) => f.path === 'nodes/Say_hello.ts')!
    expect(module.source).toContain('async function $runTemplate(ctx: any) {')
    // Nothing wired in, so no `inputs` to take.
    expect(module.source).toContain(
      'export default async function Say_hello_step({ env }: { env: Record<string, any> }) {',
    )
    expect(module.source).not.toContain('class ')
  })

  it('calls an Inline node directly, and never passes `inline` to the template', () => {
    const ctx = createGenerationContext([node()], { emitModules: true })
    const call = generateCustomNodeModule(
      node({ name: 'x', inline: true }),
      SCAFFOLD,
      ctx,
      'workflow',
      {
        runtime: { defaultRetries: 3 },
      },
    )
    expect(call).toBe('const Say_hello = await $Say_hello({ env });')
    const module = ctx.files.find((f) => f.path === 'nodes/Say_hello.ts')!
    expect(module.source).not.toContain('"inline"')
  })

  it('passes a container’s bindings its fields read through inputs', () => {
    const ctx = createGenerationContext([node()], { emitModules: true })
    const looped = { ...ctx, inContainer: true, blockInputs: { item: 'item', index: 'i' } }
    const call = generateCustomNodeModule(
      node({ name: '${item.name}' }),
      SCAFFOLD,
      looped,
      'workflow',
    )
    expect(call).toContain('$Say_hello({ env, inputs: { item } })')
    const module = ctx.files.find((f) => f.path === 'nodes/Say_hello.ts')!
    expect(module.source).toContain('const { item } = inputs;')
  })
})

describe('a template node’s retries and timeout', () => {
  it('comes from the placement’s config, else the node.json hints, else nothing', () => {
    expect(templateStepConfig({ config: { timeout: '1 minute' } }, { defaultRetries: 3 })).toEqual({
      timeout: '1 minute',
    })
    expect(templateStepConfig({}, { defaultRetries: 3, defaultTimeout: '60 seconds' })).toEqual({
      retries: { limit: 3, delay: '5 seconds', backoff: 'exponential' },
      timeout: '60 seconds',
    })
    expect(templateStepConfig({}, undefined)).toBeUndefined()
    expect(templateStepConfig({}, { idempotent: true })).toBeUndefined()
  })

  it('is what the canvas summary reads, and nothing for an Inline node', () => {
    const hints = { defaultRetries: 3 }
    expect(appliedStepSettings(node(), hints).config?.retries?.limit).toBe(3)
    expect(appliedStepSettings(node({ inline: true }), hints)).toEqual({
      retries: false,
      timeout: false,
      config: undefined,
    })
  })
})

/** Transpiles a generated node module and runs its default export, as the deployed bundle would. */
async function runModule(source: string, input: { env?: object; inputs?: object } = {}) {
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  })
  const module = { exports: {} as { default?: (arg: object) => Promise<unknown> } }
  new Function('module', 'exports', outputText)(module, module.exports)
  return module.exports.default!({ env: input.env ?? {}, inputs: input.inputs ?? {} })
}

describe('a generated node module, run', () => {
  it('gives the scaffolded template its real ctx', async () => {
    const ctx = createGenerationContext([node()], { emitModules: true })
    generateCustomNodeModule(node(), SCAFFOLD, ctx, 'script')
    const source = ctx.files.find((f) => f.path === 'nodes/Say_hello.ts')!.source
    const logged: unknown[] = []
    const original = console.log
    console.log = (...args: unknown[]) => logged.push(args)
    try {
      expect(await runModule(source, { env: { API_KEY: 'k' } })).toEqual({ sip: 1234 })
    } finally {
      console.log = original
    }
    expect(logged).toEqual([
      [{ env: { API_KEY: 'k' }, config: { name: 'Frank Test' }, inputs: { name: 'Frank Test' } }],
      ['Say hello ', 'Frank Test'],
    ])
  })

  it('leaves a template’s own variables alone: a local `params` no longer swallows ctx.config', async () => {
    // google-calendar's list action, reduced: before, `ctx.config.timeMin` was
    // rewritten to `params.timeMin` and read the local URLSearchParams.
    const template = `export default async function (ctx) {
  const params = new URLSearchParams()
  if (ctx.config.timeMin) params.set('timeMin', ctx.config.timeMin)
  return { query: params.toString() }
}`
    const placed = node({ timeMin: '2026-01-01' }, 'list')
    const ctx = createGenerationContext([placed], { emitModules: true })
    generateCustomNodeModule(placed, template, ctx, 'workflow')
    const source = ctx.files.find((f) => f.path.startsWith('nodes/'))!.source
    expect(await runModule(source)).toEqual({ query: 'timeMin=2026-01-01' })
  })

  it('keeps the template’s own top-level constants, helpers and types', async () => {
    // Before, only the function's body reached the module: BASE and shout were undefined.
    const template = `import type { Ctx } from './ctx'
const BASE = 'https://example.test'
type Greeting = { url: string }

export default async function (ctx: Ctx): Promise<Greeting> {
  return { url: BASE + '/' + shout(String(ctx.config.name)) }
}

function shout(text: string) {
  return text.toUpperCase()
}
`
    const ctx = createGenerationContext([node()], { emitModules: true })
    generateCustomNodeModule(node(), template, ctx, 'workflow')
    const source = ctx.files.find((f) => f.path.startsWith('nodes/'))!.source
    expect(source).not.toContain("from './ctx'")
    expect(await runModule(source)).toEqual({ url: 'https://example.test/FRANK TEST' })
  })

  it('runs a template whose parameter has a default', async () => {
    // Before: `({ config } = {}: any)`, which does not compile.
    for (const template of [
      'export default async function ({ config } = {}) { return config.name }',
      'export default async function ({ config }: Ctx = {} as Ctx) { return config.name }',
    ]) {
      const ctx = createGenerationContext([node()], { emitModules: true })
      generateCustomNodeModule(node(), template, ctx, 'workflow')
      const source = ctx.files.find((f) => f.path.startsWith('nodes/'))!.source
      const { diagnostics } = ts.transpileModule(source, { reportDiagnostics: true })
      expect(diagnostics ?? []).toEqual([])
      expect(await runModule(source)).toBe('Frank Test')
    }
  })

  it('refuses imports that would ride along with the top-level code', () => {
    // Before, these passed the "no relative imports" check and landed in nodes/<var>.ts.
    const problems = (source: string) => templateImports(source).problems
    expect(
      problems("const a = 1; import x from './y'\nexport default async function () {}"),
    ).toEqual([expect.stringContaining('write one import per line')])
    expect(problems("export default async function () { return import('../steps/x') }")).toEqual([
      expect.stringContaining('"../steps/x": a node template can import npm packages'),
    ])
    expect(problems('export default async function (n) { return import(n) }')).toEqual([
      '"import(…)": name the package in quotes',
    ])
    expect(
      problems(
        "import a from 'zod'\nexport default async function () { const u = import.meta; return import('zod') }",
      ),
    ).toEqual([])
  })

  it('refuses a template that declares the module’s own names', () => {
    const ctx = createGenerationContext([node()], { emitModules: true })
    expect(() =>
      generateCustomNodeModule(
        node(),
        'const $fields = 1\nexport default async function () { return $fields }',
        ctx,
        'workflow',
      ),
    ).toThrow('declares "$fields"')
  })

  it('hands upstream values and container bindings the fields read to the template', async () => {
    const placed = node({ greeting: '${item.name}' })
    const ctx = createGenerationContext([placed], { emitModules: true })
    const looped = { ...ctx, inContainer: true, blockInputs: { item: 'item' } }
    generateCustomNodeModule(
      placed,
      'export default async function ({ config }) { return config.greeting }',
      looped,
      'workflow',
    )
    const source = ctx.files.find((f) => f.path.startsWith('nodes/'))!.source
    expect(await runModule(source, { inputs: { item: { name: 'Ama' } } })).toBe('Ama')
  })
})

describe('a custom node field that reads an earlier node', () => {
  function graphWith(value: string, stepName = 'sample step') {
    return {
      metadata: { name: 'x', version: 1, createdAt: '', updatedAt: '' },
      entryNodeId: '0of2ji3lqt72',
      nodes: [
        {
          id: '0of2ji3lqt72',
          type: 'step',
          name: stepName,
          position: { x: 0, y: 0 },
          version: '1.0.0',
          provider: 'cloudflare',
          data: { code: 'return { result: "ok" }' },
        },
        {
          id: 'h',
          type: 'custom:abc',
          name: 'say hello',
          position: { x: 0, y: 100 },
          version: '1.0.0',
          provider: 'cloudflare',
          data: { name: value },
        },
      ],
      edges: [{ id: 'e', source: '0of2ji3lqt72', target: 'h' }],
    }
  }

  async function generatedField(value: string, inputs: object, stepName?: string) {
    const bundle = generateScriptBundle(graphWith(value, stepName) as never, {
      templateResolver: {
        getTemplate: () => 'export default async function (ctx) { return ctx.inputs.name }',
      },
    })
    const source = bundle.files.find((f) => f.path === 'nodes/say_hello.ts')!.source
    const graph = bundle.files.find((f) => f.path === 'awaitstep/function.ts')!.source
    return { result: await runModule(source, { inputs }), source, graph }
  }

  it('binds the earlier value for a node Code placed, as for one dropped on the canvas', async () => {
    const base = graphWith('unused')
    const withoutNode = { ...base, nodes: [base.nodes[0]!], edges: [] }
    const placed = insertNode(
      withoutNode as never,
      { after: '0of2ji3lqt72' },
      {
        id: 'h',
        name: 'say hello',
        type: 'custom:abc',
        data: { name: '{{sample_step.result}}' },
      },
    )
    if (!placed.ok) throw new Error(placed.reason)
    const bundle = generateScriptBundle(placed.ir, {
      templateResolver: {
        getTemplate: () => 'export default async function (ctx) { return ctx.inputs.name }',
      },
    })
    const source = bundle.files.find((f) => f.path === 'nodes/say_hello.ts')!.source
    const graph = bundle.files.find((f) => f.path === 'awaitstep/function.ts')!.source
    expect(graph).toContain('const say_hello = ')
    expect(graph).toContain('inputs: { sample_step }')
    expect(await runModule(source, { inputs: { sample_step: { result: 'Ama' } } })).toBe('Ama')
  })

  it('hands the template the earlier value, by node id or by name, keeping its type', async () => {
    for (const ref of ['0of2ji3lqt72', 'sample_step']) {
      const { result, source, graph } = await generatedField(`{{${ref}.result}}`, {
        sample_step: { result: { deep: 1 } },
      })
      expect(result).toEqual({ deep: 1 })
      expect(source).toContain('"name": sample_step.result,')
      expect(graph).toContain('inputs: { sample_step }')
    }
  })

  it('makes a string of text around expressions, escaping the text', async () => {
    const { result } = await generatedField('Hi `{{sample_step.result}}` ${x}!', {
      sample_step: { result: 'Ama' },
    })
    expect(result).toBe('Hi `Ama` ${x}!')
  })

  it('passes the trigger event when a field reads it', async () => {
    const { result, graph } = await generatedField('{{event.payload.who}}', {
      event: { payload: { who: 'Frank' } },
    })
    expect(result).toBe('Frank')
    expect(graph).toContain('inputs: { event }')
  })

  it('reads an earlier node named like the module’s own locals', async () => {
    // Before, a node named "fields" redeclared the module's `fields` and one
    // named "runTemplate" shadowed the template's function.
    for (const name of ['fields', 'runTemplate']) {
      const { result, graph } = await generatedField(
        `{{${name}.result}}`,
        { [name]: { result: 'ok' } },
        name,
      )
      expect(result).toBe('ok')
      expect(graph).toContain(`inputs: { ${name} }`)
    }
  })

  it('leaves single braces as text', async () => {
    const { result } = await generatedField('{sample_step.result}', {})
    expect(result).toBe('{sample_step.result}')
  })
})
