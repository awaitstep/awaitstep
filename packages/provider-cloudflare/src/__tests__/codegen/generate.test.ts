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
        async fetch(request: Request, env: Env): Promise<Response> {
          const url = new URL(request.url);

          if (request.method === "POST") {
            const params = await request.json().catch(() => undefined);
            const instance = await env.WORKFLOW.create({ params });
            return Response.json({ instanceId: instance.id });
          }

          const instanceId = url.searchParams.get("instanceId");
          if (instanceId) {
            const instance = await env.WORKFLOW.get(instanceId);
            return Response.json(await instance.status());
          }

          return new Response(null, { status: 200 });
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

  it('generates a parallel workflow', () => {
    const code = generateWorkflow(parallelWorkflow as unknown as WorkflowIR)
    expect(code).toContain('Promise.all')
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
    expect(code).toContain('async fetch(request: Request, env: Env): Promise<Response>')
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
