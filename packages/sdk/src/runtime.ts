/**
 * AwaitStep workflow primitives — the authoring surface for a workflow or a
 * function.
 *
 * This module is deliberately provider-agnostic and dependency-free: it is
 * copied verbatim into every generated bundle as `awaitstep/runtime.ts` and
 * imported through `#awaitstep/runtime`. Provider behaviour arrives through a
 * {@link WorkflowHost}, one small adapter per runtime (Cloudflare Workflows
 * today; Inngest and Temporal are the next ones).
 */

/** A duration in milliseconds, or a runtime-readable string such as `"10 seconds"`. */
export type Duration = number | string

/** Backoff algorithm between retry attempts. */
export type RetryBackoff = 'constant' | 'linear' | 'exponential'

/** Retry policy for one durable step. */
export interface RetryConfig {
  /** Retries after the first attempt — `limit + 1` attempts in all, as Cloudflare reads it. */
  limit: number
  /** Delay between attempts. */
  delay: Duration
  /** Backoff algorithm between attempts. */
  backoff?: RetryBackoff
}

/** Durability settings for one durable step. */
export interface StepConfig {
  retries?: RetryConfig
  /** Per-attempt timeout. */
  timeout?: Duration
}

/** Per-attempt context passed to a step callback. */
export interface StepAttempt {
  /** Current attempt number, starting at 1. */
  attempt: number
}

/** The event a workflow run was started with. */
export interface WorkflowEvent<T = unknown> {
  /** Trigger payload. */
  readonly payload: T
  /** When the run was created. */
  readonly timestamp: Date
  /** Unique identifier of this run. */
  readonly instanceId: string
}

/** Options for {@link WorkflowContext.waitForEvent}. */
export interface WaitForEventOptions {
  /** Event type to wait for. */
  readonly type: string
  /** How long to wait before the step fails. */
  readonly timeout?: Duration
  /** Provider-specific match expression, where the runtime supports one. */
  readonly match?: string
}

/** A durable step's body: it receives the current attempt. */
export type StepCallback<T> = (ctx: StepAttempt) => T | Promise<T>

/**
 * A call to another deployed workflow. `workflow` is the provider's workflow
 * identity; `exportName` names the exported workflow where the provider has
 * one. `params` carries provider-scoped settings under a provider key, for
 * example `{ cf: { binding: "ONBOARDING" } }`; a provider reads only its own.
 */
export interface WorkflowCallOptions {
  readonly workflow: string
  readonly exportName?: string
  readonly input?: unknown
  readonly waitForCompletion?: boolean
  readonly timeout?: Duration
  readonly params?: Record<string, unknown>
}

/** A call to another deployed function/script. `params` is provider-scoped. */
export interface ScriptCallOptions {
  readonly script: string
  readonly method?: string
  readonly url?: string
  readonly headers?: Record<string, string>
  readonly body?: unknown
  readonly params?: Record<string, unknown>
}

/** The handle of a started workflow instance. */
export interface WorkflowInstance {
  readonly instanceId: string
}

/** One provider status reading for a workflow instance. */
export interface WorkflowStatus {
  /** Provider status word (`running`, `complete`, `errored`, …). */
  readonly status: string
  readonly output?: unknown
  readonly error?: { readonly message?: string }
}

/**
 * The cross-artifact half of a provider adapter: start another workflow, read
 * its status, or call another deployed function. A generated workflow reaches
 * these through `flow`; a provider bootstrap implements them over its own
 * primitives.
 */
export interface PlatformHost {
  startWorkflow(options: WorkflowCallOptions): Promise<WorkflowInstance>
  workflowStatus(instanceId: string, options: WorkflowCallOptions): Promise<WorkflowStatus>
  callScript(options: ScriptCallOptions): Promise<unknown>
}

/**
 * The authoring context a workflow's `run` receives.
 *
 * - `env` and `event` are the run's environment and trigger event.
 * - `step` is the only durable unit: state written inside it is persisted and
 *   the callback is retried according to its config.
 * - `sleep`, `sleepUntil` and `waitForEvent` are durable waits, not timers.
 * - `startWorkflow`, `workflowStatus` and `callScript` are provider calls to
 *   other deployed artifacts; the provider adapter supplies them.
 */
export interface WorkflowContext<Env = Record<string, unknown>, Payload = unknown> {
  readonly env: Env
  readonly event: WorkflowEvent<Payload>
  step<T>(name: string, fn: StepCallback<T>): Promise<T>
  step<T>(name: string, config: StepConfig, fn: StepCallback<T>): Promise<T>
  sleep(name: string, duration: Duration): Promise<void>
  sleepUntil(name: string, at: Date | number | string): Promise<void>
  waitForEvent<T = unknown>(name: string, options: WaitForEventOptions): Promise<T>
  startWorkflow(options: WorkflowCallOptions): Promise<WorkflowInstance>
  workflowStatus(instanceId: string, options: WorkflowCallOptions): Promise<WorkflowStatus>
  callScript(options: ScriptCallOptions): Promise<unknown>
}

/** One generated workflow. */
export interface WorkflowDefinition<Env = Record<string, unknown>, Payload = unknown> {
  /**
   * Stable identity: the provider's workflow name and the deploy's class name.
   * Keep it stable across renames — it is how a provider recognises the
   * workflow.
   */
  readonly id: string
  /** The durable body. */
  readonly run: (flow: WorkflowContext<Env, Payload>) => Promise<unknown>
}

/**
 * The provider half of the contract: what a runtime has to be able to do.
 * One small adapter implements it per provider.
 */
export interface WorkflowHost extends PlatformHost {
  do<T>(name: string, config: StepConfig | undefined, fn: StepCallback<T>): Promise<T>
  sleep(name: string, duration: Duration): Promise<void>
  sleepUntil(name: string, at: Date | number): Promise<void>
  waitForEvent<T>(name: string, options: WaitForEventOptions): Promise<T>
}

/** What {@link createWorkflowContext} needs from a provider bootstrap. */
export interface WorkflowContextInput<Env, Payload> {
  env: Env
  event: WorkflowEvent<Payload>
  host: WorkflowHost
}

/**
 * Builds the authoring context a workflow's `run` receives. Provider
 * bootstraps call this with their host; generated workflow code never does.
 */
export function createWorkflowContext<Env, Payload>(
  input: WorkflowContextInput<Env, Payload>,
): WorkflowContext<Env, Payload> {
  const { env, event, host } = input
  const step = (async (
    name: string,
    configOrCallback: StepConfig | StepCallback<unknown>,
    maybeCallback?: StepCallback<unknown>,
  ): Promise<unknown> => {
    const config = typeof configOrCallback === 'function' ? undefined : configOrCallback
    const callback = typeof configOrCallback === 'function' ? configOrCallback : maybeCallback
    if (typeof callback !== 'function') {
      throw new TypeError(`Workflow step "${name}" was called without a callback`)
    }
    return host.do(name, config, callback)
  }) as WorkflowContext<Env, Payload>['step']

  return {
    env,
    event,
    step,
    sleep: (name, duration) => host.sleep(name, duration),
    sleepUntil: async (name, at) => host.sleepUntil(name, toDate(name, at)),
    waitForEvent: (name, options) => host.waitForEvent(name, options),
    startWorkflow: (options) => host.startWorkflow(options),
    workflowStatus: (instanceId, options) => host.workflowStatus(instanceId, options),
    callScript: (options) => host.callScript(options),
  }
}

function toDate(name: string, at: Date | number | string): Date | number {
  if (typeof at !== 'string') return at
  const parsed = new Date(at)
  if (Number.isNaN(parsed.getTime())) {
    throw new TypeError(`Workflow sleep "${name}" has an invalid date: "${at}"`)
  }
  return parsed
}

/**
 * Whether a rejection is a wait timeout. Cloudflare keeps the error name
 * locally but serializes it into the message across the runtime boundary, so
 * both forms are recognised.
 */
export function isWorkflowTimeoutError(error: unknown): boolean {
  if (error instanceof Error) {
    return error.name === 'WorkflowTimeoutError' || error.message.includes('WorkflowTimeoutError')
  }
  if (typeof error !== 'object' || error === null) return false
  const { name, message } = error as { name?: unknown; message?: unknown }
  return (
    name === 'WorkflowTimeoutError' ||
    (typeof message === 'string' && message.includes('WorkflowTimeoutError'))
  )
}

/** The `step` object step code already uses (`step.do`, `step.sleep`, …). */
export interface DurableStep {
  do<T>(name: string, fn: StepCallback<T>): Promise<T>
  do<T>(name: string, config: StepConfig, fn: StepCallback<T>): Promise<T>
  sleep(name: string, duration: Duration): Promise<void>
  sleepUntil(name: string, at: Date | number | string): Promise<void>
  waitForEvent<T = unknown>(name: string, options: WaitForEventOptions): Promise<T>
}

/**
 * Adapts a workflow context to the `step.do`/`step.sleep` shape inline code
 * and generated step modules already use.
 */
export function durableStep<Env, Payload>(flow: WorkflowContext<Env, Payload>): DurableStep {
  const doStep = ((
    name: string,
    configOrCallback: StepConfig | StepCallback<unknown>,
    maybeCallback?: StepCallback<unknown>,
  ): Promise<unknown> => {
    if (typeof configOrCallback === 'function') {
      return flow.step(name, configOrCallback)
    }
    if (typeof maybeCallback !== 'function') {
      throw new TypeError(`Workflow step "${name}" was called without a callback`)
    }
    return flow.step(name, configOrCallback, maybeCallback)
  }) as DurableStep['do']

  return {
    do: doStep,
    sleep: (name, duration) => flow.sleep(name, duration),
    sleepUntil: (name, at) => flow.sleepUntil(name, at),
    waitForEvent: (name, options) => flow.waitForEvent(name, options),
  }
}

/**
 * The in-request half of the contract, for a function: a `fetch` handler has
 * no durable runtime, so a step's body runs right here. The host still gives
 * the body what a step has — `ctx.attempt`, the node's retries (delay and
 * backoff between attempts) and its per-attempt timeout — but nothing is
 * persisted, and nothing retries unless the node asks: a request cannot
 * wait minutes the way a durable step can. Attempts are capped at
 * {@link INLINE_MAX_ATTEMPTS} and every wait — a backoff pause, a timeout —
 * at {@link INLINE_MAX_WAIT_MS}, so no node setting can hold a request for
 * long or burn its CPU in a retry loop. A timed-out attempt is abandoned,
 * not aborted: with retries, the next attempt may run while it still does.
 * The durable waits (`sleep`, `sleepUntil`, `waitForEvent`) reject;
 * validation keeps those nodes out of a function, this covers a hand-written
 * call.
 */
export function createInlineHost(platform?: PlatformHost): WorkflowHost {
  return {
    startWorkflow(options: WorkflowCallOptions): Promise<WorkflowInstance> {
      if (platform) return platform.startWorkflow(options)
      return Promise.reject(notInFunction('startWorkflow', options.workflow))
    },
    workflowStatus(instanceId: string, options: WorkflowCallOptions): Promise<WorkflowStatus> {
      if (platform) return platform.workflowStatus(instanceId, options)
      return Promise.reject(notInFunction('workflowStatus', options.workflow))
    },
    callScript(options: ScriptCallOptions): Promise<unknown> {
      if (platform) return platform.callScript(options)
      return Promise.reject(notInFunction('callScript', options.script))
    },
    async do<T>(name: string, config: StepConfig | undefined, fn: StepCallback<T>): Promise<T> {
      // `limit` counts retries, as on Cloudflare: `limit + 1` attempts in all,
      // capped — a request is not the place for a long campaign.
      const retries = config?.retries
      const attempts = Math.min(
        INLINE_MAX_ATTEMPTS,
        1 + Math.max(0, Math.floor(retries?.limit ?? 0)),
      )
      // Both durations are read before the first attempt, so a setting the
      // host cannot read is the error — not the body's first failure.
      const timeout =
        config?.timeout === undefined
          ? undefined
          : Math.min(INLINE_MAX_WAIT_MS, durationMs(name, config.timeout))
      const delay = retries === undefined ? 0 : durationMs(name, retries.delay)
      for (let attempt = 1; ; attempt++) {
        try {
          return await withTimeout(name, timeout, () => fn({ attempt }))
        } catch (err) {
          if (attempt >= attempts || retries === undefined) throw err
          await pause(Math.min(INLINE_MAX_WAIT_MS, backoffMs(delay, retries.backoff, attempt)))
        }
      }
    },
    sleep(name: string): Promise<void> {
      return Promise.reject(notInFunction('sleep', name))
    },
    sleepUntil(name: string): Promise<void> {
      return Promise.reject(notInFunction('sleepUntil', name))
    },
    waitForEvent<T>(name: string): Promise<T> {
      return Promise.reject(notInFunction('waitForEvent', name))
    },
  }
}

/** The most attempts an in-request step makes, whatever its `retries.limit`. */
export const INLINE_MAX_ATTEMPTS = 10
/** The longest an in-request step waits for one backoff pause or one attempt. */
export const INLINE_MAX_WAIT_MS = 30_000

function notInFunction(primitive: string, name: string): Error {
  return new Error(
    `Step "${name}": ${primitive} is not available in a function — it needs a workflow's durable runtime`,
  )
}

function pause(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function withTimeout<T>(
  name: string,
  ms: number | undefined,
  run: () => T | Promise<T>,
): Promise<T> {
  if (ms === undefined) return await run()
  let timer: ReturnType<typeof setTimeout> | undefined
  const expired = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`Step "${name}" timed out after ${ms} ms`)), ms)
  })
  try {
    return await Promise.race([Promise.resolve().then(run), expired])
  } finally {
    if (timer !== undefined) clearTimeout(timer)
  }
}

/** The wait before the next attempt, once attempt `attempt` has failed. */
function backoffMs(base: number, backoff: RetryBackoff | undefined, attempt: number): number {
  switch (backoff) {
    case 'linear':
      return base * attempt
    case 'exponential':
      return base * 2 ** (attempt - 1)
    default:
      return base
  }
}

const DURATION =
  /^\s*(\d+(?:\.\d+)?)\s*(ms|milliseconds?|s|secs?|seconds?|m|mins?|minutes?|h|hours?|d|days?|w|weeks?)\s*$/i
const UNIT_MS: Record<string, number> = {
  ms: 1,
  s: 1000,
  m: 60_000,
  h: 3_600_000,
  d: 86_400_000,
  w: 604_800_000,
}

/** A duration as the step config spells it (`"10 seconds"`, `500`), in milliseconds. */
function durationMs(name: string, value: Duration): number {
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || value < 0) {
      throw new TypeError(`Step "${name}": invalid duration ${value}`)
    }
    return value
  }
  const match = DURATION.exec(value)
  if (!match) throw new TypeError(`Step "${name}": unrecognised duration "${value}"`)
  const unit = match[2]!.toLowerCase()
  const key = unit.startsWith('m') && (unit === 'ms' || unit.startsWith('milli')) ? 'ms' : unit[0]!
  return Number(match[1]) * UNIT_MS[key]!
}

/**
 * Declares a workflow. Identity at the moment — it exists so the authoring
 * surface has one entry point to type, generate, and later read IR from.
 */
export function defineWorkflow<Env = Record<string, unknown>, Payload = unknown>(
  definition: WorkflowDefinition<Env, Payload>,
): WorkflowDefinition<Env, Payload> {
  return definition
}

/** The execution context every handler receives: work kept alive past the handler's return. */
export interface ExecutionContextLike {
  waitUntil(promise: Promise<unknown>): void
}

/** Context for a function's `fetch` handler. */
export interface FetchContext<Env = Record<string, unknown>> {
  readonly request: Request
  readonly env: Env
  readonly execution: ExecutionContextLike
}

/** One message in a queue batch, reduced to what a portable handler may rely on. */
export interface QueueMessage {
  readonly id: string
  readonly body: unknown
}

/** One batch delivered to a function's `queue` handler. */
export interface QueueBatch {
  readonly queue: string
  readonly messages: readonly QueueMessage[]
}

/** Context for a function's `queue` handler. */
export interface QueueContext<Env = Record<string, unknown>> {
  readonly batch: QueueBatch
  readonly env: Env
  readonly execution: ExecutionContextLike
}

/** Context for a function's `scheduled` handler. */
export interface ScheduledContext<Env = Record<string, unknown>> {
  readonly cron: string
  readonly scheduledTime: number
  readonly env: Env
  readonly execution: ExecutionContextLike
}

export type FetchHandler<Env = Record<string, unknown>> = (
  ctx: FetchContext<Env>,
) => Response | Promise<Response>
export type QueueHandler<Env = Record<string, unknown>> = (
  ctx: QueueContext<Env>,
) => void | Promise<void>
export type ScheduledHandler<Env = Record<string, unknown>> = (
  ctx: ScheduledContext<Env>,
) => void | Promise<void>

/** One generated function: a plain worker with request/queue/schedule handlers. */
export interface FunctionDefinition<Env = Record<string, unknown>> {
  readonly id: string
  readonly fetch?: FetchHandler<Env>
  readonly queue?: QueueHandler<Env>
  readonly scheduled?: ScheduledHandler<Env>
}

/** Declares a function. Identity at the moment, like {@link defineWorkflow}. */
export function defineFunction<Env = Record<string, unknown>>(
  definition: FunctionDefinition<Env>,
): FunctionDefinition<Env> {
  return definition
}
