import { describe, it, expect } from 'vitest'
import type { WorkflowIR, WorkflowNode } from '@awaitstep/ir'
import { generateWorkflowBundle, generateWorkflow } from '../../codegen/generate.js'
import { bundleSource, workflowSource } from './bundle-source.js'

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
      'module:nodes/Fetch_data.ts',
      'module:nodes/Report.ts',
      'module:awaitstep/runtime.ts',
    ])
  })

  it('module keeps user code untouched — imports local, env as a parameter', () => {
    const fetchModule = bundle.files.find((f) => f.path === 'nodes/Fetch_data.ts')!
    expect(fetchModule.source).toMatchInlineSnapshot(`
      "import { z } from 'zod'

      /** Step "Fetch data" — generated from the workflow node. */
      export default async function Fetch_data_step({ env, event, inputs, step, ctx }) {
        return await (async () => {
          const res = await fetch(env.API_URL);
          return z.object({ ok: z.boolean() }).parse(await res.json());
        })();
      }
      "
    `)
    expect(fetchModule.source).not.toContain('this.env')
  })

  it('downstream module receives referenced upstream vars via inputs', () => {
    const reportModule = bundle.files.find((f) => f.path === 'nodes/Report.ts')!
    expect(reportModule.source).toMatchInlineSnapshot(`
      "/** Step "Report" — generated from the workflow node. */
      export default async function Report_step({ env, event, inputs, step, ctx }) {
        return await (async () => {
          const { Fetch_data } = inputs;
          return { ok: Fetch_data.ok, at: event.timestamp };
        })();
      }
      "
    `)
  })

  it('entry imports modules with .js specifiers and calls them from flow.step', () => {
    const entry = workflowSource(bundle)
    expect(entry).toContain('import $Fetch_data from "../nodes/Fetch_data.js";')
    expect(entry).toContain('import $Report from "../nodes/Report.js";')
    expect(entry).toContain(
      'const Fetch_data = await flow.step("fetch", { retries: { limit: 3, delay: "5 seconds" } }, (ctx) =>\n      $Fetch_data({ env, event, inputs: {}, step, ctx }),\n    );',
    )
    expect(entry).toContain(
      'await flow.step("report", async (ctx) => {\n      await $Report({ env, event, inputs: { Fetch_data }, step, ctx });\n    });',
    )
    // No user code left in the entry to need env rewriting.
    expect(entry).not.toContain('z.object')
  })

  it('single-file generateWorkflow is a preview string that needs the runtime module', () => {
    const single = generateWorkflow(ir)
    expect(single).toContain('from "#awaitstep/runtime"')
    expect(single).toContain('async (ctx) => {')
    expect(single).not.toContain('$Fetch_data')
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
      node('work', 'Process item', { code: 'return item.length;' }),
    ],
    edges: [{ id: 'e1', source: 'loop-1', target: 'work', label: 'body' }],
  }

  it('container children stay inline — their code depends on container-scope bindings', () => {
    const bundle = generateWorkflowBundle(loopIR)
    expect(bundle.files.map((f) => f.path)).toEqual([
      'worker.ts',
      'awaitstep/workflow.ts',
      'awaitstep/env.ts',
      'awaitstep/runtime.ts',
    ])
    const entry = workflowSource(bundle)
    expect(entry).toContain('return item.length;')
    expect(entry).not.toContain('$Process_item')
  })

  it('the single-file emitter keeps the same inline container body', () => {
    const single = generateWorkflow(loopIR)
    expect(single).toContain('return item.length;')
    expect(single).not.toContain('$Process_item')
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
      'module:nodes/Fetch_data.ts',
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
    expect(entry).toContain('import $Post_webhook from "../nodes/Post_webhook.js";')
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
    const mod = bundle.files.find((f) => f.path === 'nodes/Hostile_step.ts')!
    for (const line of hostile.split('\n')) {
      expect(mod.source).toContain(line)
    }
    expect(mod.source).not.toContain('this.env')
    const entry = workflowSource(bundle)
    expect(entry).not.toContain('class Inner')
  })
})

describe('generateWorkflowBundle with Cloudflare-only primitives', () => {
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
        data: { workflowName: 'ChildFlow', waitForCompletion: false },
      },
    ],
    edges: [],
  }

  it('emits the Cloudflare primitive module and imports it from the workflow', () => {
    const bundle = generateWorkflowBundle(subWorkflowIR)
    expect(bundle.files.some((f) => f.path === 'awaitstep/cloudflare.ts')).toBe(true)
    const workflow = workflowSource(bundle)
    expect(workflow).toContain('import { workflow } from "#awaitstep/cloudflare"')
    expect(workflow).toContain('workflow(env, "CHILD_FLOW")')
  })

  it('omits the module when nothing needs it', () => {
    expect(generateWorkflowBundle(ir).files.some((f) => f.path === 'awaitstep/cloudflare.ts')).toBe(
      false,
    )
  })

  it('emits the provider source verbatim, import-free', () => {
    const cloudflare = generateWorkflowBundle(subWorkflowIR).files.find(
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
    expect(bundleSource(bundle, 'worker.ts')).not.toMatch(/class WebhookPostNode/)
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
