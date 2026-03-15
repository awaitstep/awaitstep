import { describe, it, expect } from 'vitest'
import type { WorkflowIR } from '@awaitstep/ir'
import { generateWorkflow } from '../generate.js'
import simpleWorkflow from './fixtures/simple-workflow.json'
import parallelWorkflow from './fixtures/parallel-workflow.json'
import eventWorkflow from './fixtures/event-workflow.json'

import branchingWorkflow from './fixtures/branching-workflow.json'

describe('generateWorkflow', () => {
  it('generates a simple sequential workflow', () => {
    const code = generateWorkflow(simpleWorkflow as unknown as WorkflowIR)
    expect(code).toMatchInlineSnapshot(`
      "import { WorkflowEntrypoint } from "cloudflare:workers";

      export class SimpleWorkflow extends WorkflowEntrypoint {
        async run(event, step) {
          const step_1 = await step.do("Fetch data", { retries: { limit: 3, delay: "5 seconds", backoff: "exponential" }, timeout: "30 seconds" }, async () => {
            const res = await fetch('https://api.example.com/data'); return res.json();
          });

          await step.sleep("Wait 10s", "10 seconds");

          const step_2 = await step.do("Process data", async () => {
            return { processed: true };
          });
        }
      }
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

  it('extends WorkflowEntrypoint', () => {
    const code = generateWorkflow(simpleWorkflow as unknown as WorkflowIR)
    expect(code).toContain('extends WorkflowEntrypoint')
  })
})
