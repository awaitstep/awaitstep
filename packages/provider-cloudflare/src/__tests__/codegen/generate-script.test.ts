import { describe, it, expect } from 'vitest'
import type { ScriptIR } from '@awaitstep/ir'
import { generateScript } from '../../codegen/generate.js'

function makeScript(nodes: ScriptIR['nodes'], entryNodeId?: string): ScriptIR {
  return {
    kind: 'script',
    metadata: {
      name: 'transform-script',
      version: 1,
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
    },
    nodes,
    edges: [],
    entryNodeId: entryNodeId ?? nodes[0]!.id,
    trigger: { type: 'http' },
  }
}

function stepNode(id: string, code: string, name = id): ScriptIR['nodes'][0] {
  return {
    id,
    type: 'step',
    name,
    position: { x: 0, y: 0 },
    version: '1.0.0',
    provider: 'cloudflare',
    data: { code },
  }
}

describe('generateScript', () => {
  it('emits a fetch-only worker with no WorkflowEntrypoint', () => {
    const code = generateScript(
      makeScript([stepNode('transform', 'return { hello: event.payload?.name ?? "world" };')]),
    )
    expect(code).not.toContain('WorkflowEntrypoint')
    expect(code).not.toContain('cloudflare:workers')
    expect(code).toContain('export default {')
    expect(code).toContain('async fetch(request: Request, env: Env)')
  })

  it('exposes event.payload from the request body', () => {
    const code = generateScript(
      makeScript([stepNode('transform', 'return { name: event.payload.name };')]),
    )
    expect(code).toContain('const params = await request.json()')
    expect(code).toContain('const event = { payload: params }')
  })

  it('emits IIFE wrappers, not step.do', () => {
    const code = generateScript(makeScript([stepNode('transform', 'return event.payload;')]))
    expect(code).not.toContain('step.do')
    expect(code).toContain('await (async () => {')
  })

  it("returns the last node's value as the response", () => {
    const code = generateScript(makeScript([stepNode('transform', 'return { ok: true };')]))
    expect(code).toContain('return Response.json(transform);')
  })

  it('returns null when no node assigns a value', () => {
    const code = generateScript(makeScript([stepNode('side-effect', 'console.log("hi");')]))
    expect(code).toContain('return Response.json(null);')
  })

  it('keeps env references plain (not this.env)', () => {
    const code = generateScript(
      makeScript([stepNode('use-env', 'return env.SECRET_KEY ?? "missing";')]),
    )
    expect(code).toContain('env.SECRET_KEY')
    expect(code).not.toContain('this.env.')
  })

  it('emits an Env interface with declared env var names', () => {
    const code = generateScript(makeScript([stepNode('use-env', 'return env.STRIPE_KEY;')]), {
      envVarNames: ['STRIPE_KEY'],
    })
    expect(code).toMatch(/interface Env \{[\s\S]*STRIPE_KEY: string;[\s\S]*\}/)
  })

  it('omits the WORKFLOW self-binding', () => {
    const code = generateScript(makeScript([stepNode('t', 'return 1;')]))
    expect(code).not.toContain('WORKFLOW: Workflow')
  })

  it('emits a sub_workflow forward as a fire-and-forget binding call', () => {
    const ir = makeScript([
      stepNode('transform', 'return { customerId: event.payload.id };'),
      {
        id: 'forward',
        type: 'sub_workflow',
        name: 'Run Onboarding',
        position: { x: 0, y: 0 },
        version: '1.0.0',
        provider: 'cloudflare',
        data: {
          workflowId: 'awaitstep-onboarding',
          workflowName: 'OnboardingWorkflow',
          input: 'transform',
          waitForCompletion: true,
        },
      },
    ])
    ir.edges = [{ id: 'e1', source: 'transform', target: 'forward' }]
    const code = generateScript(ir)
    expect(code).toContain('await env.ONBOARDING_WORKFLOW.create(')
    expect(code).not.toContain('Await OnboardingWorkflow') // no polling
    expect(code).not.toContain('step.do')
    expect(code).toMatch(/interface Env \{[\s\S]*ONBOARDING_WORKFLOW: Workflow;[\s\S]*\}/)
  })

  it('wraps the body in try/catch with error response', () => {
    const code = generateScript(makeScript([stepNode('t', 'return 1;')]))
    expect(code).toContain('try {')
    expect(code).toContain('} catch (error) {')
    expect(code).toContain('Response.json({ message: error.message }, { status: 500 })')
  })

  it('returns 200 OK for non-POST requests', () => {
    const code = generateScript(makeScript([stepNode('t', 'return 1;')]))
    expect(code).toContain('if (request.method !== "POST")')
  })

  it('integrates a custom node template (hoists class, IIFE call, env param)', () => {
    const template = `export default async function(ctx) {
  return { url: ctx.config.url, key: ctx.env.API_KEY };
}`
    const ir = makeScript([
      {
        id: 'fetch-thing',
        type: 'fetch_thing',
        name: 'Fetch Thing',
        position: { x: 0, y: 0 },
        version: '1.0.0',
        provider: 'cloudflare',
        data: { url: 'https://example.com' },
      },
    ])

    const code = generateScript(ir, {
      templateResolver: { getTemplate: () => template },
    })

    // Class is hoisted to module top-level and unchanged from workflow mode.
    expect(code).toContain('class FetchThingNode {')
    expect(code).toContain('static async execute(env: Env, params: Record<string, unknown>)')

    // Call site uses script-mode shape.
    expect(code).not.toContain('step.do')
    expect(code).toContain('FetchThingNode.execute(env, {')
    expect(code).not.toContain('FetchThingNode.execute(this.env')

    // env.API_KEY usage in the class body is auto-detected for the Env interface.
    expect(code).toMatch(/interface Env \{[\s\S]*API_KEY: string;[\s\S]*\}/)
  })
})
