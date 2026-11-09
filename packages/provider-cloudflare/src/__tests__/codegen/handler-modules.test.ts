import { describe, it, expect } from 'vitest'
import type { ScriptIR, WorkflowIR, WorkflowNode } from '@awaitstep/ir'
import { projectHandlerModules } from '@awaitstep/ir'
import { bundleDeployFiles } from '@awaitstep/codegen'
import {
  entryImportFor,
  handlerDelegates,
  handlerModuleScaffold,
  handlerModulesFromTriggerCode,
  handlerWiring,
  scheduleProblem,
  withConversionSettings,
} from '../../codegen/handler-modules.js'
import { generateScriptBundle, generateWorkflowBundle } from '../../codegen/generate.js'
import { generateScript } from '../../codegen/generate-script.js'
import { providerEntrySource } from './bundle-source.js'
import { buildCronTriggers, buildQueueConsumers } from '../../adapter.js'

function node(id: string, name: string, data: Record<string, unknown>): WorkflowNode {
  return {
    id,
    type: 'step',
    name,
    position: { x: 0, y: 0 },
    version: '1.0.0',
    provider: 'cloudflare',
    data,
  }
}

const baseIr: WorkflowIR = {
  metadata: { name: 'Orders', version: 1, createdAt: '', updatedAt: '' },
  entryNodeId: 'step',
  nodes: [node('step', 'Step', { code: 'return 1;' })],
  edges: [],
}

const files = [
  { path: 'handlers/fetch.ts', source: 'export default async () => new Response("hi")' },
  { path: 'handlers/queue/orders.ts', source: 'export default async () => {}' },
  { path: 'handlers/queue/dead-letters.ts', source: 'export default async () => {}' },
  { path: 'handlers/scheduled.ts', source: 'export default async () => {}' },
  { path: 'lib/util.ts', source: 'export const x = 1' },
]

describe('handlerWiring / handlerDelegates', () => {
  it('wraps a fetch delegate with the send-event handler only when asked', () => {
    const wiring = handlerWiring(projectHandlerModules([files[0]!]))
    const plain = handlerDelegates(wiring).join('\n')
    const wrapped = handlerDelegates(wiring, { sendEvent: true }).join('\n')
    expect(plain).not.toContain('awaitstepSendEvent')
    expect(wrapped).toContain('const sent = await awaitstepSendEvent(request, env)')
    expect(wrapped).toContain('if (sent) return sent;')
  })

  it('imports each module by its compiled path and delegates to it', () => {
    const wiring = handlerWiring(projectHandlerModules(files))
    expect(wiring.imports).toEqual([
      'import $$fetchHandler from "./handlers/fetch.js";',
      'import $$scheduledHandler from "./handlers/scheduled.js";',
      'import $$queue_dead_letters from "./handlers/queue/dead-letters.js";',
      'import $$queue_orders from "./handlers/queue/orders.js";',
    ])
    expect(wiring.reexports).toEqual([])
    const delegates = handlerDelegates(wiring).join('\n')
    expect(delegates).toContain(
      'fetch: (request: Request, env: Env, ctx: ExecutionContext) =>\n    $$fetchHandler({ request, env, execution: { waitUntil: (promise) => ctx.waitUntil(promise) } }),',
    )
    expect(delegates).toContain(
      'const execution = { waitUntil: (promise: Promise<unknown>) => ctx.waitUntil(promise) };',
    )
    expect(delegates).toContain(
      'case "dead-letters":\n        return $$queue_dead_letters({ batch: portable, env, execution });',
    )
    expect(delegates).toContain(
      'case "orders":\n        return $$queue_orders({ batch: portable, env, execution });',
    )
    expect(delegates).toContain(
      'scheduled: (controller: ScheduledController, env: Env, ctx: ExecutionContext) =>\n    $$scheduledHandler({\n      cron: controller.cron,\n      scheduledTime: controller.scheduledTime,\n      env,\n      execution: { waitUntil: (promise) => ctx.waitUntil(promise) },\n    }),',
    )
  })

  it('keeps import identifiers distinct for queue names that sanitize alike', () => {
    // All three are valid queue names and all sanitize to `a_b`.
    const wiring = handlerWiring(
      projectHandlerModules([
        { path: 'handlers/queue/a-b.ts' },
        { path: 'handlers/queue/a--b.ts' },
        { path: 'handlers/queue/a---b.ts' },
      ]),
    )
    const identifiers = wiring.queues.map((q) => q.identifier)
    expect(identifiers).toHaveLength(3)
    expect(new Set(identifiers)).toEqual(new Set(['$$queue_a_b', '$$queue_a_b_2', '$$queue_a_b_3']))
    expect(new Set(wiring.imports).size).toBe(3)
  })

  it('cannot collide with a generated node import, whatever the step is called', () => {
    // A step named "queue orders" imports as `$queue_orders`; the doubled
    // `$` is a namespace node imports can never reach.
    const bundle = generateWorkflowBundle({
      ...baseIr,
      nodes: [node('step', 'queue orders', { code: 'return 1;' })],
      runtime: { files: [files[1]!] },
    })
    const worker = providerEntrySource(bundle)
    const imported = [...worker.matchAll(/^import (\S+) from/gm)].map((m) => m[1]!)
    expect(new Set(imported).size).toBe(imported.length)
    expect(imported).toContain('$$queue_orders')
  })

  it('re-exports the shared module from the entry so its exports reach the runtime', () => {
    const wiring = handlerWiring(
      projectHandlerModules([{ path: 'handlers/fetch.ts' }, { path: 'handlers/shared.ts' }]),
    )
    expect(wiring.reexports).toEqual(['export * from "./handlers/shared.js";'])
  })
})

describe('generated entries with handler modules', () => {
  it('wires the modules into the workflow entry and ignores the annotation file', () => {
    const bundle = generateWorkflowBundle(
      { ...baseIr, runtime: { files } },
      { triggerCode: '@fetch function handler() { return new Response("annotation") }' },
    )
    const worker = providerEntrySource(bundle)
    expect(worker).toContain('import $$fetchHandler from "./handlers/fetch.js";')
    expect(worker).toContain('$$fetchHandler({ request, env, execution')
    expect(worker).toContain('case "orders":')
    expect(worker).toContain(
      'scheduled: (controller: ScheduledController, env: Env, ctx: ExecutionContext) =>',
    )
    // The retention lives in the workflow module. The handlers start
    // instances there, so the worker needs none of it and exports nothing
    // but its handlers: nothing imports the worker.
    expect(worker).toContain('import workflow from "#awaitstep/workflow";')
    expect(worker).not.toContain('AWAITSTEP_RETENTION')
    expect(worker).not.toMatch(/^export \{/m)
    expect(worker).not.toContain('"annotation"')
    expect(worker).not.toContain('async fetch(')
    // The modules ship as ordinary modules beside the entry.
    expect(bundleDeployFiles(bundle).map((f) => f.path)).toEqual(
      expect.arrayContaining(['worker.ts', 'handlers/fetch.ts', 'handlers/queue/orders.ts']),
    )
  })

  it('imports the retention into a workflow worker only when its inline default fetch creates instances', () => {
    const inline = generateWorkflowBundle(baseIr)
    const worker = providerEntrySource(inline)
    expect(worker).toContain('import workflow, { AWAITSTEP_RETENTION } from "#awaitstep/workflow";')
    expect(worker).toContain('retention: AWAITSTEP_RETENTION')
    expect(worker).not.toMatch(/^export \{/m)
  })

  it('keeps the default fetch entry when the project has only a queue module', () => {
    const bundle = generateWorkflowBundle({
      ...baseIr,
      runtime: { files: [files[1]!] },
    })
    const worker = providerEntrySource(bundle)
    expect(worker).toContain('async fetch(request, env, ctx): Promise<Response>')
    expect(worker).toContain('env.WORKFLOW.create')
    expect(worker).toContain('case "orders":')
    expect(worker).not.toContain('scheduled')
  })

  it('leaves an annotation-only workflow byte-for-byte as before', () => {
    const bundle = generateWorkflowBundle(baseIr)
    const worker = providerEntrySource(bundle)
    expect(worker).not.toContain('const AWAITSTEP_RETENTION')
    expect(bundle.files.find((f) => f.path === 'awaitstep/workflow.ts')!.source).toContain(
      'export const AWAITSTEP_RETENTION',
    )
  })

  it('exports runGraph from the function module; the worker imports only what its own code calls and re-exports nothing', () => {
    const scriptIr: ScriptIR = {
      kind: 'script',
      metadata: { name: 'Fn', version: 1, createdAt: '', updatedAt: '' },
      trigger: { type: 'http' },
      entryNodeId: 'step',
      nodes: [node('step', 'Step', { code: 'return 1;' })],
      edges: [],
      runtime: { files: [files[0]!] },
    }
    const bundle = generateScriptBundle(scriptIr)
    const worker = providerEntrySource(bundle)
    const graph = bundle.files.find((f) => f.path === 'awaitstep/function.ts')!.source
    expect(graph).toContain('export async function runGraph(')
    expect(graph).not.toContain('handlers/')
    // The handler module runs the graph, so the worker does not import it.
    expect(worker).toContain('import { type Env } from "#awaitstep/function";')
    expect(worker).not.toContain('runGraph')
    expect(worker).toContain('$$fetchHandler({ request, env, execution')
    expect(worker).not.toMatch(/^export \{/m)
    // Without a handler module the default fetch is inline and calls the imported runGraph.
    const plain = generateScript({ ...scriptIr, runtime: {} })
    expect(plain).toContain('import { runGraph, type Env } from "#awaitstep/function";')
    expect(plain).toContain('const graph = await runGraph(env, event)')
    expect(plain).not.toContain('$$fetchHandler')
    expect(plain).not.toMatch(/^export \{/m)
    // A word in a comment or a string is not a use.
    const commented = generateScript(
      {
        ...scriptIr,
        runtime: {},
      },
      { triggerCode: '// runGraph is not called here\nreturn new Response("runGraph")' },
    )
    expect(commented).toContain('import { type Env } from "#awaitstep/function";')
  })
})

describe('deploy derivation with handler modules', () => {
  const modules = projectHandlerModules(files)

  it('consumers come from the queue files, with deployment-config settings layered on', () => {
    expect(
      buildQueueConsumers(
        '@queue function ignored(batch) {}',
        { queueConsumers: [{ queue: 'orders', maxRetries: 3 }] },
        modules,
      ),
    ).toEqual([{ queue: 'dead-letters' }, { queue: 'orders', maxRetries: 3 }])
    expect(buildQueueConsumers('@queue function legacy(batch) {}', undefined)).toEqual([
      { queue: 'legacy' },
    ])
  })

  it('schedules are declared: the deployment config, plus the workflow cron once a scheduled module exists', () => {
    const annotated = '@scheduled function tick(controller, env, ctx) {\n  @crons ["* * * * *"]\n}'
    expect(buildCronTriggers(annotated, { cronTriggers: ['0 * * * *'] }, modules)).toEqual([
      '0 * * * *',
    ])
    // A project that only consumes a queue has no schedule to deploy.
    const queueOnly = projectHandlerModules([files[1]!])
    expect(buildCronTriggers(annotated, undefined, queueOnly)).toBeUndefined()
    // The legacy annotation model is untouched for a project without modules.
    expect(buildCronTriggers(annotated, undefined)).toEqual(['* * * * *'])
  })

  it('names the missing half of a schedule setup', () => {
    expect(scheduleProblem({ hasScheduledModule: true, crons: [] })).toMatch(
      /handlers\/scheduled.ts has no schedule/,
    )
    expect(scheduleProblem({ hasScheduledModule: false, crons: ['0 * * * *'] })).toMatch(
      /no handlers\/scheduled.ts/,
    )
    expect(scheduleProblem({ hasScheduledModule: true, crons: ['0 * * * *'] })).toBeNull()
    expect(scheduleProblem({ hasScheduledModule: false, crons: [] })).toBeNull()
  })
})

describe('handlerModulesFromTriggerCode', () => {
  it('splits an annotated file into modules and reports the declarative facts', () => {
    const source = `import { z } from "zod"
const schema = z.object({});

@fetch function handler(request, env, ctx) {
  const instance = await env.WORKFLOW.create({ retention: AWAITSTEP_RETENTION });
  return Response.json(schema.parse({ id: instance.id }));
}

@queue function orderEvents(batch, env, ctx) {
  @config { max_batch_size: 5 }
  for (const m of batch.messages) m.ack();
}

@scheduled function hourly(controller, env, ctx) {
  @crons ["0 * * * *"]
  await env.WORKFLOW.create({});
}
`
    const result = handlerModulesFromTriggerCode(source, 'workflow')
    expect(result.files.map((f) => f.path)).toEqual([
      'handlers/shared.ts',
      'handlers/fetch.ts',
      'handlers/queue/order-events.ts',
      'handlers/scheduled.ts',
    ])
    const byPath = new Map(result.files.map((f) => [f.path, f.source]))

    // Module-level code lands once, exported, instead of being copied into
    // every handler: its state stays single and the entry re-exports it.
    const shared = byPath.get('handlers/shared.ts')!
    expect(shared).toContain('import { z } from "zod"')
    expect(shared).toContain('export const schema = z.object({});')

    const fetch = byPath.get('handlers/fetch.ts')!
    // Graph-scoped names come through the workflow module, never the worker.
    expect(fetch.startsWith('import { AWAITSTEP_RETENTION } from "#awaitstep/workflow";\n')).toBe(
      true,
    )
    expect(fetch).toContain('import type { FetchContext } from "#awaitstep/runtime";')
    // The module-level import follows, the declaration does not.
    expect(fetch).toContain('import { z } from "zod"')
    expect(fetch).toContain('import { schema } from "#app/handlers/shared";')
    expect(fetch).not.toContain('z.object')
    expect(fetch).toContain(
      'export default async function ({ request, env, execution }: FetchContext<Env>): Promise<Response> {',
    )
    expect(fetch).toContain('return Response.json(schema.parse({ id: instance.id }));')

    // Queue bodies always ran with batch/env/ctx whatever the declaration
    // said, so the module keeps those names.
    const queue = byPath.get('handlers/queue/order-events.ts')!
    expect(queue).toContain(
      'export default async function ({ batch, env, execution }: QueueContext<Env>): Promise<void> {',
    )
    expect(queue).toContain('for (const m of batch.messages) m.ack();')
    expect(queue).not.toContain('#app/worker')
    expect(queue).not.toContain('#app/handlers/shared')

    // The cron guard survives: the module now runs for every cron the
    // workflow registers, not only the one it was declared for.
    const scheduled = byPath.get('handlers/scheduled.ts')!
    expect(scheduled).toContain(
      'export default async function ({ cron, scheduledTime, env, execution }: ScheduledContext<Env>): Promise<void> {',
    )
    // A body written against the controller still finds one.
    expect(scheduled).toContain('const controller = { cron, scheduledTime };')
    expect(scheduled).toContain('switch (controller.cron) {')
    expect(scheduled).toContain('case "0 * * * *":')

    expect(result.crons).toEqual(['0 * * * *'])
    expect(result.queueConfigs).toEqual([{ queue: 'order-events', maxBatchSize: 5 }])
    expect(result.queueNames).toEqual([{ name: 'orderEvents', queue: 'order-events' }])
  })

  it('keeps a queue body working when the annotation declared other parameter names', () => {
    const result = handlerModulesFromTriggerCode(
      '@queue function orders(b, e, c) {\n  batch.ackAll();\n}',
      'workflow',
    )
    expect(result.files[0]!.source).toContain(
      'export default async function ({ batch, env, execution }: QueueContext<Env>)',
    )
    expect(result.files[0]!.source).toContain('batch.ackAll();')
  })

  it('keeps the names an @fetch body was written against, and ctx for every kind', () => {
    const result = handlerModulesFromTriggerCode(
      [
        '@fetch function handler(req, env, context) {\n  context.waitUntil(log(req.url));\n  return new Response(req.method);\n}',
        '@queue function orders(batch, env, ctx) {\n  ctx.waitUntil(flush(batch));\n}',
        '@scheduled function hourly(controller, env, ctx) {\n  @crons ["0 * * * *"]\n  ctx.waitUntil(tick(controller.cron));\n}',
      ].join('\n\n'),
      'workflow',
    )
    const byPath = new Map(result.files.map((f) => [f.path, f.source]))
    const fetch = byPath.get('handlers/fetch.ts')!
    expect(fetch).toContain('({ request, env, execution }: FetchContext<Env>)')
    expect(fetch).toContain(
      '  const req = request;\n  const context = execution;\n  context.waitUntil(log(req.url));',
    )
    expect(fetch).not.toContain('const env = env')
    expect(byPath.get('handlers/queue/orders.ts')).toContain(
      '  const ctx = execution;\n  ctx.waitUntil(flush(batch));',
    )
    const scheduled = byPath.get('handlers/scheduled.ts')!
    expect(scheduled).toContain('const ctx = execution;')
    expect(scheduled).toContain('const controller = { cron, scheduledTime };')
    // A body that uses none of them gets no prelude.
    const plain = handlerModulesFromTriggerCode(
      '@fetch function handler(request, env) {\n  return new Response("x");\n}',
      'workflow',
    )
    expect(plain.files[0]!.source).not.toContain('const ')
  })

  it('turns legacy trigger code into a fetch module, with the entry imports its body needs', () => {
    const legacy = handlerModulesFromTriggerCode('return new Response("legacy")', 'workflow')
    expect(legacy.files).toEqual([
      {
        path: 'handlers/fetch.ts',
        source:
          'import type { FetchContext } from "#awaitstep/runtime";\n\nexport default async function ({ request, env, execution }: FetchContext<Env>): Promise<Response> {\n  return new Response("legacy")\n}\n',
      },
    ])
    const script = handlerModulesFromTriggerCode(
      'const graph = await runGraph(env, { payload: 1 }); return Response.json(graph)',
      'script',
    )
    expect(
      script.files[0]!.source.startsWith('import { runGraph } from "#awaitstep/function";'),
    ).toBe(true)
    expect(entryImportFor('runGraph(env) + AWAITSTEP_RETENTION', 'script')).toBe(
      'import { runGraph, AWAITSTEP_RETENTION } from "#awaitstep/function";\n',
    )
    expect(entryImportFor('runGraph(env)', 'workflow')).toBe('')
  })

  it('scaffolds each kind of module with the entry imports they rely on', () => {
    const fetch = handlerModuleScaffold({ kind: 'fetch', target: 'workflow' })
    expect(fetch).toContain('import { startWorkflow, workflowStatus } from "#awaitstep/workflow"')
    expect(fetch).toContain('await startWorkflow(env, params)')
    expect(fetch).toContain('({ request, env }: FetchContext<Env>)')
    expect(fetch).not.toContain('ExecutionContext')
    const script = handlerModuleScaffold({ kind: 'fetch', target: 'script' })
    expect(script).toContain('import { runGraph } from "#awaitstep/function"')
    expect(script).toContain('runGraph(env')
    expect(handlerModuleScaffold({ kind: 'queue', queue: 'orders' })).toContain(
      '({ batch, env }: QueueContext<Env>)',
    )
    expect(handlerModuleScaffold({ kind: 'scheduled' })).toContain(
      '({ cron, scheduledTime, env }: ScheduledContext<Env>)',
    )
    for (const kind of ['fetch', 'queue', 'scheduled'] as const) {
      const scaffold =
        kind === 'fetch'
          ? handlerModuleScaffold({ kind, target: 'script' })
          : kind === 'queue'
            ? handlerModuleScaffold({ kind, queue: 'q' })
            : handlerModuleScaffold({ kind })
      expect(scaffold).not.toMatch(/ExecutionContext|ScheduledController|MessageBatch|#app\/worker/)
    }
  })
})

describe('withConversionSettings', () => {
  it('folds crons and inline queue settings into the deployment config, declared settings winning', () => {
    const config = {
      cronTriggers: ['0 * * * *'],
      queueConsumers: [{ queue: 'orders', maxRetries: 9 }],
    }
    const next = withConversionSettings(config, {
      crons: ['0 * * * *', '*/5 * * * *'],
      queueConfigs: [
        { queue: 'orders', maxRetries: 2, maxBatchSize: 5 },
        { queue: 'emails', maxBatchSize: 1 },
      ],
      queueNames: [
        { name: 'orders', queue: 'orders' },
        { name: 'emails', queue: 'emails' },
      ],
    })
    expect(next).toEqual({
      cronTriggers: ['0 * * * *', '*/5 * * * *'],
      queueConsumers: [
        { queue: 'orders', maxRetries: 9, maxBatchSize: 5 },
        { queue: 'emails', maxBatchSize: 1 },
      ],
    })
    // Nothing new: the same object comes back.
    const none = { crons: ['0 * * * *'], queueConfigs: [], queueNames: [] }
    expect(withConversionSettings(config, none)).toBe(config)
    expect(withConversionSettings({}, { crons: [], queueConfigs: [], queueNames: [] })).toEqual({})
  })

  it('renames overrides keyed by the handler’s JS name to the queue the module consumes', () => {
    const config = {
      queueConsumers: [
        { queue: 'orderEvents', maxRetries: 5 },
        { queue: 'order-events', deadLetterQueue: 'dlq' },
        { queue: 'emailJobs', maxBatchSize: 3 },
      ],
    }
    const next = withConversionSettings(config, {
      crons: [],
      queueConfigs: [{ queue: 'email-jobs', maxRetries: 1 }],
      queueNames: [
        { name: 'orderEvents', queue: 'order-events' },
        { name: 'emailJobs', queue: 'email-jobs' },
      ],
    })
    expect(next.queueConsumers).toEqual([
      // Both existed: merged under the queue name, the queue-keyed entry winning.
      { queue: 'order-events', maxRetries: 5, deadLetterQueue: 'dlq' },
      // Renamed, then the inline @config fills the gap.
      { queue: 'email-jobs', maxBatchSize: 3, maxRetries: 1 },
    ])
  })
})
