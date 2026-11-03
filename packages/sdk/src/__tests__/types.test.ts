/**
 * Compile-time checks for the authoring surface. Nothing here is called; the
 * package's `type-check` fails if a signature drifts.
 */
import type {
  FetchContext,
  FunctionDefinition,
  QueueContext,
  ScheduledContext,
  StepConfig,
  WaitForEventOptions,
  WorkflowContext,
  WorkflowDefinition,
  WorkflowEvent,
} from '../runtime.js'

interface Env {
  API_KEY: string
  USERS: { get(key: string): Promise<string | null> }
}

interface Payload {
  orderId: string
}

export function workflowTypes(flow: WorkflowContext<Env, Payload>): void {
  const plain: Promise<number> = flow.step('count', async () => 1)
  const configured: Promise<string> = flow.step(
    'name',
    { retries: { limit: 3, delay: '5 seconds', backoff: 'exponential' }, timeout: '1 minute' },
    async (ctx) => `${ctx.attempt}`,
  )
  const env: Env = flow.env
  const event: WorkflowEvent<Payload> = flow.event
  const orderId: string = event.payload.orderId
  const sleep: Promise<void> = flow.sleep('pause', 1000)
  const sleepUntil: Promise<void> = flow.sleepUntil('resume', new Date())
  const eventValue: Promise<{ approved: boolean }> = flow.waitForEvent<{ approved: boolean }>(
    'approval',
    { type: 'lead.approved', timeout: '1 hour', match: 'data.id == "1"' },
  )
  void [plain, configured, env, event, orderId, sleep, sleepUntil, eventValue]
}

export function definitionTypes(): WorkflowDefinition<Env, Payload> {
  return {
    id: 'lead-enrichment',
    run: async (flow) => {
      await flow.step('ns', async () => flow.env.API_KEY)
      return { done: true }
    },
  }
}

export function hostConfigTypes(): StepConfig {
  return { retries: { limit: 2, delay: '1 second' }, timeout: 5000 }
}

export function waitOptionsTypes(): WaitForEventOptions {
  return { type: 'evt', timeout: '1 hour' }
}

export function functionTypes(): FunctionDefinition<Env> {
  return {
    id: 'webhook',
    fetch: (ctx: FetchContext<Env>) => new Response(ctx.env.API_KEY),
    queue: (ctx: QueueContext<Env>) => {
      const queue: string = ctx.batch.queue
      const id: string = ctx.batch.messages[0]?.id ?? ''
      void [queue, id]
    },
    scheduled: (ctx: ScheduledContext<Env>) => {
      const cron: string = ctx.cron
      void cron
    },
  }
}
