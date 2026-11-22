import { describe, expect, it, vi } from 'vitest'
import type { WorkflowIR } from '@awaitstep/ir'
import { generateWorkflowBundle, sendsEventsItself } from '../../codegen/generate-workflow.js'
import { generateScriptBundle } from '../../codegen/generate-script.js'
import { generateUniversalFunctionBundle, handlerModuleScaffold } from '@awaitstep/codegen'
import type { ScriptIR } from '@awaitstep/ir'
import { bundleTypeErrors } from './fixtures/type-check-bundle.js'
import { loadBundleModule, NonRetryableError } from './fixtures/run-bundle.js'

const HANDLER = `import { getInstance, sendEvent, workflowStatus } from '#awaitstep/workflow'
import { InstanceNotFoundError, type FetchContext } from '#awaitstep/runtime'
import type { Env } from '#awaitstep/env'

export default async function ({ request, env }: FetchContext<Env>): Promise<Response> {
  const { instanceId, payload } = (await request.json()) as { instanceId: string; payload: unknown }
  const instance = await getInstance(env, instanceId)
  if (!instance) return Response.json({ message: 'Instance not found' }, { status: 404 })
  const status = await instance.status()
  await instance.sendEvent('sunny', payload)
  try {
    await sendEvent(env, instanceId, 'sunny', payload)
  } catch (error) {
    if (error instanceof InstanceNotFoundError) return new Response(error.instanceId, { status: 404 })
    throw error
  }
  return Response.json({ status: status.status, again: await workflowStatus(env, instanceId) })
}
`

/** Entry → wait for `sunny`, with a hand-written fetch handler. */
const waiting: WorkflowIR = {
  metadata: { name: 'sunny', version: 1, createdAt: '', updatedAt: '' },
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
    {
      id: 'wait',
      type: 'wait_for_event',
      name: 'wait for sunny',
      position: { x: 0, y: 0 },
      version: '1.0.0',
      provider: 'cloudflare',
      data: { eventType: 'sunny', timeout: '30 seconds' },
    },
  ],
  edges: [{ id: 'e1', source: 'entry', target: 'wait' }],
  entryNodeId: 'entry',
  runtime: { files: [{ path: 'handlers/fetch.ts', source: HANDLER }] },
} as WorkflowIR

describe('getInstance and sendEvent in a Cloudflare workflow', () => {
  it('lets a handler look a run up and send it an event, type-checked', () => {
    const bundle = generateWorkflowBundle(waiting)
    expect(bundleTypeErrors(bundle, 'handlers/fetch.ts')).toEqual([])
    expect(bundleTypeErrors(bundle, 'awaitstep/workflow.ts')).toEqual([])
  })

  it('exports both from the workflow module, sendEvent going through getInstance', () => {
    const workflow = generateWorkflowBundle(waiting).files.find(
      (file) => file.path === 'awaitstep/workflow.ts',
    )!.source
    expect(workflow).toContain('async function awaitstepGetInstance(env: Env, instanceId: string)')
    expect(workflow).toContain(
      'return awaitstepSendInstanceEvent((id) => awaitstepGetInstance(env, id), instanceId, type, payload);',
    )
    // One runtime import, the helpers' names merged into it.
    expect(workflow.match(/from "#awaitstep\/runtime"/g)).toHaveLength(1)
    expect(workflow).toMatch(
      /import \{[^}]*sendInstanceEvent as awaitstepSendInstanceEvent, type WorkflowInstanceHandle as AwaitstepInstanceHandle \} from "#awaitstep\/runtime"/,
    )
  })

  it('sets the flow up for inline code that sends another workflow an event', () => {
    const script = {
      kind: 'script',
      metadata: { name: 'notify', version: 1, createdAt: '', updatedAt: '' },
      nodes: [
        {
          id: 'send',
          type: 'step',
          name: 'Send',
          position: { x: 0, y: 0 },
          version: '1.0.0',
          provider: 'cloudflare',
          data: {
            inline: true,
            code: "await flow.sendEvent('run-1', { type: 'sunny' }, { workflow: 'orders' })",
          },
        },
      ],
      edges: [],
      entryNodeId: 'send',
    } as unknown as ScriptIR
    // Not just a context: one with a host that carries the platform adapter,
    // or the call throws "needs a workflow host".
    const deployed = generateScriptBundle(script)
    const source = deployed.files.find((file) => file.path === 'awaitstep/function.ts')!.source
    expect(source).toContain('host: createInlineHost(platform ?? createAwaitstepPlatform(env)),')
    expect(deployed.files.some((file) => file.path === 'awaitstep/platform.ts')).toBe(true)
    const portable = generateUniversalFunctionBundle(script).files.find(
      (file) => file.path === 'awaitstep/function.ts',
    )!.source
    expect(portable).toContain('platform?: PlatformHost')
    expect(portable).toMatch(/host: createInlineHost\(platform/)
  })

  it('keeps a step’s own startWorkflow, workflowStatus, sendEvent or getInstance import', () => {
    const ir = {
      ...waiting,
      nodes: [
        ...waiting.nodes,
        {
          id: 'notify',
          type: 'step',
          name: 'Notify',
          position: { x: 0, y: 0 },
          version: '1.0.0',
          provider: 'cloudflare',
          data: {
            inline: true,
            code: "import { sendEvent, getInstance, startWorkflow, workflowStatus } from './notify'\nawait sendEvent('hello')\nawait getInstance()\nawait startWorkflow()\nawait workflowStatus()",
          },
        },
      ],
      edges: [...waiting.edges, { id: 'e2', source: 'wait', target: 'notify', label: 'onEvent' }],
      runtime: {
        files: [
          ...(waiting.runtime?.files ?? []),
          {
            path: 'awaitstep/notify.ts',
            source:
              'export async function sendEvent(message: string): Promise<string> { return message }\nexport async function getInstance(): Promise<number> { return 1 }\nexport async function startWorkflow(): Promise<number> { return 2 }\nexport async function workflowStatus(): Promise<number> { return 3 }\n',
          },
        ],
      },
    } as WorkflowIR
    const bundle = generateWorkflowBundle(ir)
    const workflow = bundle.files.find((file) => file.path === 'awaitstep/workflow.ts')!.source
    expect(workflow).toContain(
      "import { sendEvent, getInstance, startWorkflow, workflowStatus } from './notify'",
    )
    expect(workflow).toContain(
      '  awaitstepStartWorkflow as startWorkflow,\n  awaitstepWorkflowStatus as workflowStatus,',
    )
    expect(workflow).not.toMatch(
      /function (?:sendEvent|getInstance|startWorkflow|workflowStatus)\(/,
    )
    expect(bundleTypeErrors(bundle, 'awaitstep/workflow.ts')).toEqual([])
  })

  it('names the binding and exportName when another workflow is not bound', () => {
    const platform = generateWorkflowBundle(waiting).files.find(
      (file) => file.path === 'awaitstep/platform.ts',
    )!.source
    // Every workflow call goes through the check; a function's binding is a service.
    expect(platform).not.toMatch(/bindings\[cfBinding\(options\)\]\.(?:get|create)\(/)
  })
})

interface FakeInstance {
  status: ReturnType<typeof vi.fn>
  sendEvent: ReturnType<typeof vi.fn>
}

/** A workflow binding holding the given instances; `get` of any other id rejects, as Cloudflare's does. */
function fakeBinding(instances: Record<string, FakeInstance>) {
  return {
    get: vi.fn(async (id: string) => {
      const instance = instances[id]
      if (!instance) throw new Error('instance.not_found')
      return instance
    }),
  }
}

function fakeInstance(status: Record<string, unknown> = { status: 'waiting' }): FakeInstance {
  return { status: vi.fn(async () => status), sendEvent: vi.fn(async () => undefined) }
}

type Fetch = (request: Request, env: unknown) => Promise<Response>

/** The same workflow with the fetch handler a new workflow is seeded with: it sends no events itself. */
const seeded: WorkflowIR = {
  ...waiting,
  runtime: {
    files: [
      {
        path: 'handlers/fetch.ts',
        source: handlerModuleScaffold({ kind: 'fetch', target: 'workflow' }),
      },
    ],
  },
}

function builtInRoute(): Fetch {
  const entry = loadBundleModule(generateWorkflowBundle(seeded), 'awaitstep/entry.ts')
  const handlers = entry.default as { fetch: Fetch }
  return (request, env) => handlers.fetch(request, env)
}

function sendEventRequest(body: Record<string, unknown>): Request {
  return new Request('https://worker.test/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'send-event', ...body }),
  })
}

describe('the built-in send-event route, run', () => {
  it('sends the event to the run and answers ok', async () => {
    const run = fakeInstance()
    const env = { WORKFLOW: fakeBinding({ 'run-1': run }) }
    const response = await builtInRoute()(
      sendEventRequest({ instanceId: 'run-1', type: 'sunny', payload: { hello: 1 } }),
      env,
    )
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ ok: true })
    expect(run.sendEvent).toHaveBeenCalledWith({ type: 'sunny', payload: { hello: 1 } })
  })

  it('answers 404 for a run that does not exist', async () => {
    const env = { WORKFLOW: fakeBinding({}) }
    const response = await builtInRoute()(
      sendEventRequest({ instanceId: 'nope', type: 'sunny' }),
      env,
    )
    expect(response.status).toBe(404)
    expect(await response.json()).toEqual({ message: 'Instance not found' })
  })

  it.each([
    ['a blank type', { instanceId: 'run-1', type: '   ' }, 'type is required'],
    ['a blank instance id', { instanceId: '  ', type: 'sunny' }, 'instanceId is required'],
  ])('answers 400 for %s without asking Cloudflare', async (_, body, message) => {
    const binding = fakeBinding({ 'run-1': fakeInstance() })
    const response = await builtInRoute()(sendEventRequest(body), { WORKFLOW: binding })
    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ message })
    expect(binding.get).not.toHaveBeenCalled()
  })

  it('answers 500 when sending fails, even with a TypeError', async () => {
    const run = fakeInstance()
    run.sendEvent.mockRejectedValue(
      new TypeError("Cannot read properties of undefined (reading 'x')"),
    )
    const response = await builtInRoute()(
      sendEventRequest({ instanceId: 'run-1', type: 'sunny' }),
      { WORKFLOW: fakeBinding({ 'run-1': run }) },
    )
    expect(response.status).toBe(500)
  })
})

describe('a fetch handler that sends events itself', () => {
  it('gets the send-event request: the built-in route steps aside', async () => {
    const run = fakeInstance()
    const env = { WORKFLOW: fakeBinding({ 'run-1': run }) }
    const entry = loadBundleModule(generateWorkflowBundle(waiting), 'awaitstep/entry.ts')
    const response = await (entry.default as { fetch: Fetch }).fetch(
      sendEventRequest({ instanceId: 'run-1', type: 'sunny', payload: { hello: 1 } }),
      env,
    )
    // HANDLER's own answer, not the route's { ok: true }.
    expect(await response.json()).toEqual({ status: 'waiting', again: { status: 'waiting' } })
    expect(run.sendEvent).toHaveBeenCalledTimes(2)
  })

  it.each([
    ["import { sendEvent } from '#awaitstep/workflow'", true],
    ['import { getInstance as find } from "#awaitstep/workflow"', true],
    ["import workflow, { sendEvent } from '#awaitstep/workflow'", true],
    ["import * as wf from '#awaitstep/workflow'\nwf.sendEvent(env, id, 't')", true],
    ["import * as wf from '#awaitstep/workflow'\nwf.workflowStatus(env, id)", false],
    ["import { startWorkflow, workflowStatus } from '#awaitstep/workflow'", false],
    ["// import { sendEvent } from '#awaitstep/workflow'", false],
    ["import { sendEvent } from '#lib/events'", false],
  ])('%s → owns events: %s', (line, owns) => {
    const files = [
      { path: 'handlers/fetch.ts', source: `${line}\nexport default async function () {}` },
    ]
    expect(sendsEventsItself('handlers/fetch.ts', files)).toBe(owns)
  })

  it('sees sendEvent reached through the project’s own modules', () => {
    const files = [
      {
        path: 'handlers/fetch.ts',
        source: "import { resume } from './shared.js'\nexport default resume",
      },
      { path: 'handlers/shared.ts', source: "export { resume } from '#app/lib/events'" },
      {
        path: 'lib/events.ts',
        source: "import { sendEvent } from '#awaitstep/workflow'\nexport const resume = sendEvent",
      },
    ]
    expect(sendsEventsItself('handlers/fetch.ts', files)).toBe(true)
    expect(sendsEventsItself('handlers/fetch.ts', files.slice(0, 2))).toBe(false)
  })
})

describe('the platform host, run', () => {
  type Platform = {
    getInstance(
      id: string,
      options: Record<string, unknown>,
    ): Promise<{
      instanceId: string
      status(): Promise<unknown>
      sendEvent(type: string, payload?: unknown): Promise<void>
    } | null>
    workflowStatus(id: string, options: Record<string, unknown>): Promise<unknown>
  }
  const orders = { workflow: 'orders', exportName: 'OrdersWorkflow' }

  function platform(env: Record<string, unknown>): Platform {
    const module = loadBundleModule(generateWorkflowBundle(waiting), 'awaitstep/platform.ts')
    return (module.createAwaitstepPlatform as (env: unknown) => Platform)(env)
  }

  it('reads another workflow’s status from the instance it awaits', async () => {
    const env = {
      ORDERS_WORKFLOW: fakeBinding({ 'run-1': fakeInstance({ status: 'complete', output: 7 }) }),
    }
    await expect(platform(env).workflowStatus('run-1', orders)).resolves.toEqual({
      status: 'complete',
      output: 7,
    })
  })

  it.each([
    [{ status: 'errored', error: { message: 'card declined' } }, 'card declined'],
    [{ status: 'terminated' }, 'Sub-workflow was terminated'],
  ])('fails for good when the other workflow ended badly (%o)', async (status, message) => {
    const env = { ORDERS_WORKFLOW: fakeBinding({ 'run-1': fakeInstance(status) }) }
    const failure = platform(env).workflowStatus('run-1', orders)
    await expect(failure).rejects.toBeInstanceOf(NonRetryableError)
    await expect(failure).rejects.toThrow(message)
  })

  it('finds another workflow’s run and sends it an event, or null when there is none', async () => {
    const run = fakeInstance()
    const env = { ORDERS_WORKFLOW: fakeBinding({ 'run-1': run }) }
    const handle = await platform(env).getInstance('run-1', orders)
    expect(handle?.instanceId).toBe('run-1')
    await handle!.sendEvent('sunny', { hello: 1 })
    expect(run.sendEvent).toHaveBeenCalledWith({ type: 'sunny', payload: { hello: 1 } })
    await expect(platform(env).getInstance('nope', orders)).resolves.toBeNull()
  })

  it('names the missing binding and how to bind it', async () => {
    await expect(platform({}).getInstance('run-1', { workflow: 'orders' })).rejects.toThrow(
      'Workflow "orders" is not bound here (no ORDERS binding): add a Call Workflow node for it and pass its exportName',
    )
  })

  it('type-checks, with NonRetryableError imported', () => {
    const errors = bundleTypeErrors(
      generateWorkflowBundle(waiting),
      'awaitstep/platform.ts',
    ).filter((message) => !message.includes("Cannot find module 'cloudflare:"))
    expect(errors).toEqual([])
  })
})

describe('a function whose only platform call sits in a node the graph does not reach yet', () => {
  const draft = {
    kind: 'script',
    metadata: { name: 'notify', version: 1, createdAt: '', updatedAt: '' },
    nodes: [
      {
        id: 'start',
        type: 'step',
        name: 'Start',
        position: { x: 0, y: 0 },
        version: '1.0.0',
        provider: 'cloudflare',
        data: { inline: true, code: 'const ready = true' },
      },
      {
        id: 'orphan',
        type: 'step',
        name: 'Orphan',
        position: { x: 0, y: 0 },
        version: '1.0.0',
        provider: 'cloudflare',
        data: {
          inline: true,
          code: "await flow.sendEvent('run-1', { type: 'sunny' }, { workflow: 'orders' })",
        },
      },
    ],
    edges: [],
    entryNodeId: 'start',
  } as unknown as ScriptIR

  it.each([
    ['Cloudflare', () => generateScriptBundle(draft)],
    ['portable', () => generateUniversalFunctionBundle(draft)],
  ])('still declares the PlatformHost it takes (%s)', (_, generate) => {
    const errors = bundleTypeErrors(generate(), 'awaitstep/function.ts')
    expect(errors.filter((message) => message.includes('PlatformHost'))).toEqual([])
  })
})
