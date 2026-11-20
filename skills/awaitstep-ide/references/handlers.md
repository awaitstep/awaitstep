# Handler modules

The file is the entry; the deployment config says what triggers it.

| File                             | Entry                     |
| -------------------------------- | ------------------------- |
| `handlers/fetch.ts`              | HTTP request              |
| `handlers/scheduled.ts`          | cron trigger              |
| `handlers/queue/<queue-name>.ts` | message on that queue     |
| `handlers/shared.ts`             | not an entry; shared code |

Every file in `handlers/` that is not one of those is still allowed as a helper
(imported by an entry). Only look-alike entries are refused.

## The scaffolds

A workflow's `handlers/fetch.ts` (seeded on the first save):

```ts
import { startWorkflow, workflowStatus } from '#awaitstep/workflow'
import type { FetchContext } from '#awaitstep/runtime'

// HTTP entry: POST starts a workflow instance, GET ?instanceId= reports its status.
export default async function ({ request, env }: FetchContext<Env>): Promise<Response> {
  try {
    const url = new URL(request.url)
    if (request.method === 'POST') {
      const params = await request.json().catch(() => undefined)
      return Response.json(await startWorkflow(env, params))
    }
    const instanceId = url.searchParams.get('instanceId')
    if (instanceId) {
      const status = await workflowStatus(env, instanceId)
      if (!status) return Response.json({ message: 'Instance not found' }, { status: 404 })
      return Response.json(status)
    }
    return new Response(null, { status: 200 })
  } catch (error) {
    return Response.json({ message: error.message }, { status: 500 })
  }
}
```

A Function's `handlers/fetch.ts`:

```ts
import { runGraph } from '#awaitstep/function'
import type { FetchContext } from '#awaitstep/runtime'

export default async function ({ request, env }: FetchContext<Env>): Promise<Response> {
  try {
    if (request.method !== 'POST') return new Response(null, { status: 200 })
    const params = await request.json().catch(() => undefined)
    const graph = await runGraph(env, { payload: params })
    return Response.json(graph)
  } catch (error) {
    return Response.json({ message: error.message }, { status: 500 })
  }
}
```

`handlers/scheduled.ts`:

```ts
import type { ScheduledContext } from '#awaitstep/runtime'

// Runs on every cron trigger of this workflow; `cron` tells them apart.
export default async function ({ cron, scheduledTime, env }: ScheduledContext<Env>): Promise<void> {
  // ...
}
```

`handlers/queue/<queue-name>.ts`:

```ts
import type { QueueContext } from '#awaitstep/runtime'

// Consumer for the "orders" queue. Throw to have the batch retried.
export default async function ({ batch, env }: QueueContext<Env>): Promise<void> {
  for (const message of batch.messages) {
    // message.body
  }
}
```

## Contexts

Handlers use AwaitStep's own contexts, not Cloudflare's, so the same file
deploys to another provider unchanged:

| Context            | Fields                                                       |
| ------------------ | ------------------------------------------------------------ |
| `FetchContext`     | `{ request, env, execution }`                                |
| `QueueContext`     | `{ batch, env, execution }`, `batch.messages[].{ id, body }` |
| `ScheduledContext` | `{ cron, scheduledTime, env, execution }`                    |

`execution.waitUntil(promise)` keeps work alive after the handler returns. A
handler that throws makes the batch retried; a message's own ack/retry is not
portable and is not exposed.

## Rules

- **One file per entry.** A second `handlers/fetch.mjs` beside `handlers/fetch.ts`
  is refused: nothing would say which runs. The same goes for case variants that
  look like an entry (`handlers/Fetch.ts`): refused as "would never run".
- **Queue names** are lowercase letters, digits and inner hyphens, 1–63
  characters.
- **The handler imports the graph module**, not `#app/worker`:
  `#awaitstep/workflow` (`startWorkflow`, `workflowStatus`,
  `AWAITSTEP_RETENTION`) or `#awaitstep/function` (`runGraph`, and
  `AWAITSTEP_RETENTION` when the graph calls a sub-workflow). A cycle through `#app/worker` does not resolve.
- **Legacy `handlers.ts` never coexists** with `handlers/`. While it exists, a
  first handler-module write is refused; convert first.

## Legacy `handlers.ts`

An older project carries one annotated file (`@fetch`, `@queue`, `@scheduled`
functions). Read the plan without changing anything:

```bash
curl -sS "$AWAITSTEP_API_URL/workflows/$WF/project/convert-handlers$SCOPE" -H "$AUTH"
```

Convert it in one request:

```bash
curl -sS -X POST "$AWAITSTEP_API_URL/workflows/$WF/project/convert-handlers$SCOPE" -H "$AUTH"
```

The conversion writes the modules (create-only), deletes `handlers.ts`, folds
the annotations' crons/queues into the deployment configs, and keeps the names a
body used (`req`, `context`, `controller`, `ctx`) as local aliases. If it fails
midway, fixing the reported problem and retrying is safe.

## Trigger configuration

A cron or queue consumer is deployment configuration, not a handler field:

- crons come from the deployment config (and, for an older project, from the
  workflow's cron trigger);
- queues come from `handlers/queue/<name>.ts` and the producer binding;
- a consumer file alone is enough; the deploy surfaces a missing queue.

Do not put a schedule in the handler and expect the deploy to read it.
