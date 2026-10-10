import { describe, it, expect } from 'vitest'
import type { WorkflowIR, WorkflowNode } from '@awaitstep/ir'
import { generateWorkflowBundle, generateWorkflow } from '../../codegen/generate.js'

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
      'module:nodes/Fetch_data.ts',
      'module:nodes/Report.ts',
    ])
  })

  it('module keeps user code untouched — imports local, env as a parameter', () => {
    const fetchModule = bundle.files.find((f) => f.path === 'nodes/Fetch_data.ts')!
    expect(fetchModule.source).toMatchInlineSnapshot(`
      "import { z } from 'zod'

      /** Step "Fetch data" — generated from the workflow node. */
      export default async function Fetch_data_step({ env, event, inputs, step }) {
        const res = await fetch(env.API_URL);
        return z.object({ ok: z.boolean() }).parse(await res.json());
      }
      "
    `)
    expect(fetchModule.source).not.toContain('this.env')
  })

  it('downstream module receives referenced upstream vars via inputs', () => {
    const reportModule = bundle.files.find((f) => f.path === 'nodes/Report.ts')!
    expect(reportModule.source).toMatchInlineSnapshot(`
      "/** Step "Report" — generated from the workflow node. */
      export default async function Report_step({ env, event, inputs, step }) {
        const { Fetch_data } = inputs;
        return { ok: Fetch_data.ok, at: event.timestamp };
      }
      "
    `)
  })

  it('entry imports modules with .js specifiers and calls them from step.do', () => {
    const entry = bundle.files[0].source
    expect(entry).toContain('import $Fetch_data from "./nodes/Fetch_data.js";')
    expect(entry).toContain('import $Report from "./nodes/Report.js";')
    expect(entry).toContain(
      'const Fetch_data = await step.do("fetch", { retries: { limit: 3, delay: "5 seconds" } }, () => $Fetch_data({ env: this.env, event, inputs: {}, step }));',
    )
    expect(entry).toContain(
      'await step.do("report", async () => { await $Report({ env: this.env, event, inputs: { Fetch_data }, step }); });',
    )
    // No user code left in the entry to need env rewriting.
    expect(entry).not.toContain('z.object')
  })

  it('single-file generateWorkflow output is unchanged by bundle support', () => {
    const single = generateWorkflow(ir)
    expect(single).toContain('async () => {')
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
    expect(bundle.files.map((f) => f.path)).toEqual(['worker.ts'])
    const entry = bundle.files[0].source
    expect(entry).toContain('return item.length;')
    expect(entry).not.toContain('$Process_item')
  })

  it('container-child output matches single-file mode exactly', () => {
    const single = generateWorkflow(loopIR)
    const entry = generateWorkflowBundle(loopIR).files[0].source
    expect(entry).toBe(single)
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
      'module:nodes/Fetch_data.ts',
      'module:nodes/Post_webhook.ts',
    ])
    const mod = bundle.files.find((f) => f.path === 'nodes/Post_webhook.ts')!
    expect(mod.source).toContain("import { z } from 'zod'")
    expect(mod.source).toContain('class WebhookPostNode {')
    expect(mod.source).toContain(
      'export default async function Post_webhook_step({ env, event, inputs, step })',
    )
    expect(mod.source).toContain('const { Fetch_data } = inputs;')
    expect(mod.source).toContain('return WebhookPostNode.execute(env, {')
    // env arrives as a parameter — never rewritten to this.env.
    expect(mod.source).not.toContain('this.env')
  })

  it('entry calls the custom module and hoists no class definition', () => {
    const entry = bundle.files[0].source
    expect(entry).toContain('import $Post_webhook from "./nodes/Post_webhook.js";')
    expect(entry).toContain(
      'await step.do("hook", () => $Post_webhook({ env: this.env, event, inputs: { Fetch_data }, step }));',
    )
    expect(entry).not.toContain('class WebhookPostNode')
  })
})

describe('generateWorkflowBundle adversarial user code', () => {
  const hostile = [
    'const tpl = `hello ${event.payload.name} from env.` // env. inside a template',
    'class Inner { run() { return "return inside string" } }',
    'const s = "await step.do(\\"fake\\")";',
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
    const entry = bundle.files[0].source
    expect(entry).not.toContain('class Inner')
  })
})
