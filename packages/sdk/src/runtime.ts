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
  /** Total attempts, including the first. */
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
 * The authoring context a workflow's `run` receives.
 *
 * - `env` and `event` are the run's environment and trigger event.
 * - `step` is the only durable unit: state written inside it is persisted and
 *   the callback is retried according to its config.
 * - `sleep`, `sleepUntil` and `waitForEvent` are durable waits, not timers.
 */
export interface WorkflowContext<Env = Record<string, unknown>, Payload = unknown> {
  readonly env: Env
  readonly event: WorkflowEvent<Payload>
  step<T>(name: string, fn: StepCallback<T>): Promise<T>
  step<T>(name: string, config: StepConfig, fn: StepCallback<T>): Promise<T>
  sleep(name: string, duration: Duration): Promise<void>
  sleepUntil(name: string, at: Date | number | string): Promise<void>
  waitForEvent<T = unknown>(name: string, options: WaitForEventOptions): Promise<T>
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
export interface WorkflowHost {
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
 * Declares a workflow. Identity at the moment — it exists so the authoring
 * surface has one entry point to type, generate, and later read IR from.
 */
export function defineWorkflow<Env = Record<string, unknown>, Payload = unknown>(
  definition: WorkflowDefinition<Env, Payload>,
): WorkflowDefinition<Env, Payload> {
  return definition
}

/** The execution context a function handler receives. */
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
}

/** Context for a function's `scheduled` handler. */
export interface ScheduledContext<Env = Record<string, unknown>> {
  readonly cron: string
  readonly scheduledTime: number
  readonly env: Env
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
