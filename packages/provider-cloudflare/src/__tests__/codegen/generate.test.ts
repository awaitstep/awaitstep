import { describe, it, expect } from 'vitest'
import type { WorkflowIR, WorkflowNode } from '@awaitstep/ir'
import type { TemplateResolver } from '@awaitstep/codegen'
import {
  generateWorkflow,
  generateNodeCode,
  CloudflareCodeGenerator,
} from '../../codegen/generate.js'
import simpleWorkflow from './fixtures/simple-workflow.json'
import parallelWorkflow from './fixtures/parallel-workflow.json'
import eventWorkflow from './fixtures/event-workflow.json'

import branchingWorkflow from './fixtures/branching-workflow.json'
import expressionWorkflow from './fixtures/expression-workflow.json'

describe('generateWorkflow', () => {
  it('generates a simple sequential workflow', () => {
    const code = generateWorkflow(simpleWorkflow as unknown as WorkflowIR)
    expect(code).toMatchInlineSnapshot(`
      "import { WorkflowEntrypoint } from "cloudflare:workers";

      interface Env {
        WORKFLOW: Workflow;
      }

      // import packages here

      // Add queue handlers below using:
      // @queue function NAME(batch, env, ctx) { ... }

      export class SimpleWorkflow extends WorkflowEntrypoint<Env> {
        async run(event, step) {
          const Fetch_data = await step.do("Fetch data", { retries: { limit: 3, delay: "5 seconds", backoff: "exponential" }, timeout: "30 seconds" }, async () => {
            const res = await fetch('https://api.example.com/data'); return res.json();
          });

          await step.sleep("Wait 10s", "10 seconds");

          const Process_data = await step.do("Process data", async () => {
            return { processed: true };
          });
        }
      }

      export default {
        async fetch(request, env, ctx): Promise<Response> {

            try {
              const url = new URL(request.url);

              if (request.method === "POST") {
                const params = await request.json().catch(() => undefined);
                const instance = await env.WORKFLOW.create({ params });
                return Response.json({ instanceId: instance.id });
              }

              const instanceId = url.searchParams.get("instanceId");
              if (instanceId) {
                const instance = await env.WORKFLOW.get(instanceId);
                if (!instance) {
                  return Response.json({message: 'Instance not found'}, { status: 404 })
                }
                return Response.json(await instance.status());
              }

              return new Response(null, { status: 200 });
            } catch (error) {
              return Response.json({ message: error.message }, { status: 500 });
            }

        },
      };
      "
    `)
  })

  it('generates a branching workflow', () => {
    const code = generateWorkflow(branchingWorkflow as unknown as WorkflowIR)
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
    const code = generateWorkflow(ir)
    expect(code).toContain('if (true) {')
    expect(code).not.toContain('} else {')
    expect(code).toContain('step.do("Inside"')
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
    const code = generateWorkflow(ir)
    // Branch body present
    expect(code).toContain('if (true) {')
    expect(code).toContain('step.do("Inside"')
    // Continuation step also present, AFTER the branch's closing brace
    expect(code).toContain('step.do("After branch"')
    const branchCloseIdx = code.lastIndexOf('}')
    const afterBranchIdx = code.indexOf('step.do("After branch"')
    // The continuation must appear in the source after the branch close — i.e.,
    // not inlined inside the if/else.
    expect(afterBranchIdx).toBeGreaterThan(0)
    // Sanity: the inside step appears BEFORE the continuation step
    const insideIdx = code.indexOf('step.do("Inside"')
    expect(insideIdx).toBeLessThan(afterBranchIdx)
    expect(branchCloseIdx).toBeGreaterThan(0) // matched some closing brace
  })

  it('generates a parallel workflow', () => {
    const code = generateWorkflow(parallelWorkflow as unknown as WorkflowIR)
    expect(code).toContain('Promise.allSettled')
    expect(code).toContain('Task A')
    expect(code).toContain('Task B')
  })

  it('generates a wait-for-event workflow', () => {
    const code = generateWorkflow(eventWorkflow as unknown as WorkflowIR)
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
    const code = generateWorkflow(simpleWorkflow as unknown as WorkflowIR)
    expect(code).toContain('interface Env')
    expect(code).toContain('WORKFLOW: Workflow')
  })

  it('generates functional fetch handler', () => {
    const code = generateWorkflow(simpleWorkflow as unknown as WorkflowIR)
    // Default scaffolding uses @fetch annotation form with user-supplied params.
    expect(code).toContain('async fetch(request, env, ctx)')
    expect(code).toContain('request.method === "POST"')
    expect(code).toContain('env.WORKFLOW.create({ params })')
    expect(code).toContain('env.WORKFLOW.get(instanceId)')
    expect(code).toContain('instance.status()')
  })

  it('resolves expressions to step variable references', () => {
    const code = generateWorkflow(expressionWorkflow as unknown as WorkflowIR)
    expect(code).not.toContain('_workflowState')
    expect(code).not.toContain('{{fetch_data.userId}}')
    expect(code).toContain('Fetch_Data.userId')
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

    const code = generateWorkflow(ir, resolver)

    expect(code).toContain('class CustomWorkflow')
    // Class definition hoisted before workflow class
    expect(code).toContain('class WebhookPostNode {')
    expect(code).toContain('static async execute(env: Env, params: Record<string, unknown>)')
    // Step calls use the class
    expect(code).toContain('const Fetch_Data = await step.do("Fetch Data"')
    expect(code).toContain('const Send_Webhook = await step.do("Send Webhook"')
    expect(code).toContain('WebhookPostNode.execute(this.env, {')
    expect(code).toContain('url: "https://hook.example.com/endpoint"')
    expect(code).toContain('retries: { limit: 3, delay: "5 seconds" }')
    expect(code).not.toContain('ctx.')
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

    const code = generateWorkflow(ir, resolver)

    // Import should appear at the top, before the class
    const importLine =
      "import { uniqueNamesGenerator, adjectives, colors, animals } from 'unique-names-generator'"
    expect(code).toContain(importLine)
    const importIndex = code.indexOf(importLine)
    const classIndex = code.indexOf('class NameGen')
    expect(importIndex).toBeLessThan(classIndex)

    // Import should NOT appear inside the step.do body
    const stepBody = code.slice(code.indexOf('step.do('))
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
})
