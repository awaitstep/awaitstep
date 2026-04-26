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

  it('isolates node code in a runGraph function', () => {
    const code = generateScript(
      makeScript([stepNode('transform', 'return { name: event.payload.name };')]),
    )
    expect(code).toContain('async function runGraph(env: Env, event:')
    expect(code).toContain('const graph = await runGraph(env, event)')
  })

  it('only EXPORT_-prefixed nodes appear on graph; others run as bare statements', () => {
    const ir = makeScript([
      stepNode('transform', 'return { ok: true };', 'transform'),
      stepNode('side-effect', 'console.log("hi");'),
    ])
    ir.edges = [{ id: 'e1', source: 'transform', target: 'side-effect' }]
    const code = generateScript(ir)
    // `transform` is not exported and not referenced → bare statement (no const).
    expect(code).not.toContain('const transform =')
    expect(code).not.toMatch(/let transform[,;]/)
    expect(code).not.toMatch(/return \{[^}]*transform[^}]*\}/)
    // side-effect has no return value at all → no var emitted.
    expect(code).not.toContain('const side_effect')
    // Empty graph object since nothing is exported.
    expect(code).toContain('return {};')
  })

  it('exports a node when its name starts with EXPORT_, stripping the prefix in the var/key', () => {
    const ir = makeScript([stepNode('node-id', 'const Result = { ok: true };', 'EXPORT_Result')])
    const code = generateScript(ir)
    // The prefix is stripped — var/key is `Result`. The user's code is
    // inlined raw; the codegen detects the const decl and includes it in
    // the return.
    expect(code).toContain('const Result = { ok: true };')
    expect(code).not.toContain('EXPORT_Result')
    expect(code).toMatch(/return \{\s*Result\s*\}/)
  })

  it('hoists an exported node nested inside a container with `let` so it escapes the block', () => {
    const ir = makeScript([
      {
        id: 'gate',
        type: 'branch',
        name: 'Gate',
        position: { x: 0, y: 0 },
        version: '1.0.0',
        provider: 'cloudflare',
        data: { branches: [{ label: 'yes', condition: 'true' }] },
      },
      stepNode('inner-id', 'const Inner = { ok: true };', 'EXPORT_Inner'),
    ])
    ir.edges = [{ id: 'e1', source: 'gate', target: 'inner-id', label: 'yes' }]
    const code = generateScript(ir)
    // Exported + nested → `let Inner;` at top, assignment inside the block.
    expect(code).toMatch(/let Inner[;,]/)
    expect(code).toContain('Inner = { ok: true };')
    expect(code).not.toContain('const Inner = { ok: true };')
    expect(code).toMatch(/return \{\s*Inner\s*\}/)
  })

  it('keeps the const for a non-exported node when downstream nodes reference its var', () => {
    const ir = makeScript([
      stepNode('producer', 'const producer = event.payload;', 'producer'),
      stepNode('consumer', 'console.log(producer);', 'consumer'),
    ])
    ir.edges = [{ id: 'e1', source: 'producer', target: 'consumer' }]
    const code = generateScript(ir)
    // `producer` is referenced by `consumer` → const survives in the body.
    expect(code).toContain('const producer = event.payload;')
    expect(code).toContain('console.log(producer);')
    // Not exported → not in the return.
    expect(code).not.toMatch(/return \{[^}]*producer[^}]*\}/)
    expect(code).toContain('return {};')
  })

  it('exposes event.payload from the request body via the default fetch handler', () => {
    const code = generateScript(
      makeScript([stepNode('transform', 'return { name: event.payload.name };')]),
    )
    expect(code).toContain('const params = await request.json()')
    expect(code).toContain('const event = { payload: params }')
  })

  it('inlines step code raw (no step.do, no IIFE) so a top-level `return` exits runGraph', () => {
    const code = generateScript(makeScript([stepNode('transform', 'return event.payload;')]))
    expect(code).not.toContain('step.do')
    expect(code).not.toContain('await (async () => {')
    // The user's `return` is inlined inside runGraph — early exit with the value.
    expect(code).toContain(
      'async function runGraph(env: Env, event: { payload: unknown }) {\n  return event.payload;\n',
    )
  })

  it('default fetch handler returns the whole graph object', () => {
    const code = generateScript(makeScript([stepNode('transform', 'return { ok: true };')]))
    expect(code).toContain('return Response.json(graph);')
  })

  it('user-provided triggerCode replaces the default fetch handler body', () => {
    const code = generateScript(makeScript([stepNode('transform', 'return { ok: true };')]), {
      triggerCode:
        'const graph = await runGraph(env, { payload: {} });\nreturn Response.json(graph.transform);',
    })
    expect(code).not.toContain('return Response.json(graph);')
    expect(code).toContain('return Response.json(graph.transform);')
    // runGraph still emitted alongside
    expect(code).toContain('async function runGraph(env: Env, event:')
  })

  it('hoists imports from triggerCode to the module scope', () => {
    const code = generateScript(makeScript([stepNode('transform', 'return 1;')]), {
      triggerCode: `import { z } from "zod";\nconst graph = await runGraph(env, { payload: {} });\nreturn Response.json(graph);`,
    })
    expect(
      code.startsWith('import { z } from "zod";') || code.includes('import { z } from "zod"'),
    ).toBe(true)
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

  it('a non-exported, unreferenced sub_workflow becomes a clean bare `await`', () => {
    const ir = makeScript([
      {
        id: 'send-auth-email',
        type: 'sub_workflow',
        name: 'send-auth-email',
        position: { x: 0, y: 0 },
        version: '1.0.0',
        provider: 'cloudflare',
        data: {
          workflowId: 'awaitstep-send-mail',
          workflowName: 'SendMail',
          waitForCompletion: false,
        },
      },
    ])
    const code = generateScript(ir)
    // The const-strip rewrite must not leave a bare object literal at
    // statement position. Result: a single `await env.SEND_MAIL.create(...)`.
    expect(code).toContain('await env.SEND_MAIL.create({')
    expect(code).not.toMatch(/^\s*\{ instanceId:/m)
    expect(code).not.toContain('const send_auth_email')
    expect(code).toContain('return {};')
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
    expect(code).toContain('env.ONBOARDING_WORKFLOW.create(')
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

  it('emits a forEach loop without IIFE or _loop_i when body has no step.METHOD', () => {
    const ir = makeScript([
      {
        id: 'send',
        type: 'loop',
        name: 'Send mail to recipients',
        position: { x: 0, y: 0 },
        version: '1.0.0',
        provider: 'cloudflare',
        data: {
          loopType: 'forEach',
          collection: 'event.payload.recipients',
          itemVar: 'email',
        },
      },
      stepNode('inner', 'await env.SEND_MAIL.create({ id: crypto.randomUUID(), email });'),
    ])
    ir.edges = [{ id: 'e1', source: 'send', target: 'inner', label: 'body' }]
    const code = generateScript(ir)

    // No IIFE wrap — the body doesn't capture _output, so no need.
    expect(code).not.toContain('await (async () => {')
    // No dead step-name counter in script mode — script bodies have no step.do.
    expect(code).not.toContain('let _loop_i = 0')
    expect(code).not.toContain('_loop_i++')
    // Bare for-of with the user's iteration variable.
    expect(code).toContain('for (const email of event.payload.recipients) {')
  })

  it('keeps the IIFE for a script-mode loop that captures _output', () => {
    const ir = makeScript([
      {
        id: 'find',
        type: 'loop',
        name: 'EXPORT_FirstMatch',
        position: { x: 0, y: 0 },
        version: '1.0.0',
        provider: 'cloudflare',
        data: { loopType: 'forEach', collection: 'event.payload.items', itemVar: 'item' },
      },
      stepNode('check', 'if (item.match) _output = item;'),
    ])
    ir.edges = [{ id: 'e1', source: 'find', target: 'check', label: 'body' }]
    const code = generateScript(ir)

    // Body assigns to _output, so we keep the IIFE to capture it as a const.
    // Uses EXPORT_ prefix so post-processing retains the const declaration.
    expect(code).toMatch(
      /const FirstMatch = await \(async \(\) => \{[\s\S]*let _output;[\s\S]*return _output;\s*\}\)\(\);/,
    )
  })

  it('script-mode times loop keeps the _loop_i iterator (it IS the loop counter)', () => {
    const ir = makeScript([
      {
        id: 'tries',
        type: 'loop',
        name: 'Tries',
        position: { x: 0, y: 0 },
        version: '1.0.0',
        provider: 'cloudflare',
        data: { loopType: 'times', count: 3 },
      },
      stepNode('work', 'console.log(_loop_i);'),
    ])
    ir.edges = [{ id: 'e1', source: 'tries', target: 'work', label: 'body' }]
    const code = generateScript(ir)

    expect(code).toContain('for (let _loop_i = 0; _loop_i < 3; _loop_i++)')
    // No outer IIFE since body doesn't capture _output.
    expect(code).not.toContain('await (async () => {')
  })

  it('flattens http_request in script mode (no IIFE) — simple GET case', () => {
    // EXPORT_-prefix the node so EXPORT_ post-processing keeps the `const X = ...`
    // assignment instead of stripping it as unused.
    const ir = makeScript([
      {
        id: 'fetch_user',
        type: 'http_request',
        name: 'EXPORT_FetchUser',
        position: { x: 0, y: 0 },
        version: '1.0.0',
        provider: 'cloudflare',
        data: { method: 'GET', url: 'https://api.example.com/users/1' },
      },
    ])
    const code = generateScript(ir)
    expect(code).not.toContain('await (async () => {')
    expect(code).toMatch(
      /const FetchUser = await fetch\("https:\/\/api\.example\.com\/users\/1"\)\.then\(r => r\.json\(\)\);/,
    )
  })

  it('flattens http_request with queryParams using namespaced url builder', () => {
    const ir = makeScript([
      {
        id: 'search',
        type: 'http_request',
        name: 'EXPORT_Search',
        position: { x: 0, y: 0 },
        version: '1.0.0',
        provider: 'cloudflare',
        data: {
          method: 'GET',
          url: 'https://api.example.com/search',
          queryParams: { q: 'hello', limit: '10' },
        },
      },
    ])
    const code = generateScript(ir)
    expect(code).not.toContain('await (async () => {')
    // Intermediate var is namespaced by node varName so siblings don't collide.
    expect(code).toContain('const _Search_url = new URL("https://api.example.com/search")')
    expect(code).toContain('_Search_url.searchParams.set("q", "hello")')
    // Final assignment keeps `const ${varName}` so EXPORT_ post-processing finds it.
    expect(code).toMatch(/const Search = await fetch\(_Search_url\)\.then\(r => r\.json\(\)\);/)
  })

  it('emits parallel/race in script mode without an outer IIFE wrap', () => {
    const ir = makeScript([
      {
        id: 'fan',
        type: 'parallel',
        name: 'EXPORT_Fan',
        position: { x: 0, y: 0 },
        version: '1.0.0',
        provider: 'cloudflare',
        data: {},
      },
      stepNode('a', 'return 1;'),
      stepNode('b', 'return 2;'),
    ])
    ir.edges = [
      { id: 'e1', source: 'fan', target: 'a' },
      { id: 'e2', source: 'fan', target: 'b' },
    ]
    const code = generateScript(ir)

    // No `step.do`, no outer IIFE — Promise.allSettled is awaited directly.
    expect(code).not.toContain('step.do')
    expect(code).not.toMatch(/await \(async \(\) => \{\s*return await Promise\./)
    // The Promise.allSettled call is the bare expression assigned to the var.
    expect(code).toMatch(/const Fan = await Promise\.allSettled\(\[/)
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
    // Custom nodes are already isolated inside `static execute`, so script
    // mode calls them directly — no IIFE wrap.
    expect(code).not.toMatch(/await \(async \(\) => \{\s*return FetchThingNode/)
    // Not exported (name = "Fetch Thing") and not referenced → bare `await ...`.
    expect(code).toMatch(/^\s*await FetchThingNode\.execute\(env, \{/m)

    // env.API_KEY usage in the class body is auto-detected for the Env interface.
    expect(code).toMatch(/interface Env \{[\s\S]*API_KEY: string;[\s\S]*\}/)
  })
})
