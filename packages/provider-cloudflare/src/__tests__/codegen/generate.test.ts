import { describe, it, expect } from 'vitest'
import type { WorkflowIR } from '@awaitstep/ir'
import { generateWorkflow, CloudflareCodeGenerator } from '../../codegen/generate.js'
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
            const instance = await env.WORKFLOW.create();
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
    expect(code).toContain('env.WORKFLOW.create()')
    expect(code).toContain('env.WORKFLOW.get(instanceId)')
    expect(code).toContain('instance.status()')
  })

  it('generates state tracking when expressions are used', () => {
    const code = generateWorkflow(expressionWorkflow as unknown as WorkflowIR)
    expect(code).toContain('_workflowState')
    expect(code).toContain(`_workflowState['fetch-data']`)
    expect(code).not.toContain('{{fetch-data.userId}}')
  })

  it('does not generate state tracking without expressions', () => {
    const code = generateWorkflow(simpleWorkflow as unknown as WorkflowIR)
    expect(code).not.toContain('_workflowState')
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
