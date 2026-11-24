import { describe, expect, it } from 'vitest'
import { Miniflare } from 'miniflare'
import type { ScriptIR, WorkflowIR, WorkflowNode } from '@awaitstep/ir'
import { generateScriptBundle, generateWorkflowBundle } from '../../codegen/generate.js'
import {
  SCHEDULE_TICK,
  configSchedules,
  scheduleCrons,
  scheduledEmission,
  schedulesProblem,
} from '../../codegen/schedules.js'
import { buildCronTriggers } from '../../adapter.js'
import { cloudflareDeploymentConfigSchema } from '../../config-schema.js'
import { NodeWranglerDeployer } from '../../deploy/node-deployer.js'
import { providerEntrySource } from './bundle-source.js'

function node(id: string, data: Record<string, unknown>): WorkflowNode {
  return {
    id,
    type: 'step',
    name: 'Step',
    position: { x: 0, y: 0 },
    version: '1.0.0',
    provider: 'cloudflare',
    data,
  }
}

const workflowIr: WorkflowIR = {
  metadata: { name: 'Orders', version: 1, createdAt: '', updatedAt: '' },
  entryNodeId: 'step',
  nodes: [node('step', { code: 'return 1;' })],
  edges: [],
}

const functionIr: ScriptIR = {
  kind: 'script',
  metadata: { name: 'Fn', version: 1, createdAt: '', updatedAt: '' },
  trigger: { type: 'http' },
  entryNodeId: 'step',
  nodes: [node('step', { code: 'return 1;' })],
  edges: [],
}

const amsterdam = { cron: '0 8 * * *', timezone: 'Europe/Amsterdam', params: { shift: 'day' } }

describe('the schedules a deployment config declares', () => {
  it('accepts a cron alone or one with a timezone and params', () => {
    const parsed = cloudflareDeploymentConfigSchema.safeParse({
      cronTriggers: ['0 * * * *', amsterdam, { cron: '5 4 * * *' }],
    })
    expect(parsed.success).toBe(true)
    expect(
      cloudflareDeploymentConfigSchema.safeParse({ cronTriggers: [{ timezone: 'UTC' }] }).success,
    ).toBe(false)
  })

  it('lists each schedule once, with UTC as the default timezone', () => {
    expect(configSchedules(['0 * * * *', ' 0 * * * * ', { cron: '0 * * * *' }, amsterdam])).toEqual(
      [{ cron: '0 * * * *', timezone: 'UTC' }, amsterdam],
    )
    expect(configSchedules(undefined)).toEqual([])
  })

  it('deploys a UTC schedule as its own trigger and the rest behind one every-minute trigger', () => {
    const tokyo = { cron: '0 9 * * *', timezone: 'Asia/Tokyo' }
    expect(scheduleCrons(configSchedules(['0 * * * *', amsterdam, tokyo]))).toEqual([
      '0 * * * *',
      SCHEDULE_TICK,
    ])
    expect(buildCronTriggers(undefined, { cronTriggers: ['0 * * * *', amsterdam] })).toEqual([
      '0 * * * *',
      '* * * * *',
    ])
    // The same expression in two timezones is two schedules, one trigger.
    expect(scheduleCrons(configSchedules([amsterdam, { ...tokyo, cron: amsterdam.cron }]))).toEqual(
      [SCHEDULE_TICK],
    )
    expect(buildCronTriggers(undefined, { cronTriggers: [] })).toBeUndefined()
  })

  it('names what is wrong with a schedule', () => {
    expect(schedulesProblem(['0 * * * *', amsterdam])).toBeNull()
    expect(schedulesProblem(['0 * * *'])).toContain('five fields')
    expect(schedulesProblem([{ cron: '0 8 * * *', timezone: 'Europe/Amsterdm' }])).toBe(
      '"Europe/Amsterdm" is not a timezone',
    )
    expect(schedulesProblem(['0 8 * * 0'])).toContain('1 is Sunday')
    expect(schedulesProblem(['0 * * * *', { cron: '0 * * * *', params: { a: 1 } }])).toBe(
      'The schedule "0 * * * *" is listed twice',
    )
  })
})

describe('the generated scheduled handler', () => {
  it('is absent when nothing is scheduled', () => {
    expect(scheduledEmission({ schedules: [], fallback: 'start-workflow' })).toBeNull()
    const bundle = generateWorkflowBundle(workflowIr)
    expect(providerEntrySource(bundle)).not.toContain('scheduled')
    expect(bundle.files.map((file) => file.path)).not.toContain('awaitstep/schedule.ts')
  })

  it('starts the workflow with the schedule’s params when the project has no handler', () => {
    const bundle = generateWorkflowBundle(workflowIr, {
      schedules: configSchedules([{ cron: '0 * * * *', params: { source: 'hourly' } }]),
    })
    const entry = providerEntrySource(bundle)
    expect(entry).toContain('async scheduled(controller: ScheduledController, env: Env')
    expect(entry).toContain('await awaitstepStartWorkflow(env, schedule.params ?? {});')
    expect(entry).toContain('startWorkflow as awaitstepStartWorkflow')
    expect(entry).toContain('"source": "hourly"')
    // Only UTC schedules: the worker compares strings and ships no schedule rules.
    expect(entry).toContain('|| schedule.cron === cron')
    expect(entry).not.toContain('awaitstepIsDue')
    expect(bundle.files.map((file) => file.path)).not.toContain('awaitstep/schedule.ts')
  })

  it('ships the schedule rules when a schedule is in another timezone', () => {
    const bundle = generateWorkflowBundle(workflowIr, { schedules: configSchedules([amsterdam]) })
    const entry = providerEntrySource(bundle)
    expect(entry).toContain(
      'import { isDue as awaitstepIsDue, parseCron as awaitstepParseCron } from "#awaitstep/schedule";',
    )
    const rules = bundle.files.find((file) => file.path === 'awaitstep/schedule.ts')!.source
    expect(rules).toContain('export function isDue(')
    expect(rules).not.toMatch(/^import /m)
  })

  it('hands every declared schedule to the project’s own handler, params included', () => {
    const bundle = generateWorkflowBundle(
      {
        ...workflowIr,
        runtime: {
          files: [{ path: 'handlers/scheduled.ts', source: 'export default async () => {}' }],
        },
      },
      { schedules: configSchedules([amsterdam]) },
    )
    const entry = providerEntrySource(bundle)
    expect(entry).toContain('await $$scheduledHandler({')
    expect(entry).toContain('cron: schedule.cron,')
    expect(entry).toContain('...(schedule.params !== undefined && { params: schedule.params }),')
    expect(entry).not.toContain('awaitstepStartWorkflow(env, schedule.params')
    expect(entry.match(/scheduled[:(]/g)).toHaveLength(1)
  })

  it('leaves a cron an annotation names to that annotation', () => {
    const triggerCode = `@fetch function handler(request, env) {
  return new Response("ok");
}

@scheduled function nightly(controller, env, ctx) {
  @crons ["0 2 * * *"]
  await env.WORKFLOW.create({ params: { from: "annotation" } });
}`
    const entry = providerEntrySource(
      generateWorkflowBundle(workflowIr, {
        triggerCode,
        schedules: configSchedules(['0 2 * * *', '0 5 * * *']),
      }),
    )
    expect(entry).toContain('case "0 2 * * *":')
    expect(entry).toContain('"cron": "0 5 * * *"')
    expect(entry).not.toContain('"cron": "0 2 * * *"')
    expect(entry.match(/async scheduled\(/g)).toHaveLength(1)
  })

  it('calls a function’s own fetch handler', () => {
    const entry = providerEntrySource(
      generateScriptBundle(functionIr, { schedules: configSchedules(['0 * * * *']) }),
    )
    expect(entry).toContain('const awaitstepHandlers = {')
    expect(entry).toContain('export default awaitstepHandlers;')
    expect(entry).toContain('await awaitstepScheduledCall(schedule.params, env, ctx);')
    // Unscheduled, the entry is what it always was.
    expect(providerEntrySource(generateScriptBundle(functionIr))).toContain('export default {')
  })
})

/** Builds the function with real wrangler and fires its `scheduled` in workerd. */
async function fire(
  schedules: Parameters<typeof configSchedules>[0],
  fires: { cron: string; at: string }[],
  files: { path: string; source: string }[],
): Promise<{ outcomes: string[]; seen: unknown[] }> {
  const declared = configSchedules(schedules)
  const bundle = generateScriptBundle(
    { ...functionIr, runtime: { files } },
    { schedules: declared },
  )
  const build = await new NodeWranglerDeployer().build(bundle, {
    kind: 'script',
    workflowId: 'scheduled-fn',
    workflowName: 'Fn',
    compatibilityDate: '2026-01-01',
    cronTriggers: scheduleCrons(declared),
  })
  const config = build.wranglerConfig as {
    compatibility_date: string
    compatibility_flags?: string[]
  }
  const mf = new Miniflare({
    modules: build.modules.map((module) => ({
      type: 'ESModule' as const,
      path: module.name,
      contents: new TextDecoder().decode(module.content),
    })),
    compatibilityDate: config.compatibility_date,
    compatibilityFlags: config.compatibility_flags ?? [],
    kvNamespaces: ['SEEN'],
  })
  try {
    const worker = await mf.getWorker()
    const outcomes: string[] = []
    for (const { cron, at } of fires) {
      const result = await worker.scheduled({ cron, scheduledTime: new Date(at) })
      outcomes.push(result.outcome)
    }
    const kv = await mf.getKVNamespace('SEEN')
    const { keys } = await kv.list()
    const seen = await Promise.all(keys.map(async (key) => JSON.parse((await kv.get(key.name))!)))
    return { outcomes, seen }
  } finally {
    await mf.dispose()
  }
}

describe('a deployed function’s schedules, run in workerd', () => {
  const record = `export default async ({ request, env }) => {
  const body = await request.text();
  if (body.includes("fail")) return new Response("no", { status: 500 });
  await env.SEEN.put(crypto.randomUUID(), JSON.stringify({ via: "fetch", body: body ? JSON.parse(body) : null }));
  return new Response("ok");
}`

  it('calls the function at the local time, with the params as the body', async () => {
    const { outcomes, seen } = await fire(
      [amsterdam, { cron: '30 6 * * *', params: { utc: true } }, '15 6 * * *'],
      [
        // 08:00 in Amsterdam is 07:00 UTC in winter; 06:00 UTC is not it.
        { cron: '* * * * *', at: '2026-01-10T06:00:00Z' },
        { cron: '* * * * *', at: '2026-01-10T07:00:00Z' },
        { cron: '* * * * *', at: '2026-01-10T07:01:00Z' },
        { cron: '30 6 * * *', at: '2026-01-10T06:30:00Z' },
        { cron: '15 6 * * *', at: '2026-01-10T06:15:00Z' },
      ],
      [{ path: 'handlers/fetch.ts', source: record }],
    )
    expect(outcomes).toEqual(['ok', 'ok', 'ok', 'ok', 'ok'])
    expect(seen).toHaveLength(3)
    expect(seen).toEqual(
      expect.arrayContaining([
        { via: 'fetch', body: { shift: 'day' } },
        { via: 'fetch', body: { utc: true } },
        { via: 'fetch', body: null },
      ]),
    )
  }, 120_000)

  it('reports a failed call, and still runs the other schedules due in that minute', async () => {
    const { outcomes, seen } = await fire(
      [
        { cron: '0 8 * * *', timezone: 'Europe/Amsterdam', params: { fail: true } },
        { cron: '0 16 * * *', timezone: 'Asia/Tokyo', params: { city: 'tokyo' } },
      ],
      [{ cron: '* * * * *', at: '2026-01-10T07:00:00Z' }],
      [{ path: 'handlers/fetch.ts', source: record }],
    )
    expect(outcomes).toEqual(['exception'])
    expect(seen).toEqual([{ via: 'fetch', body: { city: 'tokyo' } }])
  }, 120_000)

  it('runs one schedule alone when it is named with its timezone', async () => {
    const { outcomes, seen } = await fire(
      [
        amsterdam,
        { cron: '0 16 * * *', timezone: 'Asia/Tokyo', params: { city: 'tokyo' } },
        { cron: '0 7 * * *', params: { utc: true } },
      ],
      [
        // All three are due at 07:00 UTC; each name fires its own only.
        { cron: 'Asia/Tokyo 0 16 * * *', at: '2026-01-10T07:00:00Z' },
        { cron: 'UTC 0 7 * * *', at: '2026-01-10T07:00:00Z' },
        // Named at another time, it still runs: the caller kept the time.
        { cron: 'Europe/Amsterdam 0 8 * * *', at: '2026-01-10T09:30:00Z' },
      ],
      [{ path: 'handlers/fetch.ts', source: record }],
    )
    expect(outcomes).toEqual(['ok', 'ok', 'ok'])
    expect(seen).toHaveLength(3)
    expect(seen).toEqual(
      expect.arrayContaining([
        { via: 'fetch', body: { city: 'tokyo' } },
        { via: 'fetch', body: { utc: true } },
        { via: 'fetch', body: { shift: 'day' } },
      ]),
    )
  }, 120_000)

  it('gives the project’s own handler the schedule that is due, not the trigger', async () => {
    const own = `export default async ({ cron, params, scheduledTime, env }) => {
  await env.SEEN.put(crypto.randomUUID(), JSON.stringify({ cron, params: params ?? null, scheduledTime }));
}`
    const { outcomes, seen } = await fire(
      [amsterdam],
      [
        // The clocks go forward on 29 March 2026: 08:00 is 06:00 UTC from then.
        { cron: '* * * * *', at: '2026-03-30T06:00:00Z' },
        { cron: '* * * * *', at: '2026-03-30T07:00:00Z' },
      ],
      [{ path: 'handlers/scheduled.ts', source: own }],
    )
    expect(outcomes).toEqual(['ok', 'ok'])
    expect(seen).toEqual([
      {
        cron: '0 8 * * *',
        params: { shift: 'day' },
        scheduledTime: Date.parse('2026-03-30T06:00:00Z'),
      },
    ])
  }, 120_000)
})
