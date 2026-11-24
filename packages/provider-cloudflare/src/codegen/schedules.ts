import {
  sameSchedule,
  scheduleOf,
  scheduleProblemIn,
  type Schedule,
  type ScheduleEntry,
} from '@awaitstep/ir'
import type { GeneratedFile } from '@awaitstep/codegen'
import { SCHEDULE_RUNTIME_SOURCE } from '../runtime/schedule-source.js'

// Schedules on Cloudflare. A Cron Trigger runs in UTC and hands the worker
// the expression that fired, so an entry in UTC is its own trigger. An entry
// in another timezone has no trigger of its own: one every-minute trigger is
// deployed and the generated `scheduled` asks, each minute, which of those
// entries are due on their own clock.

/** The trigger that drives every entry in a timezone other than UTC. */
export const SCHEDULE_TICK = '* * * * *'

export const SCHEDULE_MODULE_PATH = 'awaitstep/schedule.ts'
const SCHEDULE_MODULE_IMPORT = '#awaitstep/schedule'

/** The schedules a deployment config declares, each once. */
export function configSchedules(entries: readonly ScheduleEntry[] | undefined): Schedule[] {
  const schedules: Schedule[] = []
  for (const entry of entries ?? []) {
    const schedule = scheduleOf(entry)
    if (!schedules.some((known) => sameSchedule(known, schedule))) schedules.push(schedule)
  }
  return schedules
}

/** The first thing wrong with the declared schedules, or null. */
export function schedulesProblem(entries: readonly ScheduleEntry[] | undefined): string | null {
  const seen: Schedule[] = []
  for (const entry of entries ?? []) {
    const problem = scheduleProblemIn(entry)
    if (problem) return problem
    const schedule = scheduleOf(entry)
    if (seen.some((known) => sameSchedule(known, schedule))) {
      return `The schedule "${schedule.cron}" is listed twice`
    }
    seen.push(schedule)
  }
  return null
}

const zoned = (schedule: Schedule) => schedule.timezone !== 'UTC'

/** The Cron Triggers that drive these schedules. */
export function scheduleCrons(schedules: readonly Schedule[]): string[] {
  const crons: string[] = []
  for (const schedule of schedules) {
    const cron = zoned(schedule) ? SCHEDULE_TICK : schedule.cron
    if (!crons.includes(cron)) crons.push(cron)
  }
  return crons
}

/** What runs when a schedule fires and the project has no handler of its own. */
export type DefaultScheduleRun = 'start-workflow' | 'call-function'

export interface ScheduledEmission {
  /** Module-level code: the schedule table and the function that reads it. */
  helpers: string
  /** Statements at the top of `scheduled(controller, env, ctx)`. */
  body: string
  imports: string[]
  files: GeneratedFile[]
}

/**
 * The generated half of `scheduled`: finds the declared schedules a trigger
 * stands for and runs each through the project's handler (`handler`, an
 * identifier in scope) or, without one, the default for the kind.
 */
export function scheduledEmission(input: {
  schedules: readonly Schedule[]
  handler?: string
  fallback: DefaultScheduleRun
}): ScheduledEmission | null {
  const { schedules } = input
  if (schedules.length === 0) return null
  const hasZoned = schedules.some(zoned)
  const table = schedules.map((schedule) => ({
    cron: schedule.cron,
    timezone: schedule.timezone,
    ...(schedule.params !== undefined && { params: schedule.params }),
  }))
  // A schedule can also be named outright, timezone first ("UTC 0 8 * * *"):
  // whatever keeps time for itself fires exactly the one it means.
  const named = 'cron === schedule.timezone + " " + schedule.cron'
  const due = hasZoned
    ? `(schedule) =>
    ${named} ||
    (schedule.timezone === "UTC"
      ? schedule.cron === cron
      : cron === ${JSON.stringify(SCHEDULE_TICK)} && awaitstepIsDue({ cron: awaitstepParseCron(schedule.cron), timeZone: schedule.timezone }, time))`
    : `(schedule) => ${named} || schedule.cron === cron`
  const helpers = `const AWAITSTEP_SCHEDULES: { cron: string; timezone: string; params?: unknown }[] = ${JSON.stringify(table, null, 2)};

/** The declared schedules the trigger that fired stands for. */
function awaitstepDueSchedules(cron: string, time: number) {
  return AWAITSTEP_SCHEDULES.filter(${due});
}`

  let run: string
  if (input.handler) {
    run = `await ${input.handler}({
        cron: schedule.cron,
        scheduledTime: controller.scheduledTime,
        ...(schedule.params !== undefined && { params: schedule.params }),
        env,
        execution: { waitUntil: (promise: Promise<unknown>) => ctx.waitUntil(promise) },
      });`
  } else if (input.fallback === 'start-workflow') {
    run = `await awaitstepStartWorkflow(env, schedule.params ?? {});`
  } else {
    run = `await awaitstepScheduledCall(schedule.params, env, ctx);`
  }
  // Every due schedule gets its turn: one that throws does not stop the rest.
  const body = `    const awaitstepFailures: unknown[] = [];
    for (const schedule of awaitstepDueSchedules(controller.cron, controller.scheduledTime)) {
      try {
        ${run}
      } catch (error) {
        awaitstepFailures.push(error);
      }
    }
    if (awaitstepFailures.length > 0) throw awaitstepFailures[0];`
  return {
    helpers,
    body,
    imports: hasZoned
      ? [
          `import { isDue as awaitstepIsDue, parseCron as awaitstepParseCron } from "${SCHEDULE_MODULE_IMPORT}";`,
        ]
      : [],
    files: hasZoned
      ? [
          {
            path: SCHEDULE_MODULE_PATH,
            source: `// Generated from @awaitstep/ir — do not edit.\n${SCHEDULE_RUNTIME_SOURCE}`,
            role: 'module',
          },
        ]
      : [],
  }
}

/**
 * The `scheduled` member of the entry's default export: the declared
 * schedules first, then the cases of any `@scheduled` annotations.
 */
export function scheduledMember(emission: ScheduledEmission | null, annotationCases = ''): string {
  const parts = [
    ...(emission ? [emission.body] : []),
    ...(annotationCases.length > 0
      ? [`    switch (controller.cron) {\n${annotationCases}\n    }`]
      : []),
  ]
  return `  async scheduled(controller: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
${parts.join('\n')}
  },`
}

/**
 * A function's default schedule run: its own fetch handler, called with the
 * schedule's params as the JSON body. `handlers` names the entry's default
 * export, in scope.
 */
export function scheduledCallHelper(handlers: string, hasFetch: boolean): string {
  if (!hasFetch) {
    return `async function awaitstepScheduledCall(_params: unknown, _env: Env, _ctx: ExecutionContext): Promise<void> {
  throw new Error("This function has no fetch handler for its schedule to call");
}`
  }
  return `async function awaitstepScheduledCall(params: unknown, env: Env, ctx: ExecutionContext): Promise<void> {
  const request = new Request("https://schedule.invalid/", {
    method: "POST",
    ...(params !== undefined && {
      headers: { "content-type": "application/json" },
      body: JSON.stringify(params),
    }),
  });
  const fetchHandler = ${handlers}.fetch as (request: Request, env: Env, ctx: ExecutionContext) => Response | Promise<Response>;
  const response = await fetchHandler(request, env, ctx);
  if (!response.ok) throw new Error(\`The scheduled call was answered with \${response.status}\`);
}`
}
