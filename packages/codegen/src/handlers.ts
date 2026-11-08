/**
 * The neutral handler contract shared by providers: a handler module is a
 * plain ES module with a default export, written against the runtime
 * contexts (`FetchContext`, `QueueContext`, `ScheduledContext`). Providers
 * adapt their own entry shape to it.
 */

export type HandlerTarget = 'workflow' | 'script'

const WORKFLOW_FETCH_SCAFFOLD = `import { startWorkflow, workflowStatus } from "#awaitstep/workflow";
import type { FetchContext } from "#awaitstep/runtime";

// HTTP entry: POST starts a workflow instance, GET ?instanceId= reports its status.
export default async function ({ request, env }: FetchContext<Env>): Promise<Response> {
  try {
    const url = new URL(request.url);

    if (request.method === "POST") {
      const params = await request.json().catch(() => undefined);
      return Response.json(await startWorkflow(env, params));
    }

    const instanceId = url.searchParams.get("instanceId");
    if (instanceId) {
      const status = await workflowStatus(env, instanceId);
      if (!status) {
        return Response.json({ message: "Instance not found" }, { status: 404 });
      }
      return Response.json(status);
    }

    return new Response(null, { status: 200 });
  } catch (error) {
    return Response.json({ message: error.message }, { status: 500 });
  }
}
`

const SCRIPT_FETCH_SCAFFOLD = `import { runGraph } from "#awaitstep/function";
import type { FetchContext } from "#awaitstep/runtime";

// HTTP entry: runs the graph with the request body as payload and returns its outputs.
export default async function ({ request, env }: FetchContext<Env>): Promise<Response> {
  try {
    if (request.method !== "POST") {
      return new Response(null, { status: 200 });
    }
    const params = await request.json().catch(() => undefined);
    const graph = await runGraph(env, { payload: params });
    return Response.json(graph);
  } catch (error) {
    return Response.json({ message: error.message }, { status: 500 });
  }
}
`

const SCHEDULED_SCAFFOLD = `import type { ScheduledContext } from "#awaitstep/runtime";

// Runs on every cron trigger of this workflow; \`cron\` tells them apart.
export default async function ({ cron, scheduledTime, env }: ScheduledContext<Env>): Promise<void> {
  // ...
}
`

/**
 * A new handler module's starting source. `Env` is the ambient interface the
 * workspace declares for the workflow; the deploy strips the types.
 */
export function handlerModuleScaffold(
  entry:
    | { kind: 'fetch'; target: HandlerTarget }
    | { kind: 'scheduled' }
    | { kind: 'queue'; queue: string },
): string {
  switch (entry.kind) {
    case 'fetch':
      return entry.target === 'script' ? SCRIPT_FETCH_SCAFFOLD : WORKFLOW_FETCH_SCAFFOLD
    case 'scheduled':
      return SCHEDULED_SCAFFOLD
    case 'queue':
      return `import type { QueueContext } from "#awaitstep/runtime";

// Consumer for the "${entry.queue}" queue. Per-queue settings (batch size,
// retries, dead-letter queue) live in the deployment config. Throw to have
// the batch retried.
export default async function ({ batch, env }: QueueContext<Env>): Promise<void> {
  for (const message of batch.messages) {
    // process message.body
  }
}
`
  }
}
