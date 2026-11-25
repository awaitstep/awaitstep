import { describe, expect, it, vi } from 'vitest'
import type { WorkflowIR } from '@awaitstep/ir'
import { handlerModuleScaffold } from '@awaitstep/codegen'
import { generateWorkflowBundle } from '../../codegen/generate-workflow.js'
import { loadBundleModule } from './fixtures/run-bundle.js'
import { bundleTypeErrors } from './fixtures/type-check-bundle.js'

// Each test compiles a bundle with the TypeScript compiler: past vitest's 5s default on a busy runner.
vi.setConfig({ testTimeout: 30_000 })

type Fetch = (request: Request, env: unknown) => Promise<Response>

function workflowWith(files: Array<{ path: string; source: string }> | undefined): WorkflowIR {
  return {
    metadata: { name: 'orders', version: 1, createdAt: '', updatedAt: '' },
    nodes: [
      {
        id: 'entry',
        type: 'step',
        name: 'Entry',
        position: { x: 0, y: 0 },
        version: '1.0.0',
        provider: 'cloudflare',
        data: { code: 'return 1' },
      },
    ],
    edges: [],
    entryNodeId: 'entry',
    ...(files && { runtime: { files } }),
  } as WorkflowIR
}

function entryFetch(ir: WorkflowIR): Fetch {
  const entry = loadBundleModule(generateWorkflowBundle(ir), 'awaitstep/entry.ts')
  return (entry.default as { fetch: Fetch }).fetch
}

function creatingBinding() {
  let n = 0
  return {
    create: vi.fn(async (options: { id?: string }) => ({ id: options.id ?? `cf-${++n}` })),
  }
}

function post(body: unknown, instanceId?: string): Request {
  return new Request('https://wf.example.com/v1/', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(instanceId && { 'x-awaitstep-instance-id': instanceId }),
    },
    body: JSON.stringify(body),
  })
}

const seeded = workflowWith([
  {
    path: 'handlers/fetch.ts',
    source: handlerModuleScaffold({ kind: 'fetch', target: 'workflow' }),
  },
])

describe('the instance id a request names, in the generated worker', () => {
  it('starts the seeded handler’s run under the header’s id', async () => {
    const WORKFLOW = creatingBinding()
    const response = await entryFetch(seeded)(post({ orderId: 1 }, 'run-abc'), { WORKFLOW })
    expect(await response.json()).toEqual({ instanceId: 'run-abc' })
    expect(WORKFLOW.create).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'run-abc', params: { orderId: 1 } }),
    )
  })

  it('takes params.instanceId first, and keeps it in params', async () => {
    const WORKFLOW = creatingBinding()
    const body = { instanceId: 'order-42', orderId: 42 }
    const response = await entryFetch(seeded)(post(body, 'run-abc'), { WORKFLOW })
    expect(await response.json()).toEqual({ instanceId: 'order-42' })
    expect(WORKFLOW.create).toHaveBeenCalledWith(expect.objectContaining({ params: body }))
  })

  it('lets Cloudflare pick when the request names none', async () => {
    const WORKFLOW = creatingBinding()
    await entryFetch(seeded)(post({ orderId: 1 }), { WORKFLOW })
    expect(WORKFLOW.create.mock.calls[0]![0]).not.toHaveProperty('id')
  })

  it('reaches a handler that reshapes params; only its first start takes the id; an explicit id wins', async () => {
    const handler = `import { startWorkflow } from "#awaitstep/workflow";
import type { FetchContext } from "#awaitstep/runtime";
import type { Env } from "#awaitstep/env";

export default async function ({ request, env }: FetchContext<Env>): Promise<Response> {
  const body = (await request.json()) as { orderId: number };
  const first = await startWorkflow(env, { order: body.orderId });
  const second = await startWorkflow(env, { order: body.orderId + 1 });
  const named = await startWorkflow(env, { order: 0 }, { instanceId: "mine" });
  return Response.json([first.instanceId, second.instanceId, named.instanceId]);
}
`
    const ir = workflowWith([{ path: 'handlers/fetch.ts', source: handler }])
    expect(bundleTypeErrors(generateWorkflowBundle(ir), 'handlers/fetch.ts')).toEqual([])
    const WORKFLOW = creatingBinding()
    const response = await entryFetch(ir)(post({ orderId: 7 }, 'run-abc'), { WORKFLOW })
    expect(await response.json()).toEqual(['run-abc', 'cf-1', 'mine'])
    expect(WORKFLOW.create).toHaveBeenCalledTimes(3)
  })

  it('reaches a handler that calls env.WORKFLOW.create itself', async () => {
    const handler = `import type { FetchContext } from "#awaitstep/runtime";
import type { Env } from "#awaitstep/env";
export default async function ({ request, env }: FetchContext<Env>): Promise<Response> {
  const first = await env.WORKFLOW.create({ params: await request.json() });
  const second = await env.WORKFLOW.create({ params: {} });
  const own = await env.WORKFLOW.create({ id: "mine", params: {} });
  return Response.json([first.id, second.id, own.id]);
}
`
    const ir = workflowWith([{ path: 'handlers/fetch.ts', source: handler }])
    const WORKFLOW = creatingBinding()
    const response = await entryFetch(ir)(post({ a: 1 }, 'run-abc'), { WORKFLOW })
    expect(await response.json()).toEqual(['run-abc', 'cf-1', 'mine'])
  })

  it('takes the request’s id once, even when an explicit id came first', async () => {
    const handler = `import { startWorkflow } from "#awaitstep/workflow";
import type { FetchContext } from "#awaitstep/runtime";
import type { Env } from "#awaitstep/env";
export default async function ({ env }: FetchContext<Env>): Promise<Response> {
  const named = await startWorkflow(env, {}, { instanceId: "mine" });
  const next = await startWorkflow(env, {});
  return Response.json([named.instanceId, next.instanceId]);
}
`
    const ir = workflowWith([{ path: 'handlers/fetch.ts', source: handler }])
    const WORKFLOW = creatingBinding()
    const response = await entryFetch(ir)(post({}, 'run-abc'), { WORKFLOW })
    expect(await response.json()).toEqual(['mine', 'cf-1'])
  })

  it('keeps every binding on the env the handler sees', async () => {
    const handler = `import type { FetchContext } from "#awaitstep/runtime";
import type { Env } from "#awaitstep/env";
export default async function ({ env }: FetchContext<Env>): Promise<Response> {
  return Response.json(Object.keys({ ...env }));
}
`
    const ir = workflowWith([{ path: 'handlers/fetch.ts', source: handler }])
    const response = await entryFetch(ir)(post({}, 'run-abc'), {
      WORKFLOW: creatingBinding(),
      API_KEY: 'k',
    })
    expect(await response.json()).toEqual(['WORKFLOW', 'API_KEY'])
  })

  it('hands it on in the inline default entry too (no fetch module)', async () => {
    const queueOnly = workflowWith([
      {
        path: 'handlers/queue/orders.ts',
        source: handlerModuleScaffold({ kind: 'queue', queue: 'orders' }),
      },
    ])
    const WORKFLOW = creatingBinding()
    const response = await entryFetch(queueOnly)(post({ orderId: 1 }, 'run-abc'), { WORKFLOW })
    expect(await response.json()).toEqual({ instanceId: 'run-abc' })
  })
})
