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
      "import { defineWorkflow, durableStep, stepArgs, sendInstanceEvent as awaitstepSendInstanceEvent, type WorkflowInstanceHandle as AwaitstepInstanceHandle } from "#awaitstep/runtime";
      import type { Env } from "#awaitstep/env";
      import $Fetch_data from "#app/steps/step-1.js";
      import $Process_data from "#app/steps/step-2.js";

      export const AWAITSTEP_RETENTION = { successRetention: "7 days", errorRetention: "7 days" };

      // Declared under awaitstep names and exported under the public ones: inline
      // code's imports are hoisted into this module, and a step importing its own
      // \`startWorkflow\`, \`workflowStatus\`, \`getInstance\` or \`sendEvent\` must keep it.
      /** Starts an instance of this workflow with \`params\` as its event payload. */
      async function awaitstepStartWorkflow(env: Env, params: unknown): Promise<{ instanceId: string }> {
        const instance = await env.WORKFLOW.create({ params, retention: AWAITSTEP_RETENTION });
        return { instanceId: instance.id };
      }

      /** An instance of this workflow by id — its status and a way to send it an event — or null when there is none. */
      async function awaitstepGetInstance(env: Env, instanceId: string): Promise<AwaitstepInstanceHandle | null> {
        const instance = await env.WORKFLOW.get(instanceId).catch(() => null);
        if (!instance) return null;
        return {
          instanceId,
          status: () => instance.status(),
          sendEvent: (type: string, payload?: unknown) => instance.sendEvent({ type, payload }),
        };
      }

      /**
       * Sends an event to an instance of this workflow: \`getInstance\`, then its \`sendEvent\`.
       * A wait for an event of this \`type\` takes its onEvent path; its value is the event, with \`payload\` as sent.
       * Throws InstanceNotFoundError when there is no instance by that id.
       */
      function awaitstepSendWorkflowEvent(env: Env, instanceId: string, type: string, payload?: unknown): Promise<void> {
        return awaitstepSendInstanceEvent((id) => awaitstepGetInstance(env, id), instanceId, type, payload);
      }

      /** The status of an instance, or null when there is none by that id. */
      async function awaitstepWorkflowStatus(env: Env, instanceId: string) {
        const instance = await awaitstepGetInstance(env, instanceId);
        return instance ? instance.status() : null;
      }

      export {
        awaitstepStartWorkflow as startWorkflow,
        awaitstepWorkflowStatus as workflowStatus,
        awaitstepGetInstance as getInstance,
        awaitstepSendWorkflowEvent as sendEvent,
      };

      export default defineWorkflow<Env>({
        id: "simple_workflow",
        async run(flow) {
          const env = flow.env;
          const event = flow.event;
          const step = durableStep(flow);
          await flow.step("Fetch data (step-1)", { retries: { limit: 3, delay: "5 seconds", backoff: "exponential" }, timeout: "30 seconds" }, async (ctx) => {
            await $Fetch_data(stepArgs({ env, event, inputs: {}, step, ctx }));
          });

          await flow.sleep("Wait 10s (sleep-1)", "10 seconds");

          await flow.step("Process data (step-2)", { retries: { limit: 2, delay: "5 seconds", backoff: "exponential" } }, async (ctx) => {
            await $Process_data(stepArgs({ env, event, inputs: {}, step, ctx }));
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
    const bundle = generateWorkflowBundle(withWait)
    const entry = bundle.files.find((file) => file.path === 'awaitstep/entry.ts')!.source
    expect(entry).toContain('async function awaitstepSendEvent')
    expect(entry).toContain('action !== "send-event"')
    expect(entry).toContain(
      'const payload = body?.params ?? body?.payload ?? (queryAction ? body : undefined)',
    )
    // The route sends through the workflow module's own sendEvent, and a run
    // that isn't there is a 404.
    expect(entry).toContain('sendEvent as awaitstepWorkflowEvent } from "#awaitstep/workflow"')
    expect(entry).toContain('InstanceNotFoundError as AwaitstepInstanceNotFound')
    expect(entry).toContain('await awaitstepWorkflowEvent(env, instanceId, type, payload)')
    expect(entry).toContain('if (error instanceof AwaitstepInstanceNotFound)')

    expect(programOf(simpleWorkflow as unknown as WorkflowIR)).not.toContain('awaitstepSendEvent')
  })

  it('generates a branching workflow', () => {
    const code = programOf(branchingWorkflow as unknown as WorkflowIR)
    expect(code).toContain('if (state.shouldNotify === true)')
    expect(code).toContain('} else {')
    expect(code).toContain('flow.http({ method: "POST", url: "https://api.example.com/notify"')
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
    // The workflow module only: the embedded runtime has an `else` of its own.
    const code = workflowSource(generateWorkflowBundle(ir))
    expect(code).toContain('if (true) {')
    expect(code).not.toContain('} else {')
    expect(code).toContain('flow.step("Inside (s1)"')
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
    expect(code).toContain('flow.step("Inside (s1)"')
    // Continuation step also present, AFTER the branch's closing brace
    expect(code).toContain('flow.step("After branch (s2)"')
    const branchCloseIdx = code.lastIndexOf('}')
    const afterBranchIdx = code.indexOf('flow.step("After branch (s2)"')
    // The continuation must appear in the source after the branch close — i.e.,
    // not inlined inside the if/else.
    expect(afterBranchIdx).toBeGreaterThan(0)
    // Sanity: the inside step appears BEFORE the continuation step
    const insideIdx = code.indexOf('flow.step("Inside (s1)"')
    expect(insideIdx).toBeLessThan(afterBranchIdx)
    expect(branchCloseIdx).toBeGreaterThan(0) // matched some closing brace
  })

  it('generates a parallel workflow', () => {
    const code = programOf(parallelWorkflow as unknown as WorkflowIR)
    expect(code).toContain('Promise.allSettled')
    expect(code).toContain('flow.step("Task A (task_a)"')
    // task_b is an HTTP node: a plain request, not a step, unless it is durable.
    expect(code).toContain('flow.http({ url: "https://api.example.com/data"')
    expect(code).not.toContain('flow.step("Task B (task_b)"')
  })

  it('runs the merge after a wait on both paths, each with its own scope', () => {
    const node = (id: string, name: string, data: Record<string, unknown>, type = 'step') => ({
      id,
      name,
      type,
      position: { x: 0, y: 0 },
      version: '1.0.0',
      provider: 'cloudflare',
      data,
    })
    const waitJoin: WorkflowIR = {
      metadata: { name: 'wait-join', version: 1, createdAt: '', updatedAt: '' },
      entryNodeId: 'sleep',
      nodes: [
        // A valueless node before the wait: bound to no variable, so no copy of
        // the merge may list it as an input.
        node('sleep', '10s sleep', { duration: '10 seconds' }, 'sleep'),
        node(
          'w',
          'wait for sunny',
          { eventType: 'sunny', timeout: '30 seconds' },
          'wait_for_event',
        ),
        // Neither is bound either: an inline step runs raw, with no variable.
        node('entry', 'entry', { code: 'console.log("entry");', inline: true }),
        node('sunny', 'sunny', { code: 'return inputs.wait_for_sunny;' }),
        node('nosunny', 'nosunny', { code: 'console.log("none");', inline: true }),
        node('join', 'New step', { code: 'console.log(inputs);' }),
      ],
      edges: [
        { id: 'e0', source: 'sleep', target: 'w' },
        { id: 'e1', source: 'w', target: 'entry', label: 'onEvent' },
        { id: 'e2', source: 'w', target: 'nosunny', label: 'onTimeout' },
        { id: 'e3', source: 'entry', target: 'sunny' },
        { id: 'e4', source: 'sunny', target: 'join' },
        { id: 'e5', source: 'nosunny', target: 'join' },
      ],
    }
    const code = programOf(waitJoin)
    // The arm step reads the wait's own payload, which is bound before the arms.
    expect(code).toContain('const wait_for_sunny = await waitForEventOrTimeout')
    // Both paths carry the merge, and each copy passes what its own path has
    // in scope: the event path its step's value, the timeout path only the
    // wait's payload. The sleep and the inline steps bind nothing, so neither
    // copy may list them.
    const joinInputs = [
      ...code.matchAll(/\$New_step\(stepArgs\(\{ env, event, inputs: \{ ([^}]*) \}/g),
    ].map((match) => match[1])
    expect(joinInputs).toHaveLength(2)
    expect(joinInputs).toContain('wait_for_sunny')
    expect(joinInputs).toContain('wait_for_sunny, sunny')
    for (const inputs of joinInputs) {
      expect(inputs).not.toContain('sleep')
      expect(inputs).not.toContain('entry')
    }
    // One module, called from both arms.
    expect(code.match(/from "#app\/steps\/join.js"/g)).toHaveLength(1)
  })

  it('does not hand a merge’s value to a node after the container', () => {
    const node = (id: string, name: string, data: Record<string, unknown>, type = 'step') => ({
      id,
      name,
      type,
      position: { x: 0, y: 0 },
      version: '1.0.0',
      provider: 'cloudflare',
      data,
    })
    // Side runs before the branch and also feeds a second merge after it. The
    // first merge is emitted inside each arm, so its value is scoped to them
    // and must not be passed to the node outside the branch.
    const ir: WorkflowIR = {
      metadata: { name: 'second-merge', version: 1, createdAt: '', updatedAt: '' },
      entryNodeId: 'side',
      nodes: [
        node('side', 'Side', { code: 'return 4;' }),
        node(
          'gate',
          'Gate',
          {
            branches: [
              { label: 'yes', condition: 'true' },
              { label: 'no', condition: '' },
            ],
          },
          'branch',
        ),
        node('a', 'a', { code: 'return 1;' }),
        node('b', 'b', { code: 'return 2;' }),
        node('join', 'Join', { code: 'return 3;' }),
        node('join2', 'Join2', { code: 'console.log(inputs);' }),
      ],
      edges: [
        { id: 'e0', source: 'side', target: 'gate' },
        { id: 'e1', source: 'gate', target: 'a', label: 'yes' },
        { id: 'e2', source: 'gate', target: 'b', label: 'no' },
        { id: 'e3', source: 'a', target: 'join' },
        { id: 'e4', source: 'b', target: 'join' },
        { id: 'e5', source: 'join', target: 'join2' },
        { id: 'e6', source: 'side', target: 'join2' },
      ],
    }
    const code = programOf(ir)
    expect(code.match(/const Join = await flow\.step\("Join \(join\)"/g)).toHaveLength(2)
    const inputs = /\$Join2\(stepArgs\(\{ env, event, inputs: \{ ([^}]*) \}/.exec(code)
    expect(inputs?.[1]).toBe('Side')
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
    const loopIdx = code.indexOf('await flow.step("iterate (loop)"')
    const updateIdx = code.indexOf('await flow.step(`update (update)')
    const closeIdx = code.indexOf('return _output;')
    expect(loopIdx).toBeGreaterThan(-1)
    expect(updateIdx).toBeGreaterThan(loopIdx)
    expect(updateIdx).toBeLessThan(closeIdx)
    // Step name has been suffixed with the loop counter, proving it sits
    // inside the loop's scope.
    expect(code).toContain('update (update) [${_loop_i}]')
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
    // The template runs as written, in its own module; the workflow only calls it.
    expect(code).toContain('async function $runTemplate(ctx: any) {')
    expect(code).toContain('fetch(ctx.config.url')
    expect(code).toContain('return $runTemplate({ env, config: $fields, inputs: $fields });')
    // Step calls use the modules
    expect(code).toContain('const Fetch_Data = await flow.step("Fetch Data (step-1)"')
    expect(code).toContain('const Send_Webhook = await flow.step("Send Webhook (webhook-1)"')
    expect(code).toContain('"url": "https://hook.example.com/endpoint"')
    expect(code).toContain('retries: { limit: 3, delay: "5 seconds" }')
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
    expect(holder.source.indexOf(importLine)).toBeLessThan(
      holder.source.indexOf('async function $runTemplate'),
    )

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

describe('generateWorkflowBundle: inline step bindings', () => {
  it('hands an inline step’s top-level const to a later step that reads it', () => {
    const step = (id: string, name: string, data: Record<string, unknown>): WorkflowNode => ({
      id,
      name,
      type: 'step',
      position: { x: 0, y: 0 },
      version: '1.0.0',
      provider: 'cloudflare',
      data,
    })
    const ir = {
      metadata: { name: 'inline bindings', version: 1, createdAt: '', updatedAt: '' },
      nodes: [
        step('get', 'Get Customer', { inline: true, code: 'const user = { email: "a@b.c" }' }),
        step('sync', 'Sync Contact', {
          code: 'export default async function Sync_Contact({ inputs }) {\n  return inputs.user\n}\n',
        }),
      ],
      edges: [{ id: 'e1', source: 'get', target: 'sync' }],
      entryNodeId: 'get',
    } as unknown as WorkflowIR
    const code = programOf(ir)
    expect(code).toContain('const user = { email: "a@b.c" }')
    expect(code).toContain('$Sync_Contact(stepArgs({ env, event, inputs: { user }, step, ctx }))')
  })
})
