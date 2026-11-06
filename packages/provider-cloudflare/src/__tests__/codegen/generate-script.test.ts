import { describe, it, expect } from 'vitest'
import type { ScriptIR } from '@awaitstep/ir'
import { generateScript, generateScriptBundle } from '../../codegen/generate.js'

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
    // Default scaffolding uses the @fetch annotation form with user-supplied
    // params (request, env, ctx). Legacy typed signature applies when a user
    // overrides triggerCode without annotations.
    expect(code).toContain('async fetch(request, env, ctx)')
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
    // `transform` is not exported and not referenced → its step runs as a
    // bare statement (no const): the value is dropped.
    expect(code).not.toContain('const transform =')
    expect(code).not.toMatch(/let transform[,;]/)
    expect(code).toMatch(/^\s*await flow\.step\("transform", \(ctx\) => \$transform\(/m)
    expect(code).not.toMatch(/return \{[^}]*transform[^}]*\}/)
    // side-effect returns nothing → no var either.
    expect(code).not.toContain('const side_effect')
    expect(code).toMatch(/^\s*await flow\.step\("side-effect", \(ctx\) => \$side_effect\(/m)
    // Empty graph object since nothing is exported.
    expect(code).toContain('return {};')
  })

  it('exports a node when its name starts with EXPORT_, stripping the prefix in the var/key', () => {
    const ir = makeScript([stepNode('node-id', 'return { ok: true };', 'EXPORT_Result')])
    const code = generateScript(ir)
    // The prefix is stripped — var/key is `Result`. The step's return is its
    // value, captured at the call and included in the return.
    // The step label is the node id, as in a workflow; the var is the name.
    expect(code).toMatch(/const Result = await flow\.step\("node-id", \(ctx\) =>\s+\$Result\(/)
    expect(code).not.toContain('const EXPORT_Result')
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
      stepNode('inner-id', 'return { ok: true };', 'EXPORT_Inner'),
    ])
    ir.edges = [{ id: 'e1', source: 'gate', target: 'inner-id', label: 'yes' }]
    const code = generateScript(ir)
    // Exported + nested → `let Inner;` at top, assignment inside the block.
    // A container child is a step too, inlined in the non-module form.
    expect(code).toMatch(/let Inner[;,]/)
    expect(code).toMatch(/^\s+Inner = await flow\.step\("inner-id"/m)
    expect(code).not.toContain('const Inner = ')
    expect(code).toMatch(/return \{\s*Inner\s*\}/)
  })

  it('keeps the const for a non-exported node when downstream nodes reference its var', () => {
    const ir = makeScript([
      stepNode('producer', 'return event.payload;', 'producer'),
      stepNode('consumer', 'console.log(producer);', 'consumer'),
    ])
    ir.edges = [{ id: 'e1', source: 'producer', target: 'consumer' }]
    const bundle = generateScriptBundle(ir)
    const code = bundle.files.find((f) => f.path === 'worker.ts')!.source
    // `consumer` names `producer`, so the consumer module receives it as an
    // input and the producer's const survives in the body.
    expect(code).toMatch(/const producer = await flow\.step\("producer"/)
    expect(code).toMatch(/\$consumer\(\{ env, event, inputs: \{ producer \}, step, ctx \}\)/)
    expect(bundle.files.find((f) => f.path === 'nodes/consumer.ts')!.source).toContain(
      'const { producer } = inputs;',
    )
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

  it('runs a step through the in-request host: its return is the step’s value, and runGraph goes on', () => {
    // The canvas's default graph: a step whose body returns, then a
    // try/catch whose arms exit. The step's return used to end runGraph
    // (pasted raw); now it is the step's value and the try/catch runs.
    const exit = (id: string) => ({
      id,
      type: 'break',
      name: id,
      position: { x: 0, y: 0 },
      version: '1.0.0',
      provider: 'cloudflare',
      data: {},
    })
    const ir = makeScript([
      stepNode(
        'new-step',
        '// Write your business logic here\n\nreturn { result: "ok" };',
        'New step',
      ),
      {
        id: 'guard',
        type: 'try_catch',
        name: 'New try_catch',
        position: { x: 0, y: 0 },
        version: '1.0.0',
        provider: 'cloudflare',
        data: {},
      },
      exit('old-exit'),
      exit('new-exit'),
    ])
    ir.edges = [
      { id: 'e1', source: 'new-step', target: 'guard' },
      { id: 'e2', source: 'guard', target: 'new-exit', label: 'try' },
      { id: 'e3', source: 'guard', target: 'old-exit', label: 'catch' },
    ]
    const bundle = generateScriptBundle(ir)
    const worker = bundle.files.find((f) => f.path === 'worker.ts')!.source
    expect(worker).toContain(
      'import { createInlineHost, createWorkflowContext, durableStep } from "#awaitstep/runtime";',
    )
    expect(worker).toContain('import $New_step from "./nodes/New_step.js";')
    // The context's event is a run's: the request payload plus a timestamp
    // and an instance id, which `WorkflowEvent` requires (review round 1:
    // `{ payload }` alone did not type-check in the Code view).
    expect(worker).toContain(
      [
        '  const flow = createWorkflowContext({',
        '    env,',
        '    event: {',
        '      payload: event.payload,',
        '      timestamp: new Date(),',
        '      instanceId: globalThis.crypto.randomUUID(),',
        '    },',
        '    host: createInlineHost(),',
        '  });',
      ].join('\n'),
    )
    expect(worker).toContain('const step = durableStep(flow);')
    // Not exported and not referenced, so the value is dropped at the call;
    // the step still runs, and runGraph carries on into the try/catch.
    expect(worker).toMatch(
      /await flow\.step\("new-step", \(ctx\) => \$New_step\(\{ env, event, inputs: \{\}, step, ctx \}\)\);\n\s+try \{\n\s+return;\n\s+\} catch \(err\) \{\n\s+return;\n\s+\}\n\s+return \{\};/,
    )
    // The body lives in its module, where its return is the step's value.
    const module = bundle.files.find((f) => f.path === 'nodes/New_step.ts')!
    expect(module.role).toBe('module')
    expect(module.source).toContain('return { result: "ok" };')
    expect(bundle.files.map((f) => f.path)).toContain('awaitstep/runtime.ts')
    expect(bundle.manifest?.steps).toEqual([
      {
        nodeId: 'new-step',
        stepName: 'new-step',
        kind: 'do',
        varName: 'New_step',
        filePath: 'nodes/New_step.ts',
      },
      { nodeId: 'guard', varName: 'New_try_catch' },
    ])
  })

  it('passes a step only the upstream vars that are bound at the call: a word match on an unbound name is pruned', () => {
    // `result` is a side-effect step (no return, so no const), and the next
    // body mentions the word in an object literal — the canvas's default.
    const ir = makeScript([
      stepNode('result', 'console.log("side effect");', 'result'),
      stepNode('next', 'return { result: "ok" };', 'next'),
    ])
    ir.edges = [{ id: 'e1', source: 'result', target: 'next' }]
    const code = generateScript(ir)
    expect(code).toMatch(/\$next\(\{ env, event, inputs: \{\}, step, ctx \}\)/)
    expect(code).not.toContain('inputs: { result }')
  })

  it('does not hand a body an input it declares itself', () => {
    const ir = makeScript([
      stepNode('data', 'return 1;', 'data'),
      stepNode('again', 'const data = 2; return data;', 'again'),
    ])
    ir.edges = [{ id: 'e1', source: 'data', target: 'again' }]
    const bundle = generateScriptBundle(ir)
    const module = bundle.files.find((f) => f.path === 'nodes/again.ts')!.source
    expect(module).not.toContain('const { data } = inputs;')
    expect(module).toContain('const data = 2;')
  })

  it('keeps a node called step or env clear of the names the body binds', () => {
    const ir = makeScript([stepNode('s1', 'return 1;', 'step'), stepNode('s2', 'return 2;', 'env')])
    ir.edges = [{ id: 'e1', source: 's1', target: 's2' }]
    const code = generateScript(ir)
    expect(code).toContain('const step = durableStep(flow);')
    expect(code).not.toMatch(/const step = await flow\.step/)
    expect(code).not.toMatch(/const env = await flow\.step/)
    expect(code).toContain('import $step_node from "./nodes/step_node.js";')
    expect(code).toContain('import $env_node from "./nodes/env_node.js";')
  })

  it('does not take a comment or an inline body’s own identifier for a use of the host', () => {
    const inline = stepNode(
      'raw',
      '// next step.\nconst steps = [1]; for (const step of steps) step.toFixed();',
    )
    inline.data.inline = true
    const code = generateScript(makeScript([inline]))
    expect(code).not.toContain('createInlineHost')
    expect(code).not.toContain('#awaitstep/runtime')
  })

  it('runs a step inside a try/catch as an inlined step, with the host in scope', () => {
    const guard = {
      id: 'guard',
      type: 'try_catch',
      name: 'Guard',
      position: { x: 0, y: 0 },
      version: '1.0.0',
      provider: 'cloudflare',
      data: {},
    }
    const ir = makeScript([
      guard,
      stepNode('risky', 'return await fetch("https://x").then((r) => r.json());', 'EXPORT_Risky'),
      stepNode('fallback', 'return { ok: false };', 'fallback'),
    ])
    ir.edges = [
      { id: 'e1', source: 'guard', target: 'risky', label: 'try' },
      { id: 'e2', source: 'guard', target: 'fallback', label: 'catch' },
    ]
    const bundle = generateScriptBundle(ir)
    const worker = bundle.files.find((f) => f.path === 'worker.ts')!.source
    expect(worker).toContain('createInlineHost()')
    expect(worker).toMatch(/try \{\n\s+Risky = await flow\.step\("risky", async \(ctx\) => \{/)
    expect(worker).toMatch(
      /\} catch \(err\) \{\n\s+await flow\.step\("fallback", async \(ctx\) => \{/,
    )
    expect(worker).toMatch(/let Risky;/)
    expect(worker).toMatch(/return \{\s*Risky\s*\}/)
    // Children stay inline: no module, no manifest file path.
    expect(bundle.files.map((f) => f.path)).not.toContain('nodes/Risky.ts')
    expect(bundle.manifest?.steps).toEqual([{ nodeId: 'guard', varName: 'Guard' }])
  })

  it('leaves an `inputs: { … }` in a person’s own code alone: only the generated call is pruned', () => {
    // Security review round 1: the first pruning pass rewrote any object
    // literal keyed `inputs`, emptying a request body in an inline step.
    const inline = stepNode(
      'post',
      'const { userId } = event.payload;\nawait fetch("https://x", { body: JSON.stringify({ inputs: { userId } }) });',
    )
    inline.data.inline = true
    const code = generateScript(makeScript([inline]))
    expect(code).toContain('JSON.stringify({ inputs: { userId } })')
  })

  it('passes an exported value hoisted out of a container to a later step', () => {
    // The hoisted `let` is the binding; pruning must count it.
    const gate = {
      id: 'gate',
      type: 'branch',
      name: 'Gate',
      position: { x: 0, y: 0 },
      version: '1.0.0',
      provider: 'cloudflare',
      data: { branches: [{ label: 'yes', condition: 'true' }] },
    }
    // `after` joins both arms, so it is a top-level step downstream of the
    // child whose value it reads.
    const twoArms = {
      ...gate,
      data: {
        branches: [
          { label: 'yes', condition: 'true' },
          { label: 'no', condition: '' },
        ],
      },
    }
    const ir = makeScript([
      stepNode('first', 'return 1;', 'first'),
      twoArms,
      stepNode('blocked-id', 'return true;', 'EXPORT_blocked'),
      stepNode('other', 'return false;', 'other'),
      stepNode('after', 'if (blocked) throw new Error("no"); return "ok";', 'after'),
    ])
    ir.edges = [
      { id: 'e0', source: 'first', target: 'gate' },
      { id: 'e1', source: 'gate', target: 'blocked-id', label: 'yes' },
      { id: 'e2', source: 'gate', target: 'other', label: 'no' },
      { id: 'e3', source: 'blocked-id', target: 'after' },
      { id: 'e4', source: 'other', target: 'after' },
    ]
    const code = generateScript(ir)
    expect(code).toMatch(/let blocked;/)
    expect(code).toContain('$after({ env, event, inputs: { blocked }, step, ctx })')
  })

  it('keeps a node called crypto clear of the header’s own globals', () => {
    const code = generateScript(makeScript([stepNode('c', 'return 1;', 'crypto')]))
    expect(code).toContain('globalThis.crypto.randomUUID()')
    expect(code).not.toMatch(/const crypto = /)
    expect(code).toContain('./nodes/crypto_node.js')
  })

  it('keeps a top-level export after another step as a const, not a hoisted let', () => {
    // Pre-existing: the nesting test read the blank line between two
    // top-level parts as indentation and hoisted the second export.
    const ir = makeScript([
      stepNode('producer', 'return { result: 1 };', 'producer'),
      stepNode('consumer', 'return producer.result + 1;', 'EXPORT_Result'),
    ])
    ir.edges = [{ id: 'e1', source: 'producer', target: 'consumer' }]
    const code = generateScript(ir)
    expect(code).toContain('const Result = await flow.step("consumer"')
    expect(code).not.toMatch(/let Result;/)
    expect(code).toMatch(/return \{\s*Result\s*\}/)
  })

  it('wraps a module call that outgrows the line, keeping the call itself whole', () => {
    const ir = makeScript([
      stepNode('a-long-producer-id', 'return 1;', 'EXPORT_SomeFairlyLongProducerName'),
      stepNode('consumer', 'return SomeFairlyLongProducerName + 1;', 'EXPORT_Result'),
    ])
    ir.edges = [{ id: 'e1', source: 'a-long-producer-id', target: 'consumer' }]
    const code = generateScript(ir)
    expect(code).toContain(
      'const Result = await flow.step("consumer", (ctx) =>\n    $Result({ env, event, inputs: { SomeFairlyLongProducerName }, step, ctx }),\n  );',
    )
    // A short call stays on one line.
    expect(generateScript(makeScript([stepNode('t', 'return 1;')]))).toContain(
      'await flow.step("t", (ctx) => $t({ env, event, inputs: {}, step, ctx }));',
    )
  })

  it('keeps an `inline` step raw in a function, as in a workflow', () => {
    const inline = stepNode('raw', 'let n = 1; n++;')
    inline.data.inline = true
    const code = generateScript(makeScript([inline]))
    expect(code).toContain('let n = 1; n++;')
    expect(code).not.toContain('flow.step("raw"')
    expect(code).not.toContain('./nodes/raw.js')
  })

  it('emits no runtime import or host for a function whose nodes need no step', () => {
    const ir = makeScript([
      {
        id: 'ping',
        type: 'http_request',
        name: 'EXPORT_Ping',
        position: { x: 0, y: 0 },
        version: '1.0.0',
        provider: 'cloudflare',
        data: { method: 'GET', url: 'https://example.com/ping' },
      },
    ])
    const bundle = generateScriptBundle(ir)
    const worker = bundle.files.find((f) => f.path === 'worker.ts')!.source
    expect(worker).not.toContain('#awaitstep/runtime')
    expect(worker).not.toContain('createInlineHost')
    expect(bundle.files.map((f) => f.path)).toEqual(['worker.ts'])
    expect(bundle.manifest?.steps).toEqual([{ nodeId: 'ping', varName: 'Ping' }])
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

  it('keeps env references plain (not this.env), in the entry and in the step modules', () => {
    const bundle = generateScriptBundle(
      makeScript([stepNode('use-env', 'return env.SECRET_KEY ?? "missing";')]),
    )
    const sources = bundle.files.map((f) => f.source).join('\n')
    expect(bundle.files.find((f) => f.path === 'nodes/use_env.ts')!.source).toContain(
      'env.SECRET_KEY',
    )
    expect(sources).not.toContain('this.env.')
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

  it('auto-exports a sub_workflow handle even without EXPORT_ prefix', () => {
    // sub_workflow is a result-producer node — its value (the WorkflowInstance
    // handle) is almost always what the user wants to surface (instance.id,
    // status(), etc). Treated as implicitly exported so the const survives
    // post-processing and the handle lands on `graph.<name>`.
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
    expect(code).toContain('const send_auth_email = await env["SEND_MAIL"].create({')
    expect(code).toContain('return { send_auth_email };')
  })

  it('auto-exports an http_request response even without EXPORT_ prefix', () => {
    // http_request is a result-producer node — its purpose is to make a
    // call and surface the JSON response. The response must land on
    // `graph.<name>` without forcing the user to learn the EXPORT_
    // convention; otherwise the entire request silently disappears.
    const ir = makeScript([
      {
        id: 'fetch-rates',
        type: 'http_request',
        name: 'exchange_rate',
        position: { x: 0, y: 0 },
        version: '1.0.0',
        provider: 'cloudflare',
        data: {
          url: 'https://example.com/rates',
          method: 'GET',
        },
      },
    ])
    const code = generateScript(ir)
    expect(code).toContain('const exchange_rate = await fetch(')
    expect(code).toContain('return { exchange_rate };')
  })

  it('auto-exports a sub_script response even without EXPORT_ prefix', () => {
    const ir = makeScript([
      {
        id: 'call-pricing',
        type: 'sub_script',
        name: 'pricing',
        position: { x: 0, y: 0 },
        version: '1.0.0',
        provider: 'cloudflare',
        data: {
          workerName: 'pricing-svc',
          method: 'GET',
          url: 'https://pricing-svc.example/quote',
        },
      },
    ])
    const code = generateScript(ir)
    expect(code).toContain('const pricing = await env.PRICING_SVC.fetch(')
    expect(code).toContain('return { pricing };')
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
    expect(code).toContain('env["ONBOARDING_WORKFLOW"].create(')
    expect(code).not.toContain('--await') // no polling
    // The forward itself is not a step: the binding call is awaited directly.
    expect(code).not.toMatch(/flow\.step\("Run Onboarding"/)
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

    // The loop itself is not wrapped — the body doesn't capture _output.
    expect(code).not.toMatch(/const send = await \(async/)
    expect(code).not.toMatch(/await \(async \(\) => \{\s*for \(const email/)
    // The child is a step, inlined in the non-module form, inside the loop.
    expect(code).toMatch(
      /for \(const email of event\.payload\.recipients\) \{\n\s+await flow\.step\("inner"/,
    )
    // No dead step-name counter: the loop's own iterator is the user's.
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
    // No outer IIFE since body doesn't capture _output; the child step inside
    // still sees the counter, since it is inlined in the loop's scope.
    expect(code).not.toMatch(/await \(async \(\) => \{\s*for \(let _loop_i/)
    expect(code).toMatch(
      /_loop_i\+\+\) \{\n\s+await flow\.step\("work"[\s\S]*console\.log\(_loop_i\)/,
    )
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

    // The parallel itself is not a step and has no outer IIFE — Promise.allSettled
    // is awaited directly; its arms are steps, inlined.
    expect(code).not.toMatch(/flow\.step\("(EXPORT_)?Fan"/)
    expect(code).not.toMatch(/await \(async \(\) => \{\s*return await Promise\./)
    expect(code).toMatch(/flow\.step\("a"/)
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
    expect(code).not.toContain('flow.step')
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

describe('generateScript — annotation mode (@fetch / @queue)', () => {
  const trivialIR = makeScript([stepNode('s', 'return { ok: true }')])

  it('emits both fetch and queue handlers when @fetch and @queue are declared', () => {
    const triggerCode = `
@fetch function handler(request, env, ctx) {
  return Response.json(await runGraph(env, { payload: {} }))
}

@queue function emails(batch, env, ctx) {
  for (const msg of batch.messages) msg.ack()
}
`
    const code = generateScript(trivialIR, { triggerCode })
    expect(code).toContain('async fetch(request, env, ctx): Promise<Response>')
    expect(code).toMatch(
      /async queue\(batch: MessageBatch<unknown>, env: Env, ctx: ExecutionContext\): Promise<void>/,
    )
    expect(code).toContain('switch (batch.queue) {')
    expect(code).toContain('case "emails":')
    expect(code).toContain('msg.ack()')
  })

  it('switch case label uses CF-valid queue name (snake_case → kebab-case)', () => {
    const triggerCode = `
@queue function marktplaats_processor(batch, env, ctx) {
  for (const msg of batch.messages) msg.ack()
}
`
    const code = generateScript(trivialIR, { triggerCode })
    // Case label uses the kebab-case CF queue name, NOT the snake_case JS function name.
    expect(code).toContain('case "marktplaats-processor":')
    expect(code).not.toContain('case "marktplaats_processor":')
  })

  it('switch case label converts camelCase function names to kebab-case', () => {
    const triggerCode = `
@queue function userEvents(batch, env, ctx) {
  for (const msg of batch.messages) msg.ack()
}
`
    const code = generateScript(trivialIR, { triggerCode })
    expect(code).toContain('case "user-events":')
    expect(code).not.toContain('case "userEvents":')
  })

  it('emits multiple @queue handlers as switch cases', () => {
    const triggerCode = `
@fetch function handler(request, env, ctx) { return new Response("ok") }

@queue function emails(batch, env, ctx) { /* email processing */ }
@queue function jobs(batch, env, ctx) { /* job processing */ }
`
    const code = generateScript(trivialIR, { triggerCode })
    expect(code).toContain('case "emails":')
    expect(code).toContain('case "jobs":')
    expect(code).toContain('email processing')
    expect(code).toContain('job processing')
  })

  it('omits fetch handler entirely for queue-only workers', () => {
    const triggerCode = `
@queue function emails(batch, env, ctx) {
  for (const msg of batch.messages) msg.ack()
}
`
    const code = generateScript(trivialIR, { triggerCode })
    expect(code).not.toContain('async fetch(')
    expect(code).toContain('async queue(batch: MessageBatch<unknown>')
    expect(code).toContain('case "emails":')
  })

  it('omits queue handler when no @queue annotations are present', () => {
    const triggerCode = `
@fetch function handler(request, env, ctx) {
  return Response.json({ ok: true })
}
`
    const code = generateScript(trivialIR, { triggerCode })
    expect(code).toContain('async fetch(request, env, ctx)')
    expect(code).not.toContain('async queue(')
    expect(code).not.toContain('switch (batch.queue)')
  })

  it('emits module-level code outside annotated functions', () => {
    const triggerCode = `
const SHARED_CONFIG = { region: "eu" }
function shared(x) { return x * 2 }

@fetch function handler(request, env, ctx) {
  return Response.json({ doubled: shared(21), config: SHARED_CONFIG })
}
`
    const code = generateScript(trivialIR, { triggerCode })
    expect(code).toContain('const SHARED_CONFIG = { region: "eu" }')
    expect(code).toContain('function shared(x) { return x * 2 }')
    // Module code emitted before runGraph so handlers can reference it.
    const moduleIdx = code.indexOf('const SHARED_CONFIG')
    const runGraphIdx = code.indexOf('async function runGraph')
    expect(moduleIdx).toBeGreaterThan(0)
    expect(moduleIdx).toBeLessThan(runGraphIdx)
  })

  it('hoists imports from inside any annotated handler body to module top', () => {
    const triggerCode = `
@fetch function handler(request, env, ctx) {
  import puppeteer from "@cloudflare/puppeteer"
  return Response.json({})
}

@queue function emails(batch, env, ctx) {
  import { sendEmail } from "./email"
  for (const msg of batch.messages) await sendEmail(msg.body)
}
`
    const code = generateScript(trivialIR, { triggerCode })
    // Imports should appear at the very top, NOT inside handler bodies.
    const puppeteerImportIdx = code.indexOf('import puppeteer')
    const fetchHandlerIdx = code.indexOf('async fetch(')
    expect(puppeteerImportIdx).toBeGreaterThanOrEqual(0)
    expect(puppeteerImportIdx).toBeLessThan(fetchHandlerIdx)

    const sendEmailImportIdx = code.indexOf('import { sendEmail }')
    expect(sendEmailImportIdx).toBeGreaterThanOrEqual(0)
    expect(sendEmailImportIdx).toBeLessThan(fetchHandlerIdx)
  })

  it('preserves user param names from @fetch annotation', () => {
    const triggerCode = `
@fetch function handler(req, env, ctx) {
  return new Response("hi from " + req.url)
}
`
    const code = generateScript(trivialIR, { triggerCode })
    // Use of 'req' (user's chosen name) is preserved, not rewritten to 'request'.
    expect(code).toContain('async fetch(req, env, ctx)')
    expect(code).toContain('req.url')
  })

  it('legacy mode emission used when triggerCode has no annotations', () => {
    // When the user supplies a triggerCode that has no @fetch/@queue
    // annotations (e.g. a raw try/catch body), legacy emission applies:
    // typed `async fetch(request: Request, env: Env): Promise<Response>`.
    const code = generateScript(trivialIR, {
      triggerCode: 'try { return new Response("ok") } catch (e) { return Response.json({}) }',
    })
    expect(code).toContain('async fetch(request: Request, env: Env): Promise<Response>')
    expect(code).not.toContain('async queue(')
  })

  it('throws AnnotationParseError on invalid @fetch name (propagates from parser)', () => {
    const triggerCode = `@fetch function notHandler() { return new Response() }`
    expect(() => generateScript(trivialIR, { triggerCode })).toThrow(
      /requires function named 'handler'/,
    )
  })
})
