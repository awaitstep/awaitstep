import { describe, it, expect } from 'vitest'
import type { ScriptIR } from '@awaitstep/ir'
import { exportPlan, generateScriptBundle, nodeYieldsValue } from '../../codegen/generate.js'

/**
 * Every file of the function's bundle as one text — the worker bootstrap,
 * the graph module, the step modules — so an assertion can name any of
 * them. `generateScriptEntry` is the worker alone.
 */
function generateScript(
  ir: ScriptIR,
  options?: Parameters<typeof generateScriptBundle>[1],
): string {
  return generateScriptBundle(ir, options)
    .files.map((f) => f.source)
    .join('\n')
}

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

/** The worker's source and the manifest of a function bundle. */
function workerOf(ir: ScriptIR): {
  source: string
  manifest: NonNullable<ReturnType<typeof generateScriptBundle>['manifest']>
} {
  // The graph lives in `awaitstep/function.ts`; `worker.ts` is the bootstrap.
  const bundle = generateScriptBundle(ir)
  return {
    source: bundle.files.find((f) => f.path === 'awaitstep/function.ts')!.source,
    manifest: bundle.manifest!,
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
    // The inline default is the @fetch annotation form with its declared params.
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

  it('returns a step’s value when its node says so, keyed by its variable name', () => {
    const node = stepNode('node-id', 'return { ok: true };', 'fetch user')
    node.data = { ...node.data, export: true }
    const { source, manifest } = workerOf(makeScript([node]))
    expect(source).toMatch(/const fetch_user = await flow\.step\("node-id"/)
    expect(source).toMatch(/return \{\s*fetch_user\s*\}/)
    expect(manifest.steps[0]).toMatchObject({ nodeId: 'node-id', exportKey: 'fetch_user' })
  })

  it('does not return a step whose switch is off and that nothing names', () => {
    const node = stepNode('node-id', 'return { ok: true };', 'fetch user')
    node.data = { ...node.data, export: false }
    const { source, manifest } = workerOf(makeScript([node]))
    expect(source).not.toContain('const fetch_user =')
    expect(source).toContain('return {};')
    expect(manifest.steps[0]).not.toHaveProperty('exportKey')
  })

  it('uses the response key the node names, and the variable name when that key is not an identifier', () => {
    const named = stepNode('a', 'return 1;', 'fetch user')
    named.data = { ...named.data, export: true, exportAs: 'FetchUser' }
    let bundle = workerOf(makeScript([named]))
    expect(bundle.source).toMatch(/return \{\s*FetchUser: fetch_user\s*\}/)
    expect(bundle.manifest.steps[0]!.exportKey).toBe('FetchUser')

    const bad = stepNode('a', 'return 1;', 'fetch user')
    bad.data = { ...bad.data, export: true, exportAs: '2bad key' }
    bundle = workerOf(makeScript([bad]))
    expect(bundle.source).toMatch(/return \{\s*fetch_user\s*\}/)
    expect(bundle.manifest.steps[0]!.exportKey).toBe('fetch_user')
  })

  it('gives two nodes that ask for the same response key distinct keys', () => {
    const a = stepNode('a', 'return 1;', 'first')
    a.data = { ...a.data, export: true, exportAs: 'Result' }
    const b = stepNode('b', 'return 2;', 'second')
    b.data = { ...b.data, export: true, exportAs: 'Result' }
    const ir = makeScript([a, b])
    ir.edges = [{ id: 'e1', source: 'a', target: 'b' }]
    const { source, manifest } = workerOf(ir)
    expect(source).toMatch(/return \{\s*Result: first, Result_2: second\s*\}/)
    expect(manifest.steps.map((s) => s.exportKey)).toEqual(['Result', 'Result_2'])
  })

  it('hoists a returned node nested inside a container by the switch as it does by the prefix', () => {
    const inner = stepNode('inner-id', 'return { ok: true };', 'inner')
    inner.data = { ...inner.data, export: true }
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
      inner,
    ])
    ir.edges = [{ id: 'e1', source: 'gate', target: 'inner-id', label: 'yes' }]
    const code = generateScript(ir)
    expect(code).toMatch(/let inner[;,]/)
    expect(code).toMatch(/^\s+inner = await flow\.step\("inner-id"/m)
    expect(code).toMatch(/return \{\s*inner\s*\}/)
  })

  it('hands a returned child of a branch to the step after the branch’s `then`, which the sort alone put first', () => {
    const shared = stepNode('shared', 'return 7;', 'shared')
    shared.data = { ...shared.data, export: true }
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
      stepNode('inner', 'return 1;'),
      shared,
      stepNode('after', 'return shared + 1;'),
    ])
    ir.edges = [
      { id: 'e1', source: 'gate', target: 'inner', label: 'yes' },
      { id: 'e2', source: 'inner', target: 'shared' },
      { id: 'e3', source: 'gate', target: 'after', label: 'then' },
    ]
    const { files } = generateScriptBundle(ir)
    const worker = files.find((f) => f.path === 'awaitstep/function.ts')!.source
    expect(worker).toMatch(/let shared[;,]/)
    expect(worker).toContain('$after({ env, event, inputs: { shared }, step, ctx })')
    expect(files.find((f) => f.path === 'steps/after.ts')!.source).toContain(
      'const { shared } = inputs;',
    )
    // A plain child stays in its block: `inner` is not an input of `after`.
    expect(worker).not.toContain('inputs: { inner')
  })

  it('lets a node keep its own variable name as key when another node asks for that name', () => {
    const a = stepNode('a', 'return 1;', 'first')
    a.data = { ...a.data, export: true, exportAs: 'second' }
    const b = stepNode('b', 'return 2;', 'second')
    b.data = { ...b.data, export: true }
    const ir = makeScript([a, b])
    ir.edges = [{ id: 'e1', source: 'a', target: 'b' }]
    const { source, manifest } = workerOf(ir)
    expect(source).toMatch(/return \{\s*second_2: first, second\s*\}/)
    expect(manifest.steps.map((s) => s.exportKey)).toEqual(['second_2', 'second'])
  })

  it('refuses __proto__ as a response key, which would set the prototype instead of a property', () => {
    const node = stepNode('a', 'return 1;', 'first')
    node.data = { ...node.data, export: true, exportAs: '__proto__' }
    expect(workerOf(makeScript([node])).source).toMatch(/return \{\s*first\s*\}/)
  })

  it('does not return a switched-on step whose body never returns', () => {
    const node = stepNode('a', 'console.log(1);', 'first')
    node.data = { ...node.data, export: true }
    const { source, manifest } = workerOf(makeScript([node]))
    expect(source).toContain('return {};')
    expect(manifest.steps[0]).not.toHaveProperty('exportKey')
    expect(exportPlan(makeScript([node])).size).toBe(0)
  })

  it('records no key when an inline body already ends the graph with its own return', () => {
    const a = stepNode('a', 'return 1;', 'first')
    a.data = { ...a.data, export: true }
    const last = stepNode('last', 'return { done: true };', 'last')
    last.data = { ...last.data, inline: true }
    const ir = makeScript([a, last])
    ir.edges = [{ id: 'e1', source: 'a', target: 'last' }]
    const { source, manifest } = workerOf(ir)
    expect(source).not.toMatch(/return \{\s*first\s*\}/)
    expect(manifest.steps[0]).not.toHaveProperty('exportKey')
  })

  it('reads the export flag on a step only: a registry node’s own `export` field means something else', () => {
    const custom: ScriptIR['nodes'][0] = {
      id: 'x',
      type: 'csv-writer',
      name: 'Write CSV',
      position: { x: 0, y: 0 },
      version: '1.0.0',
      provider: 'cloudflare',
      data: { export: true },
    }
    expect(exportPlan(makeScript([custom])).has('x')).toBe(false)
  })

  it('returns a legacy EXPORT_ step only when its body returns, as it always did', () => {
    const { source, manifest } = workerOf(
      makeScript([stepNode('a', 'console.log(1);', 'EXPORT_Result')]),
    )
    expect(source).toContain('return {};')
    expect(manifest.steps[0]).not.toHaveProperty('exportKey')
  })

  it('plans a graph with an unreachable loop cycle without spinning', () => {
    const loop: ScriptIR['nodes'][0] = {
      id: 'L',
      type: 'loop',
      name: 'L',
      position: { x: 0, y: 0 },
      version: '1.0.0',
      provider: 'cloudflare',
      data: { loopType: 'forEach', collection: 'event.payload.items', itemVar: 'item' },
    }
    const stray: ScriptIR['nodes'][0] = { ...loop, id: 'U', name: 'U' }
    const ir = makeScript([
      stepNode('entry', 'return 1;'),
      loop,
      stepNode('body', 'return inputs.item;'),
      stray,
      stepNode('s', 'return 2;'),
    ])
    ir.edges = [
      { id: 'e1', source: 'entry', target: 'L' },
      { id: 'e2', source: 'L', target: 'body', label: 'body' },
      { id: 'e3', source: 'U', target: 's', label: 'body' },
      { id: 'e4', source: 's', target: 'U' },
    ]
    const plan = exportPlan(ir)
    expect(plan.has('L')).toBe(false)
    expect(nodeYieldsValue(ir, loop)).toBe(true)
    expect(nodeYieldsValue(ir, stray)).toBe(false)
  })

  it('still honours the legacy EXPORT_ name, even with the switch off', () => {
    const node = stepNode('node-id', 'return { ok: true };', 'EXPORT_Result')
    node.data = { ...node.data, export: false }
    const { source, manifest } = workerOf(makeScript([node]))
    expect(source).toMatch(/return \{\s*Result\s*\}/)
    expect(manifest.steps[0]!.exportKey).toBe('Result')
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

  it('keeps an unexported http call inside its arm, and hoists it once the node says so', () => {
    const httpNode = (data: Record<string, unknown>) => ({
      id: 'ping',
      type: 'http_request',
      name: 'Ping',
      position: { x: 0, y: 0 },
      version: '1.0.0',
      provider: 'cloudflare',
      data: { url: 'https://example.com', method: 'GET', ...data },
    })
    const build = (data: Record<string, unknown>) => {
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
        httpNode(data),
      ])
      ir.edges = [{ id: 'e1', source: 'gate', target: 'ping', label: 'yes' }]
      return generateScript(ir)
    }

    const off = build({})
    expect(off).not.toMatch(/let Ping/)
    expect(off).toMatch(/^\s+await flow\.http\(\{/m)
    expect(off).toContain('return {};')

    const on = build({ export: true })
    expect(on).toMatch(/let Ping[,;]/)
    expect(on).toMatch(/^\s+Ping = await flow\.http\(\{/m)
    expect(on).toMatch(/return \{\s*Ping\s*\}/)
  })

  it('keeps the const for a non-exported node when downstream nodes reference its var', () => {
    const ir = makeScript([
      stepNode('producer', 'return event.payload;', 'producer'),
      stepNode('consumer', 'console.log(producer);', 'consumer'),
    ])
    ir.edges = [{ id: 'e1', source: 'producer', target: 'consumer' }]
    const bundle = generateScriptBundle(ir)
    const code = bundle.files.find((f) => f.path === 'awaitstep/function.ts')!.source
    // `consumer` names `producer`, so the consumer module receives it as an
    // input and the producer's const survives in the body.
    expect(code).toMatch(/const producer = await flow\.step\("producer"/)
    expect(code).toMatch(/\$consumer\(\{ env, event, inputs: \{ producer \}, step, ctx \}\)/)
    expect(bundle.files.find((f) => f.path === 'steps/consumer.ts')!.source).toContain(
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
    const worker = bundle.files.find((f) => f.path === 'awaitstep/function.ts')!.source
    expect(worker).toContain(
      'import { createInlineHost, createWorkflowContext, durableStep } from "#awaitstep/runtime";',
    )
    expect(worker).toContain('import $New_step from "#app/steps/new-step.js";')
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
    const module = bundle.files.find((f) => f.path === 'steps/new-step.ts')!
    expect(module.role).toBe('module')
    expect(module.source).toContain('return { result: "ok" };')
    expect(bundle.files.map((f) => f.path)).toContain('awaitstep/runtime.ts')
    expect(bundle.manifest?.steps).toEqual([
      {
        nodeId: 'new-step',
        stepName: 'new-step',
        kind: 'do',
        varName: 'New_step',
        filePath: 'steps/new-step.ts',
      },
      { nodeId: 'guard', varName: 'New_try_catch' },
    ])
  })

  it('passes a step the inputs it reads and the call can bind, and nothing for a word match', () => {
    // `result` is a side-effect step (no return, so no const): a module that
    // reads `inputs.result` gets nothing; a body that only mentions the word
    // in an object literal — the canvas's default — gets nothing either.
    const ir = makeScript([
      stepNode('result', 'console.log("side effect");', 'result'),
      stepNode('next', 'return { result: "ok", read: inputs.result };', 'next'),
      stepNode('user', 'return { id: 1 };', 'user'),
      stepNode('last', 'return inputs.user.id + 1;', 'last'),
    ])
    ir.edges = [
      { id: 'e1', source: 'result', target: 'next' },
      { id: 'e2', source: 'next', target: 'user' },
      { id: 'e3', source: 'user', target: 'last' },
    ]
    const code = generateScript(ir)
    expect(code).toMatch(/\$next\(\{ env, event, inputs: \{\}, step, ctx \}\)/)
    expect(code).toMatch(/\$last\(\{ env, event, inputs: \{ user \}, step, ctx \}\)/)
  })

  it('does not hand a body an input it declares itself', () => {
    const ir = makeScript([
      stepNode('data', 'return 1;', 'data'),
      stepNode('again', 'const data = 2; return data;', 'again'),
    ])
    ir.edges = [{ id: 'e1', source: 'data', target: 'again' }]
    const bundle = generateScriptBundle(ir)
    const module = bundle.files.find((f) => f.path === 'steps/again.ts')!.source
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
    expect(code).toContain('import $step_node from "#app/steps/s1.js";')
    expect(code).toContain('import $env_node from "#app/steps/s2.js";')
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

  it('runs a step inside a try/catch as a module, hoisted when returned, with the error as an input', () => {
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
      stepNode('fallback', 'return { ok: false, why: inputs.error.message };', 'fallback'),
    ])
    ir.edges = [
      { id: 'e1', source: 'guard', target: 'risky', label: 'try' },
      { id: 'e2', source: 'guard', target: 'fallback', label: 'catch' },
    ]
    const bundle = generateScriptBundle(ir)
    const worker = bundle.files.find((f) => f.path === 'awaitstep/function.ts')!.source
    expect(worker).toContain('createInlineHost()')
    expect(worker).toMatch(/try \{\n\s+Risky = await flow\.step\("risky", \(ctx\) =>/)
    expect(worker).toContain('$fallback({ env, event, inputs: { error: err }, step, ctx })')
    expect(worker).toMatch(/let Risky;/)
    expect(worker).toMatch(/return \{\s*Risky\s*\}/)
    expect(bundle.files.map((f) => f.path)).toContain('steps/risky.ts')
    expect(bundle.manifest?.steps).toEqual([
      { nodeId: 'guard', varName: 'Guard' },
      {
        nodeId: 'risky',
        stepName: 'risky',
        kind: 'do',
        varName: 'Risky',
        filePath: 'steps/risky.ts',
        exportKey: 'Risky',
      },
      {
        nodeId: 'fallback',
        stepName: 'fallback',
        kind: 'do',
        varName: 'fallback',
        filePath: 'steps/fallback.ts',
      },
    ])
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
    expect(code).toContain('#app/steps/c.js')
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
    expect(code).not.toContain('#app/steps/raw.js')
  })

  it('emits no runtime import or host for a function whose nodes need no step', () => {
    const ir = makeScript([
      {
        id: 'pick',
        type: 'branch',
        name: 'Pick',
        position: { x: 0, y: 0 },
        version: '1.0.0',
        provider: 'cloudflare',
        data: { branches: [{ label: 'yes', condition: 'true' }] },
      },
    ])
    const bundle = generateScriptBundle(ir)
    const worker = bundle.files.find((f) => f.path === 'awaitstep/function.ts')!.source
    expect(worker).not.toContain('#awaitstep/runtime')
    expect(worker).not.toContain('createInlineHost')
    expect(bundle.files.map((f) => f.path)).toEqual([
      'worker.ts',
      'awaitstep/function.ts',
      'awaitstep/entry.ts',
    ])
    expect(bundle.manifest?.steps).toEqual([{ nodeId: 'pick', varName: 'Pick' }])
  })

  it('creates the flow context when flow.http is the only flow call', () => {
    const ir = makeScript([
      {
        id: 'ping',
        type: 'http_request',
        name: 'Ping',
        position: { x: 0, y: 0 },
        version: '1.0.0',
        provider: 'cloudflare',
        data: { method: 'GET', url: 'https://example.com/ping' },
      },
    ])
    const worker = generateScriptBundle(ir).files.find(
      (f) => f.path === 'awaitstep/function.ts',
    )!.source
    expect(worker).toContain('flow.http(')
    expect(worker).not.toContain('flow.step(')
    expect(worker).toContain('createWorkflowContext')
    expect(worker).toContain('#awaitstep/runtime')
  })

  it('needs the runtime for an http call, step or not', () => {
    const ir = makeScript([
      {
        id: 'ping',
        type: 'http_request',
        name: 'Ping',
        position: { x: 0, y: 0 },
        version: '1.0.0',
        provider: 'cloudflare',
        data: { method: 'GET', url: 'https://example.com/ping' },
      },
    ])
    const worker = generateScriptBundle(ir).files.find(
      (f) => f.path === 'awaitstep/function.ts',
    )!.source
    expect(worker).toContain('flow.http({ url: "https://example.com/ping" })')
    expect(worker).not.toContain('flow.step("ping"')
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
    expect(bundle.files.find((f) => f.path === 'steps/use-env.ts')!.source).toContain(
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
    expect(code).toContain(
      'const send_auth_email = await flow.startWorkflow({ workflow: "awaitstep-send-mail", exportName: "SendMail", waitForCompletion: false });',
    )
    expect(code).toContain('return { send_auth_email };')
  })

  it('returns an http response only when its node says so', () => {
    const node = (data: Record<string, unknown>) => ({
      id: 'fetch-rates',
      type: 'http_request',
      name: 'exchange_rate',
      position: { x: 0, y: 0 },
      version: '1.0.0',
      provider: 'cloudflare',
      data: { url: 'https://example.com/rates', method: 'GET', ...data },
    })
    const off = generateScript(makeScript([node({})]))
    expect(off).toContain('await flow.http({ url: "https://example.com/rates" })')
    expect(off).toContain('return {};')
    expect(off).not.toContain('let exchange_rate')

    const on = generateScript(makeScript([node({ export: true })]))
    expect(on).toContain('const exchange_rate = await flow.http(')
    expect(on).toContain('return { exchange_rate };')
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
    expect(code).toContain(
      'const pricing = await flow.callScript({ script: "pricing-svc", method: "GET", url: "https://pricing-svc.example/quote" });',
    )
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
    expect(code).toContain(
      'flow.startWorkflow({ workflow: "awaitstep-onboarding", exportName: "OnboardingWorkflow", input: transform, waitForCompletion: true })',
    )
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
      stepNode('check', 'return inputs.item.match ? inputs.item : undefined;'),
    ])
    ir.edges = [{ id: 'e1', source: 'find', target: 'check', label: 'body' }]
    const code = generateScript(ir)

    // A body step's return becomes the loop's value: the IIFE scopes
    // `_output` and hands it to the const the export pass keeps.
    expect(code).toMatch(
      /const FirstMatch = await \(async \(\) => \{[\s\S]*let _output;[\s\S]*return _output;\s*\}\)\(\);/,
    )
    expect(code).toContain('$check({ env, event, inputs: { item }, step, ctx })')
    expect(code).toContain('if (check !== undefined) _output = check;')
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
      stepNode('work', 'console.log(inputs.index);'),
    ])
    ir.edges = [{ id: 'e1', source: 'tries', target: 'work', label: 'body' }]
    const code = generateScript(ir)

    expect(code).toContain('for (let _loop_i = 0; _loop_i < 3; _loop_i++)')
    expect(code).toContain('inputs: { index: _loop_i }')
    // No outer IIFE since body doesn't capture _output; the child step inside
    // still sees the counter, since it is inlined in the loop's scope.
    expect(code).not.toMatch(/await \(async \(\) => \{\s*for \(let _loop_i/)
    expect(code).toMatch(/_loop_i\+\+\) \{\n\s+await flow\.step\("work"/)
    expect(
      generateScriptBundle(ir).files.find((f) => f.path === 'steps/work.ts')!.source,
    ).toContain('console.log(inputs.index);')
  })

  it('wraps a durable http call in a step, as a workflow does', () => {
    const ir = makeScript([
      {
        id: 'fetch_user',
        type: 'http_request',
        name: 'EXPORT_FetchUser',
        position: { x: 0, y: 0 },
        version: '1.0.0',
        provider: 'cloudflare',
        data: { method: 'GET', url: 'https://api.example.com/users/1', durable: true },
      },
    ])
    const code = generateScript(ir)
    expect(code).toContain(
      'const FetchUser = await flow.step("fetch_user", async () => flow.http({ url: "https://api.example.com/users/1" }));',
    )
  })

  it('returns an http response that runs without a step when switched on', () => {
    const ir = makeScript([
      {
        id: 'ping',
        type: 'http_request',
        name: 'Ping',
        position: { x: 0, y: 0 },
        version: '1.0.0',
        provider: 'cloudflare',
        data: { method: 'GET', url: 'https://example.com/ping', export: true },
      },
    ])
    // The function module, not the bundle: the embedded runtime names flow.step.
    const code = generateScriptBundle(ir).files.find(
      (f) => f.path === 'awaitstep/function.ts',
    )!.source
    expect(code).toContain('const Ping = await flow.http(')
    expect(code).not.toContain('flow.step(')
    expect(code).toMatch(/return \{\s*Ping\s*\}/)
  })

  it('passes query params to the runtime instead of building the URL', () => {
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
    // The function module, not the bundle: the embedded runtime builds URLs.
    const code = generateScriptBundle(ir).files.find(
      (f) => f.path === 'awaitstep/function.ts',
    )!.source
    expect(code).toContain('queryParams: { "q": "hello", "limit": "10" }')
    expect(code).not.toContain('new URL')
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

  it('keeps a parallel result bound when nothing reads it yet', () => {
    // Regression: the export pass dropped the `const` of a container value
    // no later code named, which left `await Promise.allSettled(...)` with no
    // handle in the graph people read. The container's value is its output,
    // so the generated graph should name it; an unused plain step's value is
    // still dropped.
    const ir = makeScript([
      {
        id: 'fan',
        type: 'parallel',
        name: 'Fan',
        position: { x: 0, y: 0 },
        version: '1.0.0',
        provider: 'cloudflare',
        data: {},
      },
      stepNode('a', 'return 1;'),
      stepNode('b', 'return 2;'),
      stepNode('after', 'return {};', 'after'),
    ])
    ir.edges = [
      { id: 'e1', source: 'fan', target: 'a' },
      { id: 'e2', source: 'fan', target: 'b' },
      { id: 'e3', source: 'fan', target: 'after', label: 'then' },
    ]
    const { source: code } = workerOf(ir)

    expect(code).toMatch(/const Fan = await Promise\.allSettled\(\[/)
    expect(code).not.toMatch(/^\s*await Promise\.allSettled\(/m)
    // Not returned to the caller: only an explicit export does that.
    expect(code).not.toMatch(/return \{[^}]*Fan[^}]*\}/)
  })

  it('keeps a race result bound when nothing reads it yet', () => {
    const ir = makeScript([
      {
        id: 'winner',
        type: 'race',
        name: 'Winner',
        position: { x: 0, y: 0 },
        version: '1.0.0',
        provider: 'cloudflare',
        data: {},
      },
      stepNode('a', 'return 1;'),
      stepNode('b', 'return 2;'),
    ])
    ir.edges = [
      { id: 'e1', source: 'winner', target: 'a' },
      { id: 'e2', source: 'winner', target: 'b' },
    ]
    const { source: code } = workerOf(ir)

    expect(code).toMatch(/const Winner = await Promise\.race\(\[/)
    expect(code).not.toMatch(/^\s*await Promise\.race\(/m)
  })

  it('keeps a yielding loop result bound when nothing reads it yet', () => {
    const ir = makeScript([
      {
        id: 'find',
        type: 'loop',
        name: 'Find',
        position: { x: 0, y: 0 },
        version: '1.0.0',
        provider: 'cloudflare',
        data: { loopType: 'forEach', collection: 'event.payload.items', itemVar: 'item' },
      },
      stepNode('check', 'return inputs.item;'),
    ])
    ir.edges = [{ id: 'e1', source: 'find', target: 'check', label: 'body' }]
    const { source: code } = workerOf(ir)

    expect(code).toMatch(/const Find = await \(async \(\) => \{/)
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
    const bundle = generateScriptBundle(trivialIR, { triggerCode })
    const code = bundle.files.find((file) => file.path === 'awaitstep/entry.ts')!.source
    const graph = bundle.files.find((file) => file.path === 'awaitstep/function.ts')!.source
    expect(code).toContain('const SHARED_CONFIG = { region: "eu" }')
    expect(code).toContain('function shared(x) { return x * 2 }')
    // Module code lives in the entry, above the handler object it serves.
    const moduleIdx = code.indexOf('const SHARED_CONFIG')
    const handlersIdx = code.indexOf('export default {')
    expect(moduleIdx).toBeGreaterThan(0)
    expect(moduleIdx).toBeLessThan(handlersIdx)
    expect(graph).toContain('async function runGraph')
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

describe('generateScript — code review round 1 of the step-module batch', () => {
  it('resolves a {{ }} read inside a step module to inputs.<var>, whatever shape the code was stored in', () => {
    const asBody = makeScript([
      stepNode('a', 'return { ok: true };', 'Fetch data'),
      stepNode('b', 'return { ok: {{a.ok}} };', 'b'),
    ])
    asBody.edges = [{ id: 'e1', source: 'a', target: 'b' }]
    const asModule = makeScript([
      stepNode('a', 'return { ok: true };', 'Fetch data'),
      stepNode(
        'b',
        'export default async function b({ env, event, inputs, step, ctx }) {\n  return { ok: {{a.ok}} };\n}\n',
        'b',
      ),
    ])
    asModule.edges = asBody.edges
    for (const ir of [asBody, asModule]) {
      const bundle = generateScriptBundle(ir)
      const module = bundle.files.find((f) => f.path === 'steps/b.ts')!.source
      expect(module).toContain('return { ok: inputs.Fetch_data.ok };')
      expect(workerOf(ir).source).toContain('$b({ env, event, inputs: { Fetch_data }, step, ctx })')
    }
  })

  it('puts the imports an inline step asked for into the graph module, where the code runs', () => {
    const inline = stepNode('ids', 'import { nanoid } from "nanoid";\nconst id = nanoid();', 'ids')
    inline.data.inline = true
    const bundle = generateScriptBundle(makeScript([inline]))
    const graph = bundle.files.find((f) => f.path === 'awaitstep/function.ts')!.source
    const worker = bundle.files.find((f) => f.path === 'awaitstep/entry.ts')!.source
    expect(graph).toContain('import { nanoid } from "nanoid";')
    expect(graph).toContain('const id = nanoid();')
    expect(worker).not.toContain('nanoid')
  })

  it('gives an old loop-body or catch-arm body its container’s bindings, and the binding wins over a step of that name', () => {
    const loop = {
      id: 'each',
      type: 'loop',
      name: 'Each',
      position: { x: 0, y: 0 },
      version: '1.0.0',
      provider: 'cloudflare',
      data: { loopType: 'forEach', collection: 'event.payload.rows', itemVar: 'item' },
    }
    const guard = { ...loop, id: 'guard', type: 'try_catch', name: 'Guard', data: {} }
    const ir = makeScript([
      stepNode('item', 'return { fromStep: true };', 'item'),
      loop,
      stepNode('price', 'return item.price * 2;', 'price'),
      guard,
      stepNode('risky', 'return 1;', 'risky'),
      stepNode('fallback', 'return { why: err.message };', 'fallback'),
    ])
    ir.edges = [
      { id: 'e1', source: 'item', target: 'each' },
      { id: 'e2', source: 'each', target: 'price', label: 'body' },
      { id: 'e3', source: 'each', target: 'guard', label: 'then' },
      { id: 'e4', source: 'guard', target: 'risky', label: 'try' },
      { id: 'e5', source: 'guard', target: 'fallback', label: 'catch' },
    ]
    const bundle = generateScriptBundle(ir)
    const price = bundle.files.find((f) => f.path === 'steps/price.ts')!.source
    const fallback = bundle.files.find((f) => f.path === 'steps/fallback.ts')!.source
    expect(price).toContain('const { item } = inputs;')
    expect(fallback).toContain('const { error: err } = inputs;')
    const graph = workerOf(ir).source
    // One `item` key, bound to the loop's item, not the step called item.
    expect(graph).toContain('$price({ env, event, inputs: { item }, step, ctx })')
    expect(graph).toContain('$fallback({ env, event, inputs: { error: err }, step, ctx })')
  })

  it('nests a body that declares a parameter name instead of redeclaring it', () => {
    const ir = makeScript([stepNode('a', 'const ctx = { n: 1 };\nreturn ctx.n;', 'a')])
    const module = generateScriptBundle(ir).files.find((f) => f.path === 'steps/a.ts')!.source
    expect(module).toContain(
      'return await (async () => {\n    const ctx = { n: 1 };\n    return ctx.n;\n  })();',
    )
  })

  it('does not bind or pass a step whose only return is in a comment', () => {
    const ir = makeScript([
      stepNode('a', '// return something later\nconsole.log(1);', 'a'),
      stepNode('b', 'return inputs.a;', 'b'),
    ])
    ir.edges = [{ id: 'e1', source: 'a', target: 'b' }]
    const graph = workerOf(ir).source
    expect(graph).not.toContain('const a =')
    expect(graph).toContain('$b({ env, event, inputs: {}, step, ctx })')
  })

  it('gives a loop no value when the returning step sits in a branch inside its body', () => {
    const loop = {
      id: 'each',
      type: 'loop',
      name: 'Each',
      position: { x: 0, y: 0 },
      version: '1.0.0',
      provider: 'cloudflare',
      data: {
        loopType: 'forEach',
        collection: 'event.payload.rows',
        itemVar: 'item',
        export: true,
      },
    }
    const pick = {
      ...loop,
      id: 'pick',
      type: 'branch',
      name: 'Pick',
      data: { branches: [{ label: 'yes', condition: 'true' }] },
    }
    const ir = makeScript([loop, pick, stepNode('deep', 'return inputs.item;', 'deep')])
    ir.edges = [
      { id: 'e1', source: 'each', target: 'pick', label: 'body' },
      { id: 'e2', source: 'pick', target: 'deep', label: 'yes' },
    ]
    const graph = workerOf(ir).source
    expect(graph).not.toContain('_output')
    expect(graph).not.toContain('const Each =')
  })

  it('passes every bound name when a module uses inputs whole', () => {
    const ir = makeScript([
      stepNode('a', 'return 1;', 'a'),
      stepNode('b', 'return 2;', 'b'),
      stepNode('c', 'return JSON.stringify(inputs);', 'c'),
    ])
    ir.edges = [
      { id: 'e1', source: 'a', target: 'b' },
      { id: 'e2', source: 'b', target: 'c' },
    ]
    expect(workerOf(ir).source).toContain('$c({ env, event, inputs: { a, b }, step, ctx })')
  })

  it('refuses a bundle whose project file sits at a step’s module path, naming the step', () => {
    const ir = makeScript([stepNode('fetch-1', 'return 1;', 'Fetch user')])
    ir.runtime = { files: [{ path: 'steps/fetch-1.ts', source: 'export const x = 1' }] }
    expect(() => generateScriptBundle(ir)).toThrow(
      'Project file "steps/fetch-1.ts" is where the module of step "Fetch user" goes',
    )
  })

  it('keeps a step called fetch from shadowing the global inside its own module', () => {
    const ir = makeScript([stepNode('f', 'return await fetch("https://x");', 'fetch')])
    const bundle = generateScriptBundle(ir)
    expect(bundle.files.map((f) => f.path)).toContain('steps/f.ts')
    expect(bundle.files.find((f) => f.path === 'steps/f.ts')!.source).toContain(
      'export default async function fetch_node(',
    )
  })
})
