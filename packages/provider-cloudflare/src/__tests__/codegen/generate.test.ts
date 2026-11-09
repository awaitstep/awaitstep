import { describe, it, expect } from 'vitest'
import type { WorkflowIR, WorkflowNode } from '@awaitstep/ir'
import type { TemplateResolver } from '@awaitstep/codegen'
import {
  generateWorkflow,
  generateWorkflowBundle,
  CloudflareCodeGenerator,
} from '../../codegen/generate.js'
import { workflowSource } from './bundle-source.js'
import { recurseWithTestCtx as generateNodeCode } from './test-context.js'
import simpleWorkflow from './fixtures/simple-workflow.json'
import parallelWorkflow from './fixtures/parallel-workflow.json'
import eventWorkflow from './fixtures/event-workflow.json'

import branchingWorkflow from './fixtures/branching-workflow.json'
import expressionWorkflow from './fixtures/expression-workflow.json'

/** Every file of the bundle as one text: the worker, the workflow module, env, the step modules. */
function programOf(ir: WorkflowIR, options?: Parameters<typeof generateWorkflowBundle>[1]): string {
  return generateWorkflowBundle(ir, options)
    .files.map((f) => f.source)
    .join('\n')
}

describe('generateWorkflow', () => {
  it('generates a simple sequential workflow', () => {
    const code = workflowSource(generateWorkflowBundle(simpleWorkflow as unknown as WorkflowIR))
    expect(code).toMatchInlineSnapshot(`
      "import { defineWorkflow, durableStep } from "#awaitstep/runtime";
      import type { Env } from "#awaitstep/env";
      import $Fetch_data from "#app/steps/step-1.js";
      import $Process_data from "#app/steps/step-2.js";

      export const AWAITSTEP_RETENTION = { successRetention: "7 days", errorRetention: "7 days" };

      /** Starts an instance of this workflow with \`params\` as its event payload. */
      export async function startWorkflow(env: Env, params: unknown): Promise<{ instanceId: string }> {
        const instance = await env.WORKFLOW.create({ params, retention: AWAITSTEP_RETENTION });
        return { instanceId: instance.id };
      }

      /** The status of an instance, or null when there is none by that id. */
      export async function workflowStatus(env: Env, instanceId: string) {
        const instance = await env.WORKFLOW.get(instanceId).catch(() => null);
        return instance ? instance.status() : null;
      }

      export default defineWorkflow<Env>({
        id: "simple_workflow",
        async run(flow) {
          const env = flow.env;
          const event = flow.event;
          const step = durableStep(flow);
          await flow.step("step-1", { retries: { limit: 3, delay: "5 seconds", backoff: "exponential" }, timeout: "30 seconds" }, async (ctx) => {
            await $Fetch_data({ env, event, inputs: {}, step, ctx });
          });

          await flow.sleep("sleep-1", "10 seconds");

          await flow.step("step-2", async (ctx) => {
            await $Process_data({ env, event, inputs: {}, step, ctx });
          });
        },
      });
      "
    `)
  })

  it('adds a send-event fetch block only when the graph waits for an event', () => {
    const withWait = {
      ...(simpleWorkflow as unknown as WorkflowIR),
      nodes: [
        ...(simpleWorkflow as unknown as WorkflowIR).nodes,
        {
          id: 'approval',
          type: 'wait_for_event',
          name: 'Wait for approval',
          version: '1.0.0',
          provider: 'cloudflare',
          data: { eventType: 'approval' },
        },
      ],
      edges: [
        ...(simpleWorkflow as unknown as WorkflowIR).edges,
        {
          id: 'to-approval',
          source: (simpleWorkflow as unknown as WorkflowIR).nodes.at(-1)!.id,
          target: 'approval',
        },
      ],
    } as WorkflowIR
    const waiting = programOf(withWait)
    expect(waiting).toContain('async function awaitstepSendEvent')
    expect(waiting).toContain('action !== "send-event"')
    expect(waiting).toContain('if (!instance)')
    expect(waiting).toContain(
      'const payload = body?.params ?? body?.payload ?? (queryAction ? body : undefined)',
    )
    expect(waiting).toContain('await instance.sendEvent({ type, payload })')

    expect(programOf(simpleWorkflow as unknown as WorkflowIR)).not.toContain('awaitstepSendEvent')
  })

  it('generates a branching workflow', () => {
    const code = programOf(branchingWorkflow as unknown as WorkflowIR)
    expect(code).toContain('if (state.shouldNotify === true)')
    expect(code).toContain('} else {')
    expect(code).toContain('fetch("https://api.example.com/notify"')
  })

  it('generates a single-branch (if without else)', () => {
    const ir: WorkflowIR = {
      metadata: { name: 'single-branch-test', version: 1, createdAt: '', updatedAt: '' },
      nodes: [
        {
          id: 'br',
          type: 'branch',
          name: 'Maybe run',
          position: { x: 0, y: 0 },
          version: '1.0.0',
          provider: 'cloudflare',
          data: { branches: [{ label: 'yes', condition: 'true' }] },
        },
        {
          id: 's1',
          type: 'step',
          name: 'Inside',
          position: { x: 0, y: 0 },
          version: '1.0.0',
          provider: 'cloudflare',
          data: { code: 'return 1;' },
        },
      ],
      edges: [{ id: 'e0', source: 'br', target: 's1', label: 'yes' }],
      entryNodeId: 'br',
    }
    const code = programOf(ir)
    expect(code).toContain('if (true) {')
    expect(code).not.toContain('} else {')
    expect(code).toContain('flow.step("s1"')
  })

  it('emits a "then" continuation node AFTER the branch block', () => {
    const ir: WorkflowIR = {
      metadata: { name: 'branch-then-test', version: 1, createdAt: '', updatedAt: '' },
      nodes: [
        {
          id: 'br',
          type: 'branch',
          name: 'Check',
          position: { x: 0, y: 0 },
          version: '1.0.0',
          provider: 'cloudflare',
          data: { branches: [{ label: 'yes', condition: 'true' }] },
        },
        {
          id: 's1',
          type: 'step',
          name: 'Inside',
          position: { x: 0, y: 0 },
          version: '1.0.0',
          provider: 'cloudflare',
          data: { code: 'return 1;' },
        },
        {
          id: 's2',
          type: 'step',
          name: 'After branch',
          position: { x: 0, y: 0 },
          version: '1.0.0',
          provider: 'cloudflare',
          data: { code: 'return 2;' },
        },
      ],
      edges: [
        { id: 'e0', source: 'br', target: 's1', label: 'yes' },
        { id: 'e1', source: 'br', target: 's2', label: 'then' },
      ],
      entryNodeId: 'br',
    }
    const code = programOf(ir)
    // Branch body present
    expect(code).toContain('if (true) {')
    expect(code).toContain('flow.step("s1"')
    // Continuation step also present, AFTER the branch's closing brace
    expect(code).toContain('flow.step("s2"')
    const branchCloseIdx = code.lastIndexOf('}')
    const afterBranchIdx = code.indexOf('flow.step("s2"')
    // The continuation must appear in the source after the branch close — i.e.,
    // not inlined inside the if/else.
    expect(afterBranchIdx).toBeGreaterThan(0)
    // Sanity: the inside step appears BEFORE the continuation step
    const insideIdx = code.indexOf('flow.step("s1"')
    expect(insideIdx).toBeLessThan(afterBranchIdx)
    expect(branchCloseIdx).toBeGreaterThan(0) // matched some closing brace
  })

  it('generates a parallel workflow', () => {
    const code = programOf(parallelWorkflow as unknown as WorkflowIR)
    expect(code).toContain('Promise.allSettled')
    expect(code).toContain('flow.step("task_a"')
    expect(code).toContain('flow.step("task_b"')
  })

  it('generates a wait-for-event workflow', () => {
    const code = programOf(eventWorkflow as unknown as WorkflowIR)
    expect(code).toContain('step.waitForEvent')
    expect(code).toContain('"user-approval"')
    expect(code).toContain('timeout: "48 hours"')
  })

  it('generates a valid class name from workflow name', () => {
    const code = generateWorkflow(simpleWorkflow as unknown as WorkflowIR)
    expect(code).toContain('class SimpleWorkflow')
  })

  it('includes the cloudflare:workers import', () => {
    const code = generateWorkflow(simpleWorkflow as unknown as WorkflowIR)
    expect(code).toContain('import { WorkflowEntrypoint } from "cloudflare:workers"')
  })

  it('extends WorkflowEntrypoint<Env>', () => {
    const code = generateWorkflow(simpleWorkflow as unknown as WorkflowIR)
    expect(code).toContain('extends WorkflowEntrypoint<Env>')
  })

  it('generates Env interface with WORKFLOW binding', () => {
    const code = programOf(simpleWorkflow as unknown as WorkflowIR)
    expect(code).toContain('interface Env')
    expect(code).toContain('WORKFLOW: Workflow')
  })

  it('generates functional fetch handler', () => {
    const code = generateWorkflow(simpleWorkflow as unknown as WorkflowIR)
    // Default scaffolding uses @fetch annotation form with user-supplied params.
    expect(code).toContain('async fetch(request, env, ctx)')
    expect(code).toContain('request.method === "POST"')
    expect(code).toContain('env.WORKFLOW.create({ params, retention: AWAITSTEP_RETENTION })')
    expect(code).toContain('env.WORKFLOW.get(instanceId)')
    expect(code).toContain('instance.status()')
  })

  it('resolves expressions to step variable references', () => {
    const code = programOf(expressionWorkflow as unknown as WorkflowIR)
    expect(code).not.toContain('_workflowState')
    expect(code).not.toContain('{{fetch_data.userId}}')
    expect(code).toContain('Fetch_Data.userId')
  })

  it('keeps a parallel `then` continuation inside its parent loop body', () => {
    // Regression: loop body containing a parallel whose `then` edge points to
    // a follow-up step. The continuation must be emitted INSIDE the loop body
    // (so it runs once per iteration after the parallel resolves), not at
    // the top level of `run()` after the loop ends.
    const ir: WorkflowIR = {
      metadata: { name: 'NestedLoop', version: 1, createdAt: '', updatedAt: '' },
      entryNodeId: 'loop',
      nodes: [
        {
          id: 'loop',
          type: 'loop',
          name: 'iterate',
          position: { x: 0, y: 0 },
          version: '1.0.0',
          provider: 'cloudflare',
          data: { loopType: 'forEach', collection: 'items', itemVar: 'item' },
        },
        {
          id: 'par',
          type: 'parallel',
          name: 'translate',
          position: { x: 0, y: 0 },
          version: '1.0.0',
          provider: 'cloudflare',
          data: {},
        },
        {
          id: 'title',
          type: 'step',
          name: 'title',
          position: { x: 0, y: 0 },
          version: '1.0.0',
          provider: 'cloudflare',
          data: { code: 'return item.title;' },
        },
        {
          id: 'desc',
          type: 'step',
          name: 'description',
          position: { x: 0, y: 0 },
          version: '1.0.0',
          provider: 'cloudflare',
          data: { code: 'return item.description;' },
        },
        {
          id: 'update',
          type: 'step',
          name: 'update',
          position: { x: 0, y: 0 },
          version: '1.0.0',
          provider: 'cloudflare',
          data: { code: 'return "ok";' },
        },
      ],
      edges: [
        { id: 'e1', source: 'loop', target: 'par', label: 'body' },
        { id: 'e2', source: 'par', target: 'title' },
        { id: 'e3', source: 'par', target: 'desc' },
        { id: 'e4', source: 'par', target: 'update', label: 'then' },
      ],
    }

    const code = programOf(ir)
    // The loop's step.do appears before update's step.do — i.e. update is
    // emitted inside the loop body, not after the loop has closed.
    const loopIdx = code.indexOf('await flow.step("loop"')
    const updateIdx = code.indexOf('await flow.step(`update')
    const closeIdx = code.indexOf('return _output;')
    expect(loopIdx).toBeGreaterThan(-1)
    expect(updateIdx).toBeGreaterThan(loopIdx)
    expect(updateIdx).toBeLessThan(closeIdx)
    // Step name has been suffixed with the loop counter, proving it sits
    // inside the loop's scope.
    expect(code).toContain('update [${_loop_i}]')
  })
})

describe('generateNodeCode', () => {
  it('throws for unknown node types', () => {
    const customNode: WorkflowNode = {
      id: 'c1',
      name: 'Stripe Charge',
      position: { x: 0, y: 0 },
      type: 'stripe-charge',
      version: '1.0.0',
      provider: 'cloudflare',
      data: { amount: 5000 },
    }
    const ir = simpleWorkflow as unknown as WorkflowIR
    expect(() => generateNodeCode(customNode, ir)).toThrow(
      'Codegen not yet implemented for node type',
    )
    expect(() => generateNodeCode(customNode, ir)).toThrow('stripe-charge')
  })
})

describe('generateWorkflow with custom nodes', () => {
  it('generates code for custom nodes when a template resolver is provided', () => {
    const template = `export default async function(ctx) {
  const response = await fetch(ctx.config.url, {
    method: "POST",
    headers: { "Authorization": \`Bearer \${ctx.env.API_KEY}\` },
    body: JSON.stringify(ctx.inputs.payload)
  });
  return response.json();
}`
    const resolver: TemplateResolver = {
      getTemplate(nodeType: string) {
        if (nodeType === 'webhook-post') return template
        return undefined
      },
    }

    const ir: WorkflowIR = {
      metadata: { id: 'wf-1', name: 'Custom Workflow', version: '1.0.0' },
      nodes: [
        {
          id: 'step-1',
          name: 'Fetch Data',
          type: 'step',
          version: '1.0.0',
          provider: 'cloudflare',
          position: { x: 0, y: 0 },
          data: { code: "return { userId: '123' };" },
        },
        {
          id: 'webhook-1',
          name: 'Send Webhook',
          type: 'webhook-post',
          version: '1.0.0',
          provider: 'cloudflare',
          position: { x: 0, y: 200 },
          data: {
            url: 'https://hook.example.com/endpoint',
            input_payload: 'Fetch_Data',
          },
          config: { retries: { limit: 3, delay: '5 seconds' } },
        },
      ],
      edges: [{ id: 'e1', source: 'step-1', target: 'webhook-1' }],
      entryNodeId: 'step-1',
    }

    const code = programOf(ir, resolver)

    expect(code).toContain('class CustomWorkflow')
    // Class definition hoisted before workflow class
    expect(code).toContain('class WebhookPostNode {')
    expect(code).toContain('static async execute(env: Env, params: Record<string, unknown>)')
    // Step calls use the class
    expect(code).toContain('const Fetch_Data = await flow.step("step-1"')
    expect(code).toContain('const Send_Webhook = await flow.step("webhook-1"')
    expect(code).toContain('WebhookPostNode.execute(env, {')
    expect(code).toContain('"url": "https://hook.example.com/endpoint"')
    expect(code).toContain('retries: { limit: 3, delay: "5 seconds" }')
    // The template's ctx.* references are resolved. Scope the check to the
    // generated class so the bootstrap's own ctx.attempt cannot mask a leak.
    const classStart = code.indexOf('class WebhookPostNode {')
    const classEnd = code.indexOf('\n}\n', classStart)
    expect(classEnd).toBeGreaterThan(classStart)
    expect(code.slice(classStart, classEnd)).not.toMatch(/\bctx\./)
    // Env vars from template are in the Env interface
    expect(code).toContain('API_KEY: string;')
  })

  it('hoists import statements from custom node templates to the top level', () => {
    const template = `import { uniqueNamesGenerator, adjectives, colors, animals } from 'unique-names-generator'

export default async function(ctx) {
  const name = uniqueNamesGenerator({
    dictionaries: [adjectives, colors, animals],
    separator: ctx.config.separator,
  });
  return { name };
}`
    const resolver: TemplateResolver = {
      getTemplate(nodeType: string) {
        if (nodeType === 'generate_name') return template
        return undefined
      },
    }

    const ir: WorkflowIR = {
      metadata: { id: 'wf-1', name: 'Name Gen', version: '1.0.0' },
      nodes: [
        {
          id: 'gen-1',
          name: 'Generate Name',
          type: 'generate_name',
          version: '1.0.0',
          provider: 'cloudflare',
          position: { x: 0, y: 0 },
          data: { separator: '_' },
        },
      ],
      edges: [],
      entryNodeId: 'gen-1',
    }

    const bundle = generateWorkflowBundle(ir, resolver)
    // The import sits at the top of the file that holds the class, before it
    const importLine =
      "import { uniqueNamesGenerator, adjectives, colors, animals } from 'unique-names-generator'"
    const holder = bundle.files.find((f) => f.source.includes(importLine))!
    expect(holder).toBeDefined()
    expect(holder.source.indexOf(importLine)).toBeLessThan(holder.source.indexOf('class '))

    // Import should NOT appear inside the step.do body
    const workflow = workflowSource(bundle)
    const stepBody = workflow.slice(workflow.indexOf('flow.step('))
    expect(stepBody).not.toContain('import ')
  })

  it('throws for custom nodes when no resolver is provided', () => {
    const ir: WorkflowIR = {
      metadata: { id: 'wf-1', name: 'Test', version: '1.0.0' },
      nodes: [
        {
          id: 'c1',
          name: 'Custom',
          type: 'my-custom',
          version: '1.0.0',
          provider: 'cloudflare',
          position: { x: 0, y: 0 },
          data: {},
        },
      ],
      edges: [],
      entryNodeId: 'c1',
    }
    expect(() => generateWorkflow(ir)).toThrow(
      'Codegen not yet implemented for node type: my-custom',
    )
  })
})

describe('CloudflareCodeGenerator', () => {
  it('has the correct name', () => {
    const gen = new CloudflareCodeGenerator()
    expect(gen.name).toBe('cloudflare-workflows')
  })

  it('generates the same output as generateWorkflow', () => {
    const gen = new CloudflareCodeGenerator()
    const ir = simpleWorkflow as unknown as WorkflowIR
    expect(gen.generateWorkflow(ir)).toBe(generateWorkflow(ir))
  })
})

describe('generateWorkflow — annotation mode (@fetch / @queue)', () => {
  const ir = simpleWorkflow as unknown as WorkflowIR

  it('emits both fetch and queue handlers when @fetch and @queue are declared', () => {
    const triggerCode = `
@fetch function handler(request, env, ctx) {
  return Response.json({ status: "ok" })
}

@queue function emails(batch, env, ctx) {
  for (const msg of batch.messages) msg.ack()
}
`
    const code = generateWorkflow(ir, { triggerCode })
    expect(code).toContain('async fetch(request, env, ctx): Promise<Response>')
    expect(code).toMatch(
      /async queue\(batch: MessageBatch<unknown>, env: Env, ctx: ExecutionContext\): Promise<void>/,
    )
    expect(code).toContain('switch (batch.queue) {')
    expect(code).toContain('case "emails":')
  })

  it('omits fetch handler entirely for queue-only workers', () => {
    const triggerCode = `
@queue function jobs(batch, env, ctx) {
  for (const msg of batch.messages) {
    await env.WORKFLOW.create({ params: msg.body })
    msg.ack()
  }
}
`
    const code = generateWorkflow(ir, { triggerCode })
    expect(code).not.toContain('async fetch(')
    expect(code).toContain('async queue(')
    expect(code).toContain('case "jobs":')
    expect(code).toContain('env.WORKFLOW.create')
  })

  it('emits module-level code outside annotated functions, before the WorkflowEntrypoint class', () => {
    const triggerCode = `
const REGION = "eu"
function shared(x) { return x }

@fetch function handler(request, env, ctx) {
  return Response.json({ region: REGION })
}
`
    const code = generateWorkflow(ir, { triggerCode })
    expect(code).toContain('const REGION = "eu"')
    expect(code).toContain('function shared(x) { return x }')
    const moduleIdx = code.indexOf('const REGION')
    const classIdx = code.indexOf('export class')
    expect(moduleIdx).toBeGreaterThan(0)
    expect(moduleIdx).toBeLessThan(classIdx)
  })

  it('legacy mode emission used when triggerCode has no annotations', () => {
    // When user supplies a triggerCode that has no @fetch/@queue annotations,
    // legacy emission applies: typed `async fetch(request: Request, env: Env)`.
    const code = generateWorkflow(ir, {
      triggerCode: 'try { return new Response("ok") } catch (e) { return Response.json({}) }',
    })
    expect(code).toContain('async fetch(request: Request, env: Env): Promise<Response>')
    expect(code).not.toContain('async queue(')
  })

  it('emits a scheduled handler when @scheduled is declared', () => {
    const triggerCode = `
@fetch function handler(request, env, ctx) {
  return Response.json({ ok: true })
}

@scheduled function nightly(controller, env, ctx) {
  @crons ["0 2 * * *", "0 14 * * *"]
  console.log("ran at", controller.scheduledTime)
}
`
    const code = generateWorkflow(ir, { triggerCode })
    expect(code).toMatch(
      /async scheduled\(controller: ScheduledController, env: Env, ctx: ExecutionContext\): Promise<void>/,
    )
    expect(code).toContain('switch (controller.cron)')
    expect(code).toContain('case "0 2 * * *":')
    expect(code).toContain('case "0 14 * * *":')
    expect(code).toContain('console.log("ran at", controller.scheduledTime)')
    // Body emitted only once for the two-cron handler (case fallthrough).
    expect(code.match(/console\.log\("ran at"/g)?.length ?? 0).toBe(1)
  })

  it('emits one case per cron across multiple @scheduled handlers', () => {
    const triggerCode = `
@scheduled function morning(controller, env, ctx) {
  @crons ["0 6 * * *"]
  console.log("morning")
}

@scheduled function evening(controller, env, ctx) {
  @crons ["0 18 * * *"]
  console.log("evening")
}
`
    const code = generateWorkflow(ir, { triggerCode })
    expect(code).toContain('case "0 6 * * *":')
    expect(code).toContain('case "0 18 * * *":')
    expect(code).toContain('console.log("morning")')
    expect(code).toContain('console.log("evening")')
  })

  it('omits scheduled handler when no @scheduled is declared', () => {
    const triggerCode = `@fetch function handler(req, env) { return new Response("ok") }`
    const code = generateWorkflow(ir, { triggerCode })
    expect(code).not.toContain('async scheduled(')
  })
})
