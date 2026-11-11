import { describe, it, expect } from 'vitest'
import type { WorkflowIR, WorkflowNode } from '@awaitstep/ir'
import { generateWorkflowBundle, generateWorkflow } from '../../codegen/generate.js'
import { bundleSource, providerEntrySource, workflowSource } from './bundle-source.js'

function node(id: string, name: string, data: Record<string, unknown>): WorkflowNode {
  return {
    id,
    type: 'step',
    name,
    position: { x: 0, y: 0 },
    version: '1.0.0',
    provider: 'cloudflare',
    data,
  }
}

const ir: WorkflowIR = {
  metadata: { name: 'BundleDemo', version: 1, createdAt: '', updatedAt: '' },
  entryNodeId: 'fetch',
  nodes: [
    node('fetch', 'Fetch data', {
      code: "import { z } from 'zod'\nconst res = await fetch(env.API_URL);\nreturn z.object({ ok: z.boolean() }).parse(await res.json());",
      retryLimit: 3,
      retryDelay: '5 seconds',
    }),
    node('report', 'Report', {
      code: 'return { ok: {{fetch.ok}}, at: event.timestamp };',
    }),
  ],
  edges: [{ id: 'e1', source: 'fetch', target: 'report' }],
}

describe('generateWorkflowBundle', () => {
  const bundle = generateWorkflowBundle(ir)

  it('emits one module per step plus the entry', () => {
    expect(bundle.entry).toBe('worker.ts')
    expect(bundle.files.map((f) => `${f.role}:${f.path}`)).toEqual([
      'entry:worker.ts',
      'module:awaitstep/workflow.ts',
      'module:awaitstep/env.ts',
      'module:awaitstep/entry.ts',
      'module:awaitstep/platform.ts',
      'module:steps/fetch.ts',
      'module:steps/report.ts',
      'module:awaitstep/runtime.ts',
    ])
  })

  it('module keeps user code untouched — imports local, env as a parameter', () => {
    const fetchModule = bundle.files.find((f) => f.path === 'steps/fetch.ts')!
    expect(fetchModule.source).toMatchInlineSnapshot(`
      "import { z } from 'zod'

      export default async function Fetch_data({ env, event, inputs, step, ctx }) {
        const res = await fetch(env.API_URL);
        return z.object({ ok: z.boolean() }).parse(await res.json());
      }
      "
    `)
    expect(fetchModule.source).not.toContain('this.env')
  })

  it('downstream module receives referenced upstream vars via inputs', () => {
    const reportModule = bundle.files.find((f) => f.path === 'steps/report.ts')!
    expect(reportModule.source).toMatchInlineSnapshot(`
      "export default async function Report({ env, event, inputs, step, ctx }) {
        return { ok: inputs.Fetch_data.ok, at: event.timestamp };
      }
      "
    `)
  })

  it('entry imports modules with .js specifiers and calls them from flow.step', () => {
    const entry = workflowSource(bundle)
    expect(entry).toContain('import $Fetch_data from "#app/steps/fetch.js";')
    expect(entry).toContain('import $Report from "#app/steps/report.js";')
    expect(entry).toContain(
      'const Fetch_data = await flow.step("fetch", { retries: { limit: 3, delay: "5 seconds" } }, (ctx) =>\n      $Fetch_data({ env, event, inputs: {}, step, ctx }),\n    );',
    )
    expect(entry).toMatch(
      /await flow\.step\("report", \{ retries: [\s\S]*?async \(ctx\) => \{\s+await \$Report\(\{ env, event, inputs: \{ Fetch_data \}, step, ctx \}\);/,
    )
    // No user code left in the entry to need env rewriting.
    expect(entry).not.toContain('z.object')
  })

  it('the string form is the worker entry: it imports the workflow module and the runtime', () => {
    const entry = generateWorkflow(ir)
    expect(entry).toBe(providerEntrySource(generateWorkflowBundle(ir)))
    expect(entry).toContain('import workflow, { AWAITSTEP_RETENTION } from "#awaitstep/workflow";')
    expect(entry).not.toContain('$Fetch_data')
  })
})

describe('generateWorkflowBundle with containers', () => {
  const loopIR: WorkflowIR = {
    metadata: { name: 'LoopDemo', version: 1, createdAt: '', updatedAt: '' },
    entryNodeId: 'loop-1',
    nodes: [
      {
        id: 'loop-1',
        type: 'loop',
        name: 'Each item',
        position: { x: 0, y: 0 },
        version: '1.0.0',
        provider: 'cloudflare',
        data: { loopType: 'forEach', items: '{{env.ITEMS}}', itemVar: 'item' },
      },
      node('work', 'Process item', { code: 'return inputs.item.length;' }),
    ],
    edges: [{ id: 'e1', source: 'loop-1', target: 'work', label: 'body' }],
  }

  it('a container child is a module too, reading the loop’s item from inputs', () => {
    const bundle = generateWorkflowBundle(loopIR)
    expect(bundle.files.map((f) => f.path)).toEqual([
      'worker.ts',
      'awaitstep/workflow.ts',
      'awaitstep/env.ts',
      'awaitstep/entry.ts',
      'awaitstep/platform.ts',
      'steps/work.ts',
      'awaitstep/runtime.ts',
    ])
    const workflow = workflowSource(bundle)
    expect(workflow).toContain('$Process_item({ env, event, inputs: { item }, step, ctx })')
    expect(bundleSource(bundle, 'steps/work.ts')).toContain('return inputs.item.length;')
    expect(bundle.manifest?.steps).toContainEqual(
      expect.objectContaining({ nodeId: 'work', filePath: 'steps/work.ts' }),
    )
  })
})

describe('generateWorkflowBundle with custom nodes', () => {
  const template = `import { z } from 'zod'
export default async function(ctx) {
  const response = await fetch(ctx.config.url, {
    headers: { Authorization: \`Bearer \${ctx.env.API_KEY}\` },
  });
  return z.object({ ok: z.boolean() }).parse(await response.json());
}`
  const resolver = {
    getTemplate(nodeType: string) {
      return nodeType === 'webhook-post' ? template : undefined
    },
  }
  const customIR: WorkflowIR = {
    metadata: { name: 'CustomDemo', version: 1, createdAt: '', updatedAt: '' },
    entryNodeId: 'fetch',
    nodes: [
      node('fetch', 'Fetch data', { code: 'return { id: 7 };' }),
      {
        id: 'hook',
        type: 'webhook-post',
        name: 'Post webhook',
        position: { x: 0, y: 1 },
        version: '1.0.0',
        provider: 'cloudflare',
        data: { url: 'https://example.com/${Fetch_data.id}' },
      },
    ],
    edges: [{ id: 'e1', source: 'fetch', target: 'hook' }],
  }
  const bundle = generateWorkflowBundle(customIR, { templateResolver: resolver })

  it('emits the custom node as its own module with the class inside', () => {
    expect(bundle.files.map((f) => `${f.role}:${f.path}`)).toEqual([
      'entry:worker.ts',
      'module:awaitstep/workflow.ts',
      'module:awaitstep/env.ts',
      'module:awaitstep/entry.ts',
      'module:awaitstep/platform.ts',
      'module:steps/fetch.ts',
      'module:nodes/Post_webhook.ts',
      'module:awaitstep/runtime.ts',
    ])
    const mod = bundle.files.find((f) => f.path === 'nodes/Post_webhook.ts')!
    expect(mod.source).toContain("import { z } from 'zod'")
    expect(mod.source).toContain('class WebhookPostNode {')
    expect(mod.source).toContain(
      'export default async function Post_webhook_step({ env, event, inputs, step, ctx })',
    )
    expect(mod.source).toContain('const { Fetch_data } = inputs;')
    expect(mod.source).toContain('return WebhookPostNode.execute(env, {')
    // env arrives as a parameter — never rewritten to this.env.
    expect(mod.source).not.toContain('this.env')
  })

  it('entry calls the custom module and hoists no class definition', () => {
    const entry = workflowSource(bundle)
    expect(entry).toContain('import $Post_webhook from "#app/nodes/Post_webhook.js";')
    // Wrapped: the call outgrows the line once indented into `run`.
    expect(entry).toContain(
      'await flow.step("hook", (ctx) =>\n      $Post_webhook({ env, event, inputs: { Fetch_data }, step, ctx }),\n    );',
    )
    expect(entry).not.toContain('class WebhookPostNode')
  })
})

describe('generateWorkflowBundle adversarial user code', () => {
  const hostile = [
    'const tpl = `hello ${event.payload.name} from env.` // env. inside a template',
    'class Inner { run() { return "return inside string" } }',
    'const s = "await flow.step(\\"fake\\")";',
    'if (event.payload.n > 1) { return new Inner().run(); }',
    'return tpl;',
  ].join('\n')

  const hostileIR: WorkflowIR = {
    metadata: { name: 'Hostile', version: 1, createdAt: '', updatedAt: '' },
    entryNodeId: 'h',
    nodes: [node('h', 'Hostile step', { code: hostile })],
    edges: [],
  }

  it('round-trips backticks, ${}, class, and env.-in-strings untouched in the module', () => {
    const bundle = generateWorkflowBundle(hostileIR)
    const mod = bundle.files.find((f) => f.path === 'steps/h.ts')!
    for (const line of hostile.split('\n')) {
      expect(mod.source).toContain(line)
    }
    expect(mod.source).not.toContain('this.env')
    const entry = workflowSource(bundle)
    expect(entry).not.toContain('class Inner')
  })
})

describe('generateWorkflowBundle sub-workflow calls', () => {
  const subWorkflowIR: WorkflowIR = {
    metadata: { name: 'ChildFlow', version: 1, createdAt: '', updatedAt: '' },
    entryNodeId: 'sub',
    nodes: [
      {
        id: 'sub',
        type: 'sub_workflow',
        name: 'Call child',
        position: { x: 0, y: 0 },
        version: '1.0.0',
        provider: 'cloudflare',
        data: {
          workflowId: 'child-flow',
          workflowName: 'ChildFlow',
          waitForCompletion: false,
        },
      },
    ],
    edges: [],
  }

  it('emits a platform-adapter call and no provider primitive', () => {
    const bundle = generateWorkflowBundle(subWorkflowIR)
    expect(bundle.files.some((f) => f.path === 'awaitstep/cloudflare.ts')).toBe(false)
    const workflow = workflowSource(bundle)
    expect(workflow).toContain(
      'flow.startWorkflow({ workflow: "child-flow", exportName: "ChildFlow", waitForCompletion: false })',
    )
    expect(workflow).not.toContain('#awaitstep/cloudflare')
  })

  it('omits the module when nothing needs it', () => {
    expect(generateWorkflowBundle(ir).files.some((f) => f.path === 'awaitstep/cloudflare.ts')).toBe(
      false,
    )
  })

  it('still emits the provider source verbatim when a step imports it', () => {
    const ir: WorkflowIR = {
      metadata: { name: 'KvStep', version: 1, createdAt: '', updatedAt: '' },
      entryNodeId: 'read',
      nodes: [
        {
          id: 'read',
          type: 'step',
          name: 'Read KV',
          position: { x: 0, y: 0 },
          version: '1.0.0',
          provider: 'cloudflare',
          data: {
            code: "import { kv } from '#awaitstep/cloudflare'\nreturn kv(env, 'USERS').get('a')",
          },
        },
      ],
      edges: [],
    }
    const cloudflare = generateWorkflowBundle(ir).files.find(
      (f) => f.path === 'awaitstep/cloudflare.ts',
    )!
    expect(cloudflare.source).toContain('export function kv')
    expect(cloudflare.source).not.toMatch(/^\s*import\b/m)
  })
})

describe('generateWorkflowBundle container-child custom nodes', () => {
  const template = `export default async function(ctx) { return fetch(ctx.config.url) }`
  const resolver = {
    getTemplate: (type: string) => (type === 'webhook-post' ? template : undefined),
  }
  const containerIR: WorkflowIR = {
    metadata: { name: 'BranchCustom', version: 1, createdAt: '', updatedAt: '' },
    entryNodeId: 'branch',
    nodes: [
      {
        id: 'branch',
        type: 'branch',
        name: 'Choose',
        position: { x: 0, y: 0 },
        version: '1.0.0',
        provider: 'cloudflare',
        data: { branches: [{ label: 'yes', condition: 'true' }] },
      },
      {
        id: 'custom',
        type: 'webhook-post',
        name: 'Custom',
        position: { x: 0, y: 200 },
        version: '1.0.0',
        provider: 'cloudflare',
        data: { url: 'https://example.com' },
      },
    ],
    edges: [{ id: 'e1', source: 'branch', target: 'custom', label: 'yes' }],
  }

  it('keeps the generated class beside its call site in the workflow module', () => {
    const bundle = generateWorkflowBundle(containerIR, { templateResolver: resolver })
    const workflow = workflowSource(bundle)
    expect(workflow).toMatch(/class \w+ \{/)
    expect(workflow).toContain('WebhookPostNode.execute(')
    // The entry is the bootstrap; the class is not declared there.
    expect(providerEntrySource(bundle)).not.toMatch(/class WebhookPostNode/)
  })
})

describe('generateWorkflowBundle provider primitive emission', () => {
  it('emits the module when a step module imports a provider primitive', () => {
    const ir: WorkflowIR = {
      metadata: { name: 'KvStep', version: 1, createdAt: '', updatedAt: '' },
      entryNodeId: 'read',
      nodes: [
        {
          id: 'read',
          type: 'step',
          name: 'Read KV',
          position: { x: 0, y: 0 },
          version: '1.0.0',
          provider: 'cloudflare',
          data: {
            code: "import { kv } from '#awaitstep/cloudflare'\nreturn kv(env, 'USERS').get('a')",
          },
        },
      ],
      edges: [],
    }
    const bundle = generateWorkflowBundle(ir)
    expect(bundle.files.some((file) => file.path === 'awaitstep/cloudflare.ts')).toBe(true)
  })

  it('emits the module when a project file imports it with single quotes', () => {
    const ir: WorkflowIR = {
      metadata: { name: 'ProjectKv', version: 1, createdAt: '', updatedAt: '' },
      entryNodeId: 'read',
      nodes: [
        {
          id: 'read',
          type: 'step',
          name: 'Read',
          position: { x: 0, y: 0 },
          version: '1.0.0',
          provider: 'cloudflare',
          data: { code: 'return 1' },
        },
      ],
      edges: [],
      runtime: {
        files: [{ path: 'lib/kv.ts', source: "export { kv } from '#awaitstep/cloudflare'" }],
      },
    }
    const bundle = generateWorkflowBundle(ir)
    expect(bundle.files.some((file) => file.path === 'awaitstep/cloudflare.ts')).toBe(true)
  })

  it('declares a sub-script service binding on the generated Env', () => {
    const ir: WorkflowIR = {
      metadata: { name: 'CallFn', version: 1, createdAt: '', updatedAt: '' },
      entryNodeId: 'call',
      nodes: [
        {
          id: 'call',
          type: 'sub_script',
          name: 'Call function',
          position: { x: 0, y: 0 },
          version: '1.0.0',
          provider: 'cloudflare',
          data: { workerName: 'my-func', url: 'https://invoke/', method: 'POST' },
        },
      ],
      edges: [],
    }
    const env = bundleSource(generateWorkflowBundle(ir), 'awaitstep/env.ts')
    expect(env).toContain('MY_FUNC: Fetcher;')
  })
})

describe('generateWorkflowBundle: what a step after a container can read', () => {
  it('does not hand a plain child of a branch arm to the step after the branch', () => {
    const graph: WorkflowIR = {
      metadata: { name: 'Blocks', version: 1, createdAt: '', updatedAt: '' },
      entryNodeId: 'gate',
      nodes: [
        {
          id: 'gate',
          type: 'branch',
          name: 'Gate',
          position: { x: 0, y: 0 },
          version: '1.0.0',
          provider: 'cloudflare',
          data: { branches: [{ label: 'yes', condition: 'true' }] },
        },
        node('inner', 'inner', { code: 'return 1;' }),
        node('after', 'after', { code: 'return inner + 1;' }),
      ],
      edges: [
        { id: 'e1', source: 'gate', target: 'inner', label: 'yes' },
        { id: 'e2', source: 'gate', target: 'after', label: 'then' },
      ],
    }
    const bundle = generateWorkflowBundle(graph)
    const workflow = bundle.files.find((f) => f.path === 'awaitstep/workflow.ts')!.source
    // `inner` is a const inside the if block; the call after it binds nothing of it.
    expect(workflow).toContain('$after({ env, event, inputs: {}, step, ctx })')
    expect(bundle.files.find((f) => f.path === 'steps/after.ts')!.source).not.toContain('inputs;')
  })
})
